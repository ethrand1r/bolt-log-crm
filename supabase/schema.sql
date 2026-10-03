-- BOLT LOG CRM - Veritabanı şeması
-- Supabase > SQL Editor > New query: bu dosyanın tamamını yapıştırıp "Run" deyin.

create extension if not exists pgcrypto;

-- ============================================================
-- Ortak: updated_at otomatik güncelleme
-- ============================================================
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
-- Numaralandırma (Q-2026-0001, BL-2026-0001)
-- ============================================================
create table if not exists counters (
  kind text not null,
  year int not null,
  value int not null default 0,
  primary key (kind, year)
);

create or replace function next_number(p_kind text, p_prefix text) returns text
language plpgsql as $$
declare
  y int := extract(year from now())::int;
  v int;
begin
  insert into counters(kind, year, value) values (p_kind, y, 1)
  on conflict (kind, year) do update set value = counters.value + 1
  returning value into v;
  return p_prefix || '-' || y || '-' || lpad(v::text, 4, '0');
end $$;

-- ============================================================
-- Ayarlar (tek satır)
-- ============================================================
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  company_name text default 'BOLT LOG',
  address text,
  phone text,
  email text,
  website text,
  tax_office text,
  tax_no text,
  bank_info text,
  quote_terms_tr text default 'Fiyatlar belirtilen geçerlilik tarihine kadar geçerlidir. Navlun fiyatları yer ve ekipman müsaitliğine tabidir. Gümrük vergileri, ardiye ve demuraj masrafları fiyata dahil değildir.',
  quote_terms_en text default 'Rates are valid until the stated validity date. Freight rates are subject to space and equipment availability. Customs duties, storage and demurrage charges are not included.',
  logo_data_url text,
  updated_at timestamptz default now()
);
insert into settings(id) values (1) on conflict do nothing;

-- ============================================================
-- Limanlar / Havalimanları
-- ============================================================
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sea','air')),
  code text not null,
  name text not null,
  country text,
  unique (kind, code)
);

-- ============================================================
-- Masraf kalemi şablonları
-- ============================================================
create table if not exists charge_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  name_en text,
  mode text not null default 'all' check (mode in ('all','sea','air')),
  unit text not null default 'shipment',
  currency text not null default 'USD',
  sort int default 0
);

-- ============================================================
-- Firmalar
-- ============================================================
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'prospect',
  -- customer | prospect | agent | carrier | airline | customs_broker | trucker | other
  sector text,
  country text,
  city text,
  address text,
  phone text,
  email text,
  website text,
  tax_office text,
  tax_no text,
  source text,
  tags text[] default '{}',
  notes text,
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists companies_name_idx on companies (lower(name));
create or replace trigger companies_updated before update on companies for each row execute function set_updated_at();

-- ============================================================
-- Kişiler
-- ============================================================
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  full_name text not null,
  title text,
  email text,
  phone text,
  mobile text,
  is_primary boolean default false,
  notes text,
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists contacts_company_idx on contacts (company_id);
create or replace trigger contacts_updated before update on contacts for each row execute function set_updated_at();

-- ============================================================
-- Fırsatlar (Satış hunisi)
-- ============================================================
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company_id uuid references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  stage text not null default 'lead',
  -- lead | contacted | quoted | negotiation | won | lost
  mode text, -- sea_fcl | sea_lcl | air
  origin text,
  destination text,
  volume_note text,
  est_value numeric(14,2),
  currency text default 'USD',
  expected_close date,
  lost_reason text,
  notes text,
  sort double precision default 0,
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists opportunities_company_idx on opportunities (company_id);
create or replace trigger opportunities_updated before update on opportunities for each row execute function set_updated_at();

