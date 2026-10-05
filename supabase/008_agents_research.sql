-- BOLT LOG CRM - Güncelleme 008: Hedef ülkede acente / forwarder taraması, araştırılmamış lead'ler puanlanmaz
-- 007_places_discovery.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run
--
-- * Lead türü: customer (müşteri adayı) | agent (yurt dışı acente / forwarder). Acenteler müşteri kriterleriyle puanlanmaz.
-- * Araştırma durumu: Google taramasıyla gelen lead'ler 'pending' (araştırılacak) olarak eklenir ve
--   internetten araştırılana kadar puanlanmaz. Elle / CSV ile girilenlerde null kalır, eskisi gibi puanlanır.
-- * Arama kriterlerine acente bölümü: criteria.agents = { cities: [...], keywords: [...] }
--   Bu sorgular aramanın hedef ülkesinde çalışır (Türkiye'de değil).

alter table leads add column if not exists lead_type text not null default 'customer';
alter table leads add column if not exists research_status text; -- pending | done | failed (null: araştırma gerekmez)
create index if not exists leads_research_idx on leads (research_status) where research_status is not null;

alter table lead_search_queries add column if not exists country_code text not null default 'TR';

-- ============================================================
-- Puanlama: 006 ile aynı, sadece acenteler ve araştırılmamış lead'ler puanlanmaz
-- (yön ve mod tahmini yine yapılır, filtrelerde kullanılır)
-- ============================================================
create or replace function leads_score() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  cfg jsonb;
  crit jsonb;
  srch_country text;
  entries jsonb;
  matched jsonb;
  in_exp boolean;
  in_imp boolean;
  s int;
begin
  select lead_scoring into cfg from settings where id = 1;
  cfg := coalesce(cfg, '{}'::jsonb) - 'target_sectors' - 'target_cities' - 'target_markets';

  if new.search_id is not null and new.lead_type <> 'agent' then
    select criteria, country_code into crit, srch_country from lead_searches where id = new.search_id;
    if found then
      entries := coalesce(crit->'export', '[]'::jsonb) || coalesce(crit->'import', '[]'::jsonb);
      select coalesce(jsonb_agg(e), '[]'::jsonb) into matched
        from jsonb_array_elements(entries) e where e->>'sector' = any(coalesce(new.sectors, '{}'));
      cfg := cfg || jsonb_build_object(
        'target_sectors', (select coalesce(jsonb_agg(distinct e->>'sector'), '[]'::jsonb) from jsonb_array_elements(entries) e),
        'target_cities', (select coalesce(jsonb_agg(distinct c), '[]'::jsonb)
                          from jsonb_array_elements(case when jsonb_array_length(matched) > 0 then matched else entries end) e,
                               jsonb_array_elements_text(coalesce(e->'cities', '[]'::jsonb)) c),
        'target_markets', jsonb_build_array(srch_country));

      if new.direction is null then
        in_exp := exists (select 1 from jsonb_array_elements(coalesce(crit->'export', '[]'::jsonb)) e
                          where e->>'sector' = any(coalesce(new.sectors, '{}')));
        in_imp := exists (select 1 from jsonb_array_elements(coalesce(crit->'import', '[]'::jsonb)) e
                          where e->>'sector' = any(coalesce(new.sectors, '{}')));
        new.direction := case when in_exp and in_imp then 'both' when in_exp then 'export' when in_imp then 'import' end;
      end if;

      if coalesce(cardinality(array_remove(new.modes, '')), 0) = 0 and jsonb_array_length(matched) > 0 then
        new.modes := array(
          select m from (values ('sea_fcl', 1), ('sea_lcl', 2), ('air', 3)) as v(m, ord)
          where exists (
            select 1 from jsonb_array_elements(matched) e
            where (m in ('sea_fcl', 'sea_lcl') and coalesce(e->>'mode', 'sea') in ('sea', 'mixed'))
               or (m = 'air' and e->>'mode' in ('air', 'mixed')))
          order by ord);
      end if;
    end if;
  end if;

  if new.lead_type = 'agent' or new.research_status = 'pending' then
    new.score_items := '[]'::jsonb;
    new.score := 0;
    return new;
  end if;

  new.score_items := lead_score_items(new, cfg);
  select coalesce(round(100.0 * sum((i->>'weight')::int) filter (where (i->>'ok')::boolean)
                        / nullif(sum((i->>'weight')::int), 0)), 0)
    into s from jsonb_array_elements(new.score_items) i;
  new.score := s;
  return new;
end $$;

-- ============================================================
-- Sorgu planı: müşteri sorguları Türkiye'de, acente sorguları hedef ülkede
-- ============================================================
drop function if exists lead_search_plan_rows(uuid);
create function lead_search_plan_rows(p_search uuid)
returns table (direction text, sector text, city text, keyword text, query text, country_code text)
language sql stable set search_path = public, extensions as $$
  select distinct on (x.query) x.*
  from (
    select d.dir as direction, e->>'sector' as sector, c as city, k as keyword, k || ' ' || c as query, 'TR' as country_code
    from lead_searches s
    cross join (values ('export'), ('import')) d(dir)
    cross join lateral jsonb_array_elements(coalesce(s.criteria->d.dir, '[]'::jsonb)) e
    left join sector_regions r on r.sector = e->>'sector'
    cross join lateral unnest(coalesce(
      nullif(case when d.dir = 'export' then r.export_keywords else r.import_keywords end, '{}'),
      array[replace(e->>'sector', ' & ', ' ') || case when d.dir = 'export' then ' üreticisi' else ' ithalatçısı' end])) k
    cross join lateral jsonb_array_elements_text(coalesce(e->'cities', '[]'::jsonb)) c
    where s.id = p_search
    union all
    select 'agent', 'Lojistik', c, k, k || ' ' || c, s.country_code
    from lead_searches s
    cross join lateral jsonb_array_elements_text(coalesce(s.criteria->'agents'->'keywords', '[]'::jsonb)) k
    cross join lateral jsonb_array_elements_text(coalesce(s.criteria->'agents'->'cities', '[]'::jsonb)) c
    where s.id = p_search
  ) x
  order by x.query, x.direction
$$;

create or replace function lead_search_plan(p_search uuid) returns jsonb
language plpgsql set search_path = public, extensions as $$
begin
  if not exists (select 1 from lead_searches where id = p_search) then raise exception 'Arama bulunamadı.'; end if;

  delete from lead_search_queries q
  where q.search_id = p_search and q.status <> 'done'
    and not exists (select 1 from lead_search_plan_rows(p_search) p where p.query = q.query);

  insert into lead_search_queries (search_id, direction, sector, city, keyword, query, country_code)
  select p_search, p.direction, p.sector, p.city, p.keyword, p.query, p.country_code from lead_search_plan_rows(p_search) p
  on conflict (search_id, query) do nothing;

  return (select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where status = 'pending'),
    'done', count(*) filter (where status = 'done'),
    'error', count(*) filter (where status = 'error'))
  from lead_search_queries where search_id = p_search);
