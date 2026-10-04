-- BOLT LOG CRM - Güncelleme 004: Lead Generation
-- 003_update.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run

create extension if not exists unaccent;

-- Türkçe karakter ve büyük/küçük harf duyarsız karşılaştırma (İzmir = izmir = Izmir)
create or replace function norm_txt(t text) returns text
language sql stable set search_path = public, extensions as $$
  select lower(unaccent(replace(replace(coalesce(t, ''), 'ı', 'i'), 'İ', 'I')))
$$;

-- ============================================================
-- Lead havuzu
-- ============================================================
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sectors text[] default '{}',
  country text,
  country_code text,
  city text,
  address text,
  website text,
  -- Mükerrer kontrolü için: "https://www.abc.com.tr/tr/" → "abc.com.tr"
  domain text generated always as (
    nullif(lower(regexp_replace(regexp_replace(coalesce(website, ''), '^\s*([a-z]+://)?(www\.)?', '', 'i'), '[/?#:].*$', '')), '')
  ) stored,
  linkedin_url text,
  phones text[] default '{}',
  emails text[] default '{}',
  contact_name text,
  contact_title text,
  contact_email text,
  contact_phone text,
  source text,
  source_detail text,                 -- fuar adı, liste adı, arama sorgusu…
  exports boolean,                    -- ihracat yapıyor mu (null: bilinmiyor)
  employees int,
  modes text[] default '{}',          -- sea_fcl | sea_lcl | air | road
  direction text,                     -- export | import | both
  target_markets text[] default '{}', -- satış yaptığı ülkeler (kod: DE, US…)
  est_volume text,
  status text not null default 'new',
  -- new | contacted | interested | qualified | disqualified | converted
  disqualify_reason text,
  score int not null default 0,       -- 0-100, trigger ile otomatik hesaplanır
  score_items jsonb default '[]'::jsonb,
  next_action_date date,
  next_action_note text,
  last_contact_at timestamptz,
  company_id uuid references companies(id) on delete set null,
  converted_at timestamptz,
  notes text,
  tags text[] default '{}',
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists leads_status_idx on leads (status);
create index if not exists leads_domain_idx on leads (domain);
create index if not exists leads_next_action_idx on leads (next_action_date);
create or replace trigger leads_updated before update on leads for each row execute function set_updated_at();

-- ============================================================
-- Lead temas logu (arama, e-posta, LinkedIn, ziyaret, not)
-- ============================================================
create table if not exists lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  type text not null default 'call',  -- call | email | linkedin | meeting | note
  outcome text,                       -- no_answer | reached | interested | not_interested | callback | wrong_info
  note text,
  activity_date timestamptz default now(),
  next_action_date date,
  next_action_note text,
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists lead_activities_lead_idx on lead_activities (lead_id);

-- Temas kaydedilince lead'in son temas, sonraki adım ve durum bilgisi güncellenir
create or replace function lead_activity_apply() returns trigger
language plpgsql as $$
begin
  update leads set
    last_contact_at = case when new.type = 'note' then last_contact_at
                           else greatest(coalesce(last_contact_at, new.activity_date), new.activity_date) end,
    next_action_date = case when new.type = 'note' and new.next_action_date is null then next_action_date else new.next_action_date end,
    next_action_note = case when new.type = 'note' and new.next_action_date is null then next_action_note else new.next_action_note end,
    status = case
      when status in ('new', 'contacted') and new.outcome = 'interested' then 'interested'
      when status = 'new' and new.type <> 'note' then 'contacted'
      else status end
  where id = new.lead_id;
  return new;
end $$;
create or replace trigger lead_activities_apply after insert on lead_activities
  for each row execute function lead_activity_apply();

