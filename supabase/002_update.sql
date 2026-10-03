-- BOLT LOG CRM - Güncelleme 002
-- schema.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run

-- ============================================================
-- Sektörler
-- ============================================================
create table if not exists sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

insert into sectors (name) values
  ('Tekstil & Hazır Giyim'), ('Ev Tekstili & Halı'), ('Deri & Ayakkabı'), ('Otomotiv & Yedek Parça'),
  ('Makine & Ekipman'), ('Elektrik & Elektronik'), ('Beyaz Eşya'), ('Demir-Çelik & Metal'),
  ('Madencilik & Doğal Taş'), ('Kimya'), ('Plastik & Kauçuk'), ('İlaç & Medikal'), ('Kozmetik & Kişisel Bakım'),
  ('Gıda'), ('Taze Meyve & Sebze'), ('Kuru Gıda & Kuruyemiş'), ('Hububat & Bakliyat'), ('Su Ürünleri'),
  ('Et & Süt Ürünleri'), ('İçecek'), ('Tarım & Hayvancılık'), ('Mobilya'), ('İnşaat Malzemeleri'),
  ('Cam & Seramik'), ('Kağıt & Ambalaj'), ('Orman Ürünleri'), ('Enerji & Yenilenebilir'), ('Savunma & Havacılık'),
  ('Mücevher & Değerli Taş'), ('Oyuncak & Kırtasiye'), ('E-ticaret'), ('Perakende'), ('Proje Kargo'),
  ('Lojistik / Forwarder'), ('Diğer')
on conflict do nothing;

-- ============================================================
-- Firmalar: çoklu sektör / telefon / e-posta, ülke kodu, EORI
-- ============================================================
alter table companies add column if not exists sectors text[] default '{}';
alter table companies add column if not exists phones text[] default '{}';
alter table companies add column if not exists emails text[] default '{}';
alter table companies add column if not exists country_code text;
alter table companies add column if not exists eori text;

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'companies' and column_name = 'sector') then
    update companies set sectors = array[sector] where sector is not null and sector <> '';
    update companies set phones = array[phone] where phone is not null and phone <> '';
    update companies set emails = array[email] where email is not null and email <> '';
    alter table companies drop column sector;
    alter table companies drop column phone;
    alter table companies drop column email;
  end if;
end $$;

-- ============================================================
-- Taşıyıcı listesine kullanıcı eklemeleri (armatör / havayolu)
-- ============================================================
create table if not exists carriers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sea','air')),
  name text not null,
  code text,
  unique (kind, name)
);

-- ============================================================
-- Teklif: ölçüler, yük tipi, DG, istiflenebilirlik, karayolu
-- ============================================================
alter table quotes add column if not exists dimensions jsonb default '[]'::jsonb; -- [{qty,l,w,h}] cm
alter table quotes add column if not exists cargo_type text default 'GEN';
alter table quotes add column if not exists dg_un_no text;
alter table quotes add column if not exists dg_class text;
alter table quotes add column if not exists stackable boolean default true;
alter table quotes add column if not exists road_load text;     -- FTL | LTL
alter table quotes add column if not exists vehicle_type text;

-- ============================================================
-- Sevkiyat: taraflar firmalardan, taşıyıcı metin, ölçüler, karayolu alanları
-- ============================================================
alter table shipments add column if not exists shipper_id uuid references companies(id) on delete set null;
alter table shipments add column if not exists consignee_id uuid references companies(id) on delete set null;
alter table shipments add column if not exists notify_id uuid references companies(id) on delete set null;
alter table shipments add column if not exists carrier text;
alter table shipments add column if not exists dimensions jsonb default '[]'::jsonb;
alter table shipments add column if not exists cargo_type text default 'GEN';
alter table shipments add column if not exists dg_un_no text;
alter table shipments add column if not exists dg_class text;
alter table shipments add column if not exists stackable boolean default true;
alter table shipments add column if not exists road_load text;
alter table shipments add column if not exists vehicle_type text;
alter table shipments add column if not exists cmr_no text;
alter table shipments add column if not exists truck_plate text;
alter table shipments add column if not exists trailer_plate text;
alter table shipments add column if not exists driver_name text;
alter table shipments add column if not exists driver_phone text;
alter table shipments add column if not exists border_gate text;
alter table shipments drop column if exists shipper;
alter table shipments drop column if exists consignee;
alter table shipments drop column if exists notify;
alter table shipments drop column if exists carrier_id;

-- Dosya numarası taşıma moduna göre ayrı seri: DNZ- (deniz), HVA- (hava), KRY- (karayolu)
create or replace function shipments_set_no() returns trigger
language plpgsql as $$
begin
  if new.job_no is null or new.job_no = '' then
    new.job_no := case
      when new.mode = 'air' then next_number('job_air', 'HVA')
      when new.mode = 'road' then next_number('job_road', 'KRY')
      else next_number('job_sea', 'DNZ')
    end;
  end if;
  return new;
end $$;

-- ============================================================
-- Firma silme kuralı: tamamlanmış sevkiyatı olan firma silinemez.
-- Diğer durumlarda firmanın teklif ve sevkiyatları da silinir.
-- ============================================================
alter table quotes drop constraint if exists quotes_company_id_fkey;
alter table quotes add constraint quotes_company_id_fkey foreign key (company_id) references companies(id) on delete cascade;
alter table shipments drop constraint if exists shipments_company_id_fkey;
alter table shipments add constraint shipments_company_id_fkey foreign key (company_id) references companies(id) on delete cascade;

create or replace function prevent_company_delete() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from shipments
    where status in ('delivered','invoice_pending','invoiced','closed')
      and old.id in (company_id, shipper_id, consignee_id, notify_id, agent_id)
  ) then
    raise exception 'Bu firmanın tamamlanmış sevkiyatı olduğu için silinemez.';
  end if;
  return old;
end $$;
create or replace trigger companies_prevent_delete before delete on companies
  for each row execute function prevent_company_delete();

-- ============================================================
-- Masraf şablonları: karayolu
-- ============================================================
alter table charge_templates drop constraint if exists charge_templates_mode_check;
alter table charge_templates add constraint charge_templates_mode_check check (mode in ('all','sea','air','road'));
insert into charge_templates (name, name_en, mode, unit, currency, sort) values
  ('Karayolu Navlunu','Road Freight','road','shipment','EUR',16),
  ('Gümrük Kapısı / Sınır Masrafları','Border Crossing Fees','road','shipment','EUR',17),
  ('Bekleme (Demuraj) Ücreti','Truck Detention','road','shipment','EUR',18),
  ('CMR Sigortası','CMR Insurance','road','shipment','EUR',19)
on conflict do nothing;

-- ============================================================
-- Güvenlik (yeni tablolar)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['sectors','carriers'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
