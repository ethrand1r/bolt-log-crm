-- BOLT LOG CRM - Güncelleme 005: Ülke bazlı lead aramaları, dönüştürmede Müşteri + "Kazanıldı"
-- 004_leads.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run

-- ============================================================
-- Lead aramaları
-- Arama bir hedef ülke için açılır. Türkiye ↔ ülke ticaret verisinden (UN Comtrade) ihracat ve
-- ithalat yönünde hedef sektörler ve her sektörün hedef bölgeleri (iller) çıkarılır, kullanıcı
-- onaylayınca criteria alanına kaydedilir:
--   { year, prev_year,
--     export: [{ sector, value, prev_value, share, mode, hs: [...], cities: [...] }],
--     import: [ ...aynı yapı ] }
-- Aramaya bağlı lead'ler bu hedeflere göre puanlanır, yönleri otomatik belirlenir.
-- ============================================================
create table if not exists lead_searches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text not null,
  country text,
  criteria jsonb not null default '{"export": [], "import": []}'::jsonb,
  notes text,
  status text not null default 'active', -- active | archived
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace trigger lead_searches_updated before update on lead_searches for each row execute function set_updated_at();

alter table leads add column if not exists search_id uuid references lead_searches(id) on delete set null;
create index if not exists leads_search_idx on leads (search_id);

-- Comtrade verisi önbelleği (aynı ülke 30 gün içinde tekrar çekilmez)
create table if not exists trade_cache (
  country_code text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Sektörlerin Türkiye'de yoğunlaştığı iller (ilk 5). Ayarlar'dan düzenlenebilir.
create table if not exists sector_regions (
  sector text primary key,
  cities text[] not null default '{}'
);
insert into sector_regions (sector, cities) values
  ('Tekstil & Hazır Giyim',     '{Istanbul,Bursa,Denizli,Gaziantep,Kahramanmaras}'),
  ('Ev Tekstili & Halı',        '{Gaziantep,Denizli,Bursa,Usak,Kayseri}'),
  ('Deri & Ayakkabı',           '{Istanbul,Izmir,Konya,Usak,Gaziantep}'),
  ('Otomotiv & Yedek Parça',    '{Bursa,Kocaeli,Sakarya,Istanbul,Konya}'),
  ('Makine & Ekipman',          '{Istanbul,Konya,Bursa,Kocaeli,Manisa}'),
  ('Elektrik & Elektronik',     '{Istanbul,Manisa,Ankara,Kocaeli,Tekirdag}'),
  ('Beyaz Eşya',                '{Manisa,Tekirdag,Eskisehir,Istanbul,Bolu}'),
  ('Demir-Çelik & Metal',       '{Hatay,Kocaeli,Zonguldak,Karabuk,Izmir}'),
  ('Madencilik & Doğal Taş',    '{Afyonkarahisar,Denizli,Balikesir,Elazig,Mugla}'),
  ('Kimya',                     '{Kocaeli,Istanbul,Izmir,Adana,Tekirdag}'),
  ('Plastik & Kauçuk',          '{Istanbul,Kocaeli,Tekirdag,Bursa,Gaziantep}'),
  ('İlaç & Medikal',            '{Istanbul,Kocaeli,Tekirdag,Ankara,Izmir}'),
  ('Kozmetik & Kişisel Bakım',  '{Istanbul,Kocaeli,Tekirdag,Izmir,Bursa}'),
  ('Gıda',                      '{Istanbul,Izmir,Bursa,Konya,Gaziantep}'),
  ('Taze Meyve & Sebze',        '{Mersin,Antalya,Adana,Izmir,Bursa}'),
  ('Kuru Gıda & Kuruyemiş',     '{Ordu,Giresun,Malatya,Gaziantep,Izmir}'),
  ('Hububat & Bakliyat',        '{Konya,Mersin,Gaziantep,Sanliurfa,Adana}'),
  ('Su Ürünleri',               '{Mugla,Izmir,Trabzon,Samsun,Istanbul}'),
  ('Et & Süt Ürünleri',         '{Izmir,Konya,Balikesir,Bursa,Afyonkarahisar}'),
  ('İçecek',                    '{Istanbul,Izmir,Bursa,Manisa,Ankara}'),
  ('Tarım & Hayvancılık',       '{Konya,Adana,Sanliurfa,Izmir,Bursa}'),
  ('Mobilya',                   '{Kayseri,Bursa,Ankara,Istanbul,Izmir}'),
  ('İnşaat Malzemeleri',        '{Istanbul,Kocaeli,Ankara,Izmir,Eskisehir}'),
  ('Cam & Seramik',             '{Kutahya,Bilecik,Eskisehir,Kirklareli,Istanbul}'),
  ('Kağıt & Ambalaj',           '{Istanbul,Kocaeli,Izmir,Bursa,Adana}'),
  ('Orman Ürünleri',            '{Kocaeli,Bolu,Duzce,Kastamonu,Balikesir}'),
  ('Enerji & Yenilenebilir',    '{Istanbul,Ankara,Izmir,Kocaeli,Manisa}'),
  ('Savunma & Havacılık',       '{Ankara,Istanbul,Eskisehir,Kocaeli,Konya}'),
  ('Mücevher & Değerli Taş',    '{Istanbul,Izmir,Gaziantep,Trabzon,Mardin}'),
  ('Oyuncak & Kırtasiye',       '{Istanbul,Izmir,Bursa,Kocaeli,Ankara}')
on conflict (sector) do nothing;

-- Lead araması ayarları: otomatik sektör seçimi kuralı ve her zaman eklenen iller
alter table settings add column if not exists lead_config jsonb default '{
  "coverage": 80,
  "max_sectors": 10,
  "always_cities": ["Istanbul", "Ankara", "Izmir"],
  "excluded_sectors": ["Enerji & Yenilenebilir", "Diğer"]
}'::jsonb;

