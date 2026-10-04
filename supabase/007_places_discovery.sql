-- BOLT LOG CRM - Güncelleme 007: Google Places ile otomatik firma taraması
-- 006_lead_modes.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run
--
-- Akış: aramanın kriterlerinden (yön × sektör × il × anahtar kelime) sorgu planı çıkarılır →
-- places-search Edge Function bekleyen sorguları Google'da çalıştırır → bulunan firmalar mükerrer
-- kontrolünden geçip lead havuzuna eklenir ve mevcut trigger ile puanlanır.

-- ============================================================
-- Lead'in Google kaydı (aynı firma farklı sorgularda tekrar eklenmesin)
-- ============================================================
alter table leads add column if not exists google_place_id text;
create unique index if not exists leads_google_place_idx on leads (google_place_id) where google_place_id is not null;

-- Firmalarda da web sitesinden türetilen alan adı (mükerrer kontrolü için, leads.domain ile aynı kural)
alter table companies add column if not exists domain text generated always as (
  nullif(lower(regexp_replace(regexp_replace(coalesce(website, ''), '^\s*([a-z]+://)?(www\.)?', '', 'i'), '[/?#:].*$', '')), '')
) stored;
create index if not exists companies_domain_idx on companies (domain);

-- "ABC Tekstil San. ve Tic. A.Ş." → "abc tekstil" (src/lib/leads.ts nameKey ile aynı kural)
create or replace function name_key(t text) returns text
language sql stable set search_path = public, extensions as $$
  select coalesce(string_agg(w, ' ' order by ord), '')
  from regexp_split_to_table(regexp_replace(norm_txt(t), '[^a-z0-9]+', ' ', 'g'), ' ') with ordinality as x(w, ord)
  where w <> '' and w <> all (array[
    'as', 'a', 's', 'anonim', 'sirketi', 'sti', 'ltd', 'limited', 'san', 'sanayi', 've', 'tic', 'ticaret', 'ith', 'ihr',
    'ithalat', 'ihracat', 'paz', 'pazarlama', 'dis', 'ins', 'insaat', 'taah', 'tur', 'koll', 'kollektif', 'inc', 'llc',
    'gmbh', 'co', 'corp', 'company', 'srl', 'spa', 'bv', 'sa', 'the'])
$$;