-- ============================================================
-- Otomatik puanlama
-- Kriterler Ayarlar > Lead puanlama'dan yönetilir (settings.lead_scoring).
-- Ağırlığı 0 olan veya hedef listesi boş olan kriter hesaba katılmaz.
-- Puan = sağlanan kriterlerin ağırlığı / tüm aktif kriterlerin ağırlığı × 100
-- Bilgisi olmayan kriter (ör. ihracat durumu bilinmiyor) puan getirmez, ok = null olarak gösterilir.
-- ============================================================
alter table settings add column if not exists lead_scoring jsonb default '{
  "target_sectors": ["Tekstil & Hazır Giyim", "Ev Tekstili & Halı", "Otomotiv & Yedek Parça", "Makine & Ekipman",
                     "Mobilya", "Gıda", "Kimya", "Demir-Çelik & Metal", "Elektrik & Elektronik"],
  "w_sector": 25,
  "target_cities": ["Istanbul", "Bursa", "Kocaeli", "Izmir", "Manisa", "Denizli", "Gaziantep", "Kayseri",
                    "Konya", "Mersin", "Tekirdag", "Sakarya", "Ankara"],
  "w_city": 10,
  "w_exports": 20,
  "target_modes": ["sea_fcl", "sea_lcl", "air"],
  "w_mode": 15,
  "target_markets": [],
  "w_market": 10,
  "min_employees": 50,
  "w_size": 10,
  "w_contact": 5,
  "w_person": 5,
  "w_website": 0
}'::jsonb;

create or replace function lead_score_items(l leads, cfg jsonb) returns jsonb
language sql stable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'weight', w, 'ok', ok) order by ord), '[]'::jsonb)
  from (values
    (1, 'sector', 'Hedef sektörde',
      case when coalesce(jsonb_array_length(cfg->'target_sectors'), 0) = 0 then 0 else coalesce((cfg->>'w_sector')::int, 0) end,
      case when coalesce(cardinality(l.sectors), 0) = 0 then null
           else l.sectors && array(select jsonb_array_elements_text(cfg->'target_sectors')) end),
    (2, 'city', 'Hedef bölgede',
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
    (5, 'market', 'Hedef pazarlara satıyor',
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

create or replace function leads_score() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  cfg jsonb;
  s int;
begin
  select lead_scoring into cfg from settings where id = 1;
  new.score_items := lead_score_items(new, coalesce(cfg, '{}'::jsonb));
  select coalesce(round(100.0 * sum((i->>'weight')::int) filter (where (i->>'ok')::boolean)
                        / nullif(sum((i->>'weight')::int), 0)), 0)
    into s from jsonb_array_elements(new.score_items) i;
  new.score := s;
  return new;
end $$;
create or replace trigger leads_score before insert or update on leads
  for each row execute function leads_score();

-- Puanlama kriterleri değişince tüm lead'ler yeniden puanlanır
create or replace function settings_rescore_leads() returns trigger
language plpgsql as $$
begin
  update leads set score = score where id is not null;
  return new;
end $$;
create or replace trigger settings_lead_scoring after update of lead_scoring on settings
  for each row when (old.lead_scoring is distinct from new.lead_scoring) execute function settings_rescore_leads();

-- ============================================================
-- Lead → Firma + Kişi + Fırsat (tek işlemde)
-- p_company verilirse yeni firma açılmaz, lead mevcut firmaya bağlanır.
-- p_opp_title boşsa fırsat oluşturulmaz. Temas logu firmanın aktivite geçmişine kopyalanır.
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
    values (l.name, 'prospect', coalesce(l.sectors, '{}'), l.country, l.country_code, l.city, l.address,
            array_remove(coalesce(l.phones, '{}'), ''), array_remove(coalesce(l.emails, '{}'), ''), l.website, l.source, l.notes)
    returning id into v_company;
  else
    v_company := p_company;
  end if;

  if coalesce(l.contact_name, '') <> '' then
    insert into contacts (company_id, full_name, title, email, phone, is_primary, notes)
    values (v_company, l.contact_name, l.contact_title, l.contact_email, l.contact_phone, p_company is null, l.linkedin_url)
    returning id into v_contact;
  end if;

  if coalesce(p_opp_title, '') <> '' then
    insert into opportunities (title, company_id, contact_id, stage, mode, volume_note, sort)
    values (p_opp_title, v_company, v_contact, 'lead', nullif(p_opp_mode, ''), l.est_volume, extract(epoch from now()) * 1000);
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
  foreach t in array array['leads', 'lead_activities'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