-- Genel puanlama ayarlarında artık sadece ağırlıklar ve aramadan bağımsız kriterler kalır
update settings set lead_scoring = lead_scoring - 'target_sectors' - 'target_cities' - 'target_markets' where id = 1;
alter table settings alter column lead_scoring set default '{
  "w_sector": 25, "w_city": 10, "w_market": 10,
  "w_exports": 20, "target_modes": ["sea_fcl", "sea_lcl", "air"], "w_mode": 15,
  "min_employees": 50, "w_size": 10, "w_contact": 5, "w_person": 5, "w_website": 0
}'::jsonb;

create or replace function lead_score_items(l leads, cfg jsonb) returns jsonb
language sql stable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'weight', w, 'ok', ok) order by ord), '[]'::jsonb)
  from (values
    (1, 'sector', 'Aramanın hedef sektöründe',
      case when coalesce(jsonb_array_length(cfg->'target_sectors'), 0) = 0 then 0 else coalesce((cfg->>'w_sector')::int, 0) end,
      case when coalesce(cardinality(l.sectors), 0) = 0 then null
           else l.sectors && array(select jsonb_array_elements_text(cfg->'target_sectors')) end),
    (2, 'city', 'Aramanın hedef bölgesinde',
      case when coalesce(jsonb_array_length(cfg->'target_cities'), 0) = 0 then 0 else coalesce((cfg->>'w_city')::int, 0) end,
      case when coalesce(l.city, '') = '' then null
           else norm_txt(l.city) in (select norm_txt(x) from jsonb_array_elements_text(cfg->'target_cities') x) end),
    (3, 'exports', 'İhracat yapıyor',
      coalesce((cfg->>'w_exports')::int, 0),
      l.exports),
    (4, 'mode', 'Taşıma modu uygun',
      case when coalesce(jsonb_array_length(cfg->'target_modes'), 0) = 0 then 0 else coalesce((cfg->>'w_mode')::int, 0) end,
      case when coalesce(cardinality(l.modes), 0) = 0 then null
           else l.modes && array(select jsonb_array_elements_text(cfg->'target_modes')) end),
    (5, 'market', 'Aramanın ülkesiyle ticaret yapıyor',
      case when coalesce(jsonb_array_length(cfg->'target_markets'), 0) = 0 then 0 else coalesce((cfg->>'w_market')::int, 0) end,
      case when coalesce(cardinality(l.target_markets), 0) = 0 then null
           else l.target_markets && array(select jsonb_array_elements_text(cfg->'target_markets')) end),
    (6, 'size', 'Firma büyüklüğü (' || coalesce(cfg->>'min_employees', '0') || '+ çalışan)',
      case when coalesce((cfg->>'min_employees')::int, 0) = 0 then 0 else coalesce((cfg->>'w_size')::int, 0) end,
      case when l.employees is null then null else l.employees >= (cfg->>'min_employees')::int end),
    (7, 'contact', 'İletişim bilgisi var',
      coalesce((cfg->>'w_contact')::int, 0),
      coalesce(cardinality(array_remove(l.emails, '')), 0) > 0 or coalesce(cardinality(array_remove(l.phones, '')), 0) > 0
        or coalesce(l.contact_email, '') <> '' or coalesce(l.contact_phone, '') <> ''),
    (8, 'person', 'İrtibat kişisi belli',
      coalesce((cfg->>'w_person')::int, 0),
      coalesce(l.contact_name, '') <> ''),
    (9, 'website', 'Web sitesi var',
      coalesce((cfg->>'w_website')::int, 0),
      coalesce(l.website, '') <> '')
  ) as c(ord, key, label, w, ok)
  where w > 0