-- ============================================================
-- Sektör anahtar kelimeleri (Google'da "<anahtar kelime> <il>" olarak aranır). Ayarlar'dan düzenlenebilir.
-- ============================================================
alter table sector_regions add column if not exists export_keywords text[] not null default '{}';
alter table sector_regions add column if not exists import_keywords text[] not null default '{}';

update sector_regions r set export_keywords = v.ex, import_keywords = v.im
from (values
  ('Tekstil & Hazır Giyim',     '{hazır giyim üreticisi}'::text[],      '{kumaş iplik ithalatçısı}'::text[]),
  ('Ev Tekstili & Halı',        '{ev tekstili üreticisi}',              '{ev tekstili ithalatçısı}'),
  ('Deri & Ayakkabı',           '{ayakkabı üreticisi}',                 '{deri ithalatçısı}'),
  ('Otomotiv & Yedek Parça',    '{otomotiv yan sanayi}',                '{oto yedek parça ithalatçısı}'),
  ('Makine & Ekipman',          '{makine imalatı}',                     '{makine ithalatçısı}'),
  ('Elektrik & Elektronik',     '{elektrik malzemeleri üreticisi}',     '{elektronik ithalatçısı}'),
  ('Beyaz Eşya',                '{beyaz eşya yan sanayi}',              '{beyaz eşya ithalatçısı}'),
  ('Demir-Çelik & Metal',       '{metal işleme fabrikası}',             '{çelik ithalatçısı}'),
  ('Madencilik & Doğal Taş',    '{mermer fabrikası}',                   '{maden ithalatçısı}'),
  ('Kimya',                     '{kimya sanayi}',                       '{kimyasal ithalatçısı}'),
  ('Plastik & Kauçuk',          '{plastik üreticisi}',                  '{plastik hammadde ithalatçısı}'),
  ('İlaç & Medikal',            '{medikal ürün üreticisi}',             '{medikal ithalatçısı}'),
  ('Kozmetik & Kişisel Bakım',  '{kozmetik üreticisi}',                 '{kozmetik ithalatçısı}'),
  ('Gıda',                      '{gıda üreticisi}',                     '{gıda ithalatçısı}'),
  ('Taze Meyve & Sebze',        '{meyve sebze ihracatçısı}',            '{meyve ithalatçısı}'),
  ('Kuru Gıda & Kuruyemiş',     '{kuruyemiş fabrikası}',                '{kuruyemiş ithalatçısı}'),
  ('Hububat & Bakliyat',        '{bakliyat fabrikası}',                 '{hububat ithalatçısı}'),
  ('Su Ürünleri',               '{su ürünleri ihracatçısı}',            '{su ürünleri ithalatçısı}'),
  ('Et & Süt Ürünleri',         '{süt ürünleri fabrikası}',             '{et ithalatçısı}'),
  ('İçecek',                    '{içecek fabrikası}',                   '{içecek ithalatçısı}'),
  ('Tarım & Hayvancılık',       '{tarım ürünleri ihracatçısı}',         '{tarım ürünleri ithalatçısı}'),
  ('Mobilya',                   '{mobilya fabrikası}',                  '{mobilya ithalatçısı}'),
  ('İnşaat Malzemeleri',        '{yapı malzemeleri üreticisi}',         '{yapı malzemeleri ithalatçısı}'),
  ('Cam & Seramik',             '{seramik fabrikası}',                  '{seramik ithalatçısı}'),
  ('Kağıt & Ambalaj',           '{ambalaj üreticisi}',                  '{kağıt ithalatçısı}'),
  ('Orman Ürünleri',            '{kereste fabrikası}',                  '{kereste ithalatçısı}'),
  ('Enerji & Yenilenebilir',    '{enerji ekipmanları üreticisi}',       '{güneş paneli ithalatçısı}'),
  ('Savunma & Havacılık',       '{savunma sanayi firması}',             '{havacılık ekipmanları ithalatçısı}'),
  ('Mücevher & Değerli Taş',    '{kuyum imalatçısı}',                   '{mücevher ithalatçısı}'),
  ('Oyuncak & Kırtasiye',       '{oyuncak üreticisi}',                  '{kırtasiye ithalatçısı}')
) as v(sector, ex, im)
where r.sector = v.sector and r.export_keywords = '{}' and r.import_keywords = '{}';

-- Tarama ayarları: sorgu başına sayfa (1 sayfa = en fazla 20 firma) ve aylık istek sınırı
-- (Google Places Text Search: ayda 1.000 istek ücretsiz; 900'de durarak pay bırakılır)
update settings set lead_config = '{"places_pages": 1, "places_monthly_limit": 900}'::jsonb || coalesce(lead_config, '{}'::jsonb) where id = 1;
alter table settings alter column lead_config set default '{
  "coverage": 80,
  "max_sectors": 10,
  "always_cities": ["Istanbul", "Ankara", "Izmir"],
  "excluded_sectors": ["Enerji & Yenilenebilir", "Diğer"],
  "places_pages": 1,
  "places_monthly_limit": 900
}'::jsonb;

-- ============================================================
-- Arama sorguları (tarama planı)
-- ============================================================
create table if not exists lead_search_queries (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references lead_searches(id) on delete cascade,
  direction text not null,              -- export | import
  sector text not null,
  city text not null,
  keyword text not null,
  query text not null,                  -- Google'a giden metin: "<keyword> <city>"
  status text not null default 'pending', -- pending | done | error
  found int not null default 0,         -- Google'ın döndürdüğü firma
  inserted int not null default 0,      -- mükerrer olmayıp havuza eklenen
  requests int not null default 0,      -- harcanan Google isteği
  error text,
  ran_at timestamptz,
  created_at timestamptz default now(),
  unique (search_id, query)
);
create index if not exists lead_search_queries_status_idx on lead_search_queries (search_id, status);

-- Harici API kullanımı (aylık)
create table if not exists api_usage (
  month date not null,
  api text not null,
  requests int not null default 0,
  primary key (month, api)
);

create or replace function api_usage_add(p_api text, p_n int) returns int
language sql as $$
  insert into api_usage (month, api, requests) values (date_trunc('month', now())::date, p_api, p_n)
  on conflict (month, api) do update set requests = api_usage.requests + excluded.requests
  returning requests
$$;

-- Aramanın kriterlerinden çıkan sorgular: her yön × sektör × anahtar kelime × il.
-- Sektörün anahtar kelimesi yoksa sektör adından türetilir. Aynı metin iki yönde çıkarsa bir kez (ihracat) aranır.
create or replace function lead_search_plan_rows(p_search uuid)
returns table (direction text, sector text, city text, keyword text, query text)
language sql stable set search_path = public, extensions as $$
  select distinct on (k || ' ' || c) d.dir, e->>'sector', c, k, k || ' ' || c
  from lead_searches s
  cross join (values ('export'), ('import')) d(dir)
  cross join lateral jsonb_array_elements(coalesce(s.criteria->d.dir, '[]'::jsonb)) e
  left join sector_regions r on r.sector = e->>'sector'
  cross join lateral unnest(coalesce(
    nullif(case when d.dir = 'export' then r.export_keywords else r.import_keywords end, '{}'),
    array[replace(e->>'sector', ' & ', ' ') || case when d.dir = 'export' then ' üreticisi' else ' ithalatçısı' end])) k
  cross join lateral jsonb_array_elements_text(coalesce(e->'cities', '[]'::jsonb)) c
  where s.id = p_search
  order by k || ' ' || c, d.dir
$$;

-- Aramanın kriterlerinden sorgu planını çıkarır / günceller.
-- Kriterlerde artık olmayan bekleyen/hatalı sorgular silinir, çalışmış olanlar geçmiş olarak kalır.
create or replace function lead_search_plan(p_search uuid) returns jsonb
language plpgsql set search_path = public, extensions as $$
begin
  if not exists (select 1 from lead_searches where id = p_search) then raise exception 'Arama bulunamadı.'; end if;

  delete from lead_search_queries q
  where q.search_id = p_search and q.status <> 'done'
    and not exists (select 1 from lead_search_plan_rows(p_search) p where p.query = q.query);

  insert into lead_search_queries (search_id, direction, sector, city, keyword, query)
  select p_search, p.direction, p.sector, p.city, p.keyword, p.query from lead_search_plan_rows(p_search) p
  on conflict (search_id, query) do nothing;

  return (select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where status = 'pending'),
    'done', count(*) filter (where status = 'done'),
    'error', count(*) filter (where status = 'error'))
  from lead_search_queries where search_id = p_search);