-- ============================================================
-- Teklifler
-- ============================================================
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text unique,
  company_id uuid references companies(id) on delete restrict,
  contact_id uuid references contacts(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  status text not null default 'draft',
  -- draft | sent | accepted | rejected | expired
  language text not null default 'tr' check (language in ('tr','en')),
  mode text not null default 'sea_fcl', -- sea_fcl | sea_lcl | air
  direction text not null default 'export', -- export | import | crosstrade
  incoterm text,
  pol text,
  pod text,
  pickup_address text,
  delivery_address text,
  commodity text,
  containers jsonb default '[]'::jsonb, -- [{type:'40HC', qty:2}]
  packages int,
  gross_weight numeric(12,2),
  volume_cbm numeric(12,3),
  chargeable_weight numeric(12,2),
  carrier text,
  transit_time text,
  frequency text,
  valid_until date,
  notes text,
  terms text,
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists quotes_company_idx on quotes (company_id);
create or replace trigger quotes_updated before update on quotes for each row execute function set_updated_at();

create or replace function quotes_set_no() returns trigger
language plpgsql as $$
begin
  if new.quote_no is null or new.quote_no = '' then
    new.quote_no := next_number('quote', 'Q');
  end if;
  return new;
end $$;
create or replace trigger quotes_no before insert on quotes for each row execute function quotes_set_no();

create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  description text not null,
  unit text not null default 'shipment',
  -- shipment | container | kg | cbm | wm | bl | awb
  qty numeric(12,3) not null default 1,
  buy_price numeric(14,2) not null default 0,
  sell_price numeric(14,2) not null default 0,
  currency text not null default 'USD',
  sort int default 0
);
create index if not exists quote_items_quote_idx on quote_items (quote_id);

-- ============================================================
-- Sevkiyat dosyaları
-- ============================================================
create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  job_no text unique,
  quote_id uuid references quotes(id) on delete set null,
  company_id uuid references companies(id) on delete restrict,
  status text not null default 'booking',
  -- booking | departed | in_transit | arrived | delivered | closed | cancelled
  mode text not null default 'sea_fcl',
  direction text not null default 'export',
  incoterm text,
  shipper text,
  consignee text,
  notify text,
  agent_id uuid references companies(id) on delete set null,
  carrier_id uuid references companies(id) on delete set null,
  booking_no text,
  mbl_no text,
  hbl_no text,
  mawb_no text,
  hawb_no text,
  vessel text,
  voyage text,
  flight_no text,
  pol text,
  pod text,
  pickup_address text,
  delivery_address text,
  etd date,
  eta date,
  atd date,
  ata date,
  commodity text,
  packages int,
  gross_weight numeric(12,2),
  volume_cbm numeric(12,3),
  chargeable_weight numeric(12,2),
  containers jsonb default '[]'::jsonb, -- [{type:'40HC', no:'MSCU1234567', seal:'...'}]
  notes text,
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists shipments_company_idx on shipments (company_id);
create or replace trigger shipments_updated before update on shipments for each row execute function set_updated_at();

create or replace function shipments_set_no() returns trigger
language plpgsql as $$
begin
  if new.job_no is null or new.job_no = '' then
    new.job_no := next_number('job', 'BL');
  end if;
  return new;
end $$;
create or replace trigger shipments_no before insert on shipments for each row execute function shipments_set_no();

create table if not exists shipment_charges (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  description text not null,
  unit text not null default 'shipment',
  qty numeric(12,3) not null default 1,
  buy_price numeric(14,2) not null default 0,
  sell_price numeric(14,2) not null default 0,
  currency text not null default 'USD',
  sort int default 0
);
create index if not exists shipment_charges_idx on shipment_charges (shipment_id);

create table if not exists shipment_documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  name text not null,
  path text not null,
  size bigint,
  created_at timestamptz default now()
);

-- ============================================================
-- Aktiviteler (arama, e-posta, toplantı, not)
-- ============================================================
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete cascade,
  type text not null default 'note', -- call | email | meeting | note
  subject text not null,
  body text,
  activity_date timestamptz default now(),
  owner_id uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists activities_company_idx on activities (company_id);