end $$;

-- ============================================================
-- Google sonuçlarını ekleme: acente sorgularında ülke hedef ülke, tür agent; hepsi "araştırılacak"
-- p_items: [{ place_id, name, city, address, website, phone, category, country_name }]
-- ============================================================
create or replace function lead_discovered_insert(p_query uuid, p_items jsonb) returns int
language plpgsql set search_path = public, extensions as $$
declare
  qr lead_search_queries;
  srch_country text;
  it jsonb;
  d text;
  k text;
  n int := 0;
begin
  select * into qr from lead_search_queries where id = p_query;
  if not found then raise exception 'Sorgu bulunamadı.'; end if;
  select country into srch_country from lead_searches where id = qr.search_id;

  for it in select * from jsonb_array_elements(p_items) loop
    continue when coalesce(it->>'place_id', '') = '' or coalesce(it->>'name', '') = '';
    continue when exists (select 1 from leads where google_place_id = it->>'place_id');

    d := nullif(lower(regexp_replace(regexp_replace(coalesce(it->>'website', ''), '^\s*([a-z]+://)?(www\.)?', '', 'i'), '[/?#:].*$', '')), '');
    -- Sosyal medya / ortak barındırma adresleri firmayı tanımlamaz
    if d ~ '(^|\.)(facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|wa\.me|whatsapp\.com|linktr\.ee|business\.site|sites\.google\.com|google\.com|wixsite\.com|blogspot\.com)$' then
      d := null;
    end if;
    continue when d is not null and (exists (select 1 from leads where domain = d) or exists (select 1 from companies where domain = d));

    k := name_key(it->>'name');
    continue when k <> '' and (exists (select 1 from leads where name_key(name) = k) or exists (select 1 from companies where name_key(name) = k));

    insert into leads (name, sectors, country, country_code, city, address, website, phones,
                       source, source_detail, search_id, google_place_id, notes, lead_type, research_status)
    values (it->>'name', array[qr.sector],
            case when qr.country_code = 'TR' then 'Türkiye' else coalesce(nullif(it->>'country_name', ''), srch_country) end,
            qr.country_code, nullif(it->>'city', ''), nullif(it->>'address', ''),
            nullif(it->>'website', ''), array_remove(array[nullif(it->>'phone', '')], null),
            'Google Maps', qr.query, qr.search_id, it->>'place_id',
            case when coalesce(it->>'category', '') <> '' then 'Google kategorisi: ' || (it->>'category') end,
            case when qr.direction = 'agent' then 'agent' else 'customer' end, 'pending')
    -- Aynı anda çalışan başka bir tarama aynı firmayı eklemiş olabilir
    on conflict (google_place_id) where google_place_id is not null do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ============================================================