$$;

-- Ağırlıklar genel ayarlardan, hedefler lead'in aramasından gelir:
--   sektör: aramanın ihracat + ithalat sektörleri
--   bölge:  lead'in sektörüne denk gelen arama sektörlerinin illeri (sektör eşleşmezse tüm iller)
--   pazar:  aramanın ülkesi
-- Yön boşsa sektöre göre otomatik atanır: ihracat listesinde → export, ithalat → import, ikisinde → both
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

  if new.search_id is not null then
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
    end if;
  end if;

  new.score_items := lead_score_items(new, cfg);
  select coalesce(round(100.0 * sum((i->>'weight')::int) filter (where (i->>'ok')::boolean)
                        / nullif(sum((i->>'weight')::int), 0)), 0)
    into s from jsonb_array_elements(new.score_items) i;
  new.score := s;
  return new;
end $$;

-- Aramanın kriterleri değişince o aramadaki lead'ler yeniden puanlanır
create or replace function lead_search_rescore() returns trigger
language plpgsql as $$
begin
  update leads set score = score where search_id = new.id;
  return new;
end $$;
create or replace trigger lead_searches_rescore after update on lead_searches
  for each row when (old.criteria is distinct from new.criteria or old.country_code is distinct from new.country_code)
  execute function lead_search_rescore();

-- Mevcut lead'leri yeni kurala göre puanla (genel hedefler kalktı)
update leads set score = score where id is not null;

-- ============================================================
-- Lead → Firma: firma Müşteri (cari) olarak açılır, fırsat "Kazanıldı" aşamasına düşer
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
    values (l.name, 'customer', coalesce(l.sectors, '{}'), l.country, l.country_code, l.city, l.address,
            array_remove(coalesce(l.phones, '{}'), ''), array_remove(coalesce(l.emails, '{}'), ''), l.website, l.source, l.notes)
    returning id into v_company;
  else
    v_company := p_company;
    -- Potansiyel müşteri olarak kayıtlıysa müşteriye çevrilir
    update companies set type = 'customer' where id = v_company and type = 'prospect';
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

-- ============================================================
-- Güvenlik (yeni tablolar)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['lead_searches', 'trade_cache', 'sector_regions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