-- ============================================================
-- Güvenlik (RLS): sadece giriş yapmış kullanıcılar erişebilir
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['counters','settings','locations','charge_templates','companies','contacts',
    'opportunities','quotes','quote_items','shipments','shipment_charges','shipment_documents','activities']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Doküman deposu
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "auth_documents" on storage.objects;
create policy "auth_documents" on storage.objects for all to authenticated
  using (bucket_id = 'documents') with check (bucket_id = 'documents');

-- ============================================================
-- Başlangıç verileri
-- ============================================================
insert into locations (kind, code, name, country) values
  ('sea','TRMER','Mersin','TR'),
  ('sea','TRAMB','Ambarlı / İstanbul','TR'),
  ('sea','TRGEM','Gemlik','TR'),
  ('sea','TRIZM','İzmir (Alsancak)','TR'),
  ('sea','TRALI','Aliağa','TR'),
  ('sea','TRKCO','Kocaeli (Evyap/Yılport)','TR'),
  ('sea','TRISK','İskenderun','TR'),
  ('sea','TRSSX','Samsun','TR'),
  ('sea','NLRTM','Rotterdam','NL'),
  ('sea','DEHAM','Hamburg','DE'),
  ('sea','BEANR','Antwerp','BE'),
  ('sea','ESVLC','Valencia','ES'),
  ('sea','ITGOA','Genoa','IT'),
  ('sea','GBFXT','Felixstowe','GB'),
  ('sea','CNSHA','Shanghai','CN'),
  ('sea','CNNGB','Ningbo','CN'),
  ('sea','CNSZX','Shenzhen','CN'),
  ('sea','SGSIN','Singapore','SG'),
  ('sea','AEJEA','Jebel Ali','AE'),
  ('sea','USNYC','New York','US'),
  ('sea','USHOU','Houston','US'),
  ('sea','USLAX','Los Angeles','US'),
  ('air','IST','İstanbul Havalimanı','TR'),
  ('air','SAW','Sabiha Gökçen','TR'),
  ('air','ADB','İzmir Adnan Menderes','TR'),
  ('air','ESB','Ankara Esenboğa','TR'),
  ('air','FRA','Frankfurt','DE'),
  ('air','AMS','Amsterdam Schiphol','NL'),
  ('air','LHR','London Heathrow','GB'),
  ('air','CDG','Paris CDG','FR'),
  ('air','DXB','Dubai','AE'),
  ('air','PVG','Shanghai Pudong','CN'),
  ('air','HKG','Hong Kong','HK'),
  ('air','JFK','New York JFK','US'),
  ('air','ORD','Chicago O''Hare','US')
on conflict do nothing;

insert into charge_templates (name, name_en, mode, unit, currency, sort) values
  ('Deniz Navlunu','Ocean Freight','sea','container','USD',1),
  ('Hava Navlunu','Air Freight','air','kg','USD',2),
  ('Yakıt Ek Ücreti','Fuel Surcharge','air','kg','USD',3),
  ('Güvenlik Ücreti','Security Surcharge','air','kg','USD',4),
  ('THC (Yükleme Limanı)','THC Origin','sea','container','USD',5),
  ('THC (Varış Limanı)','THC Destination','sea','container','USD',6),
  ('Konşimento Ücreti','B/L Fee','sea','bl','USD',7),
  ('AWB Ücreti','AWB Fee','air','awb','USD',8),
  ('ISPS','ISPS','sea','container','USD',9),
  ('Mühür Ücreti','Seal Fee','sea','container','USD',10),
  ('Gümrükleme','Customs Clearance','all','shipment','EUR',11),
  ('Kara Nakliye (Ön Taşıma)','Pre-carriage / Trucking','all','shipment','EUR',12),
  ('Kara Nakliye (Son Taşıma)','On-carriage / Delivery','all','shipment','EUR',13),
  ('Handling','Handling Fee','all','shipment','USD',14),
  ('Sigorta','Insurance','all','shipment','USD',15)
on conflict do nothing;