-- Lead → Firma: acente lead'i Acente olarak açılır (müşteriye çevrilmez)
-- ============================================================
create or replace function convert_lead(p_lead uuid, p_company uuid default null, p_opp_title text default null, p_opp_mode text default null)
returns uuid
language plpgsql as $$
declare
  l leads;
  v_company uuid;
  v_contact uuid;
begin
  select * into l from leads where id = p_lead for update;
  if not found then raise exception 'Lead bulunamadı.'; end if;
  if l.status = 'converted' then raise exception 'Bu lead zaten firmaya dönüştürülmüş.'; end if;

  if p_company is null then
    insert into companies (name, type, sectors, country, country_code, city, address, phones, emails, website, source, notes)
    values (l.name, case when l.lead_type = 'agent' then 'agent' else 'customer' end, coalesce(l.sectors, '{}'),
            l.country, l.country_code, l.city, l.address,
            array_remove(coalesce(l.phones, '{}'), ''), array_remove(coalesce(l.emails, '{}'), ''), l.website, l.source, l.notes)
    returning id into v_company;
  else
    v_company := p_company;
    -- Potansiyel müşteri olarak kayıtlıysa müşteriye çevrilir
    if l.lead_type <> 'agent' then
      update companies set type = 'customer' where id = v_company and type = 'prospect';
    end if;
  end if;

  if coalesce(l.contact_name, '') <> '' then
    insert into contacts (company_id, full_name, title, email, phone, is_primary, notes)
    values (v_company, l.contact_name, l.contact_title, l.contact_email, l.contact_phone, p_company is null, l.linkedin_url)
    returning id into v_contact;
  end if;

  if coalesce(p_opp_title, '') <> '' then
    insert into opportunities (title, company_id, contact_id, stage, mode, volume_note, expected_close, sort)
    values (p_opp_title, v_company, v_contact, 'won', nullif(p_opp_mode, ''), l.est_volume,
            (now() at time zone 'Europe/Istanbul')::date, extract(epoch from now()) * 1000);
  end if;

  insert into activities (company_id, contact_id, type, subject, body, activity_date)
  select v_company, v_contact,
    case when a.type in ('call', 'email', 'meeting', 'note') then a.type else 'note' end,
    case a.type when 'call' then 'Telefon' when 'email' then 'E-posta' when 'linkedin' then 'LinkedIn'
                when 'meeting' then 'Toplantı / Ziyaret' else 'Not' end
      || coalesce(' – ' || case a.outcome
           when 'no_answer' then 'Ulaşılamadı' when 'reached' then 'Görüşüldü' when 'interested' then 'İlgileniyor'
           when 'not_interested' then 'İlgilenmiyor' when 'callback' then 'Tekrar aranacak' when 'wrong_info' then 'Bilgi hatalı'
         end, '')
      || ' (lead dönemi)',
    a.note, a.activity_date
  from lead_activities a where a.lead_id = p_lead;

  update leads set status = 'converted', company_id = v_company, converted_at = now() where id = p_lead;
  return v_company;
end $$;

-- Daha önce Google'dan gelenler araştırılacak olarak işaretlenir ve puanları sıfırlanır
update leads set research_status = 'pending' where google_place_id is not null and research_status is null;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