end $$;

-- Google'dan gelen firmaları mükerrer kontrolüyle lead havuzuna ekler, eklenen sayısını döner.
-- Mükerrer: aynı Google kaydı, aynı alan adı (lead veya firma) ya da aynı ünvan (şirket türü kelimeleri hariç).
-- p_items: [{ place_id, name, city, address, website, phone, category }]
create or replace function lead_discovered_insert(p_query uuid, p_items jsonb) returns int
language plpgsql set search_path = public, extensions as $$
declare
  qr lead_search_queries;
  it jsonb;
  d text;
  k text;
  n int := 0;
begin
  select * into qr from lead_search_queries where id = p_query;
  if not found then raise exception 'Sorgu bulunamadı.'; end if;

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
                       source, source_detail, search_id, google_place_id, notes)
    values (it->>'name', array[qr.sector], 'Türkiye', 'TR', nullif(it->>'city', ''), nullif(it->>'address', ''),
            nullif(it->>'website', ''), array_remove(array[nullif(it->>'phone', '')], null),
            'Google Maps', qr.query, qr.search_id, it->>'place_id',
            case when coalesce(it->>'category', '') <> '' then 'Google kategorisi: ' || (it->>'category') end)
    -- Aynı anda çalışan başka bir tarama aynı firmayı eklemiş olabilir
    on conflict (google_place_id) where google_place_id is not null do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ============================================================
-- Güvenlik (yeni tablolar)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['lead_search_queries', 'api_usage'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
