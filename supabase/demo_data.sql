-- BOLT LOG CRM - Örnek (demo) veriler: 10 firma + 20 fırsat
-- 002_update.sql'den SONRA çalıştırılır. Tekrar çalıştırılırsa önce eski demo verileri siler.
-- Demo verileri tamamen silmek için sadece şu satırı çalıştırın:
--   delete from companies where 'demo' = any(tags);

delete from companies where 'demo' = any(tags);

with c as (
  insert into companies (name, type, sectors, country, country_code, city, emails, phones, tags, source) values
    ('Anadolu Tekstil San. A.Ş.',     'prospect', '{"Tekstil & Hazır Giyim"}',              'Türkiye', 'TR', 'Bursa',     '{"export@anadolutekstil.example"}', '{"+90 224 000 00 01"}', '{demo}', 'Fuar'),
    ('Ege Kuru Gıda Ltd. Şti.',       'customer', '{"Kuru Gıda & Kuruyemiş","Gıda"}',       'Türkiye', 'TR', 'İzmir',     '{"info@egekurugida.example"}',      '{"+90 232 000 00 02"}', '{demo}', 'Referans'),
    ('Marmara Otomotiv Yedek Parça',  'prospect', '{"Otomotiv & Yedek Parça"}',             'Türkiye', 'TR', 'Kocaeli',   '{"lojistik@marmaraoto.example"}',   '{"+90 262 000 00 03"}', '{demo}', 'LinkedIn'),
    ('Konya Makine İmalat A.Ş.',      'prospect', '{"Makine & Ekipman"}',                   'Türkiye', 'TR', 'Konya',     '{"satis@konyamakine.example"}',     '{"+90 332 000 00 04"}', '{demo}', 'Soğuk arama'),
    ('Akdeniz Taze Meyve Koop.',      'customer', '{"Taze Meyve & Sebze"}',                 'Türkiye', 'TR', 'Mersin',    '{"ihracat@akdeniztaze.example"}',   '{"+90 324 000 00 05"}', '{demo}', 'Web sitesi'),
    ('Gaziantep Halı Dış Tic.',       'prospect', '{"Ev Tekstili & Halı"}',                 'Türkiye', 'TR', 'Gaziantep', '{"export@antephali.example"}',      '{"+90 342 000 00 06"}', '{demo}', 'Fuar'),
    ('Kayseri Mobilya Grup',          'prospect', '{"Mobilya"}',                            'Türkiye', 'TR', 'Kayseri',   '{"info@kayserimobilya.example"}',   '{"+90 352 000 00 07"}', '{demo}', 'E-posta kampanyası'),
    ('İstanbul Medikal Cihaz A.Ş.',   'customer', '{"İlaç & Medikal","Elektrik & Elektronik"}', 'Türkiye', 'TR', 'İstanbul', '{"supply@istmedikal.example"}',   '{"+90 212 000 00 08"}', '{demo}', 'Referans'),
    ('Rhein Logistik GmbH',           'agent',    '{"Lojistik / Forwarder"}',               'Almanya', 'DE', 'Hamburg',   '{"ops@rheinlog.example"}',          '{"+49 40 0000 0009"}',  '{demo}', 'Diğer'),
    ('Denizli Ev Tekstili San.',      'prospect', '{"Ev Tekstili & Halı","Tekstil & Hazır Giyim"}', 'Türkiye', 'TR', 'Denizli', '{"export@denizlitex.example"}', '{"+90 258 000 00 10"}', '{demo}', 'LinkedIn')
  returning id, name
)
insert into opportunities (title, company_id, stage, mode, origin, destination, volume_note, est_value, currency, expected_close, lost_reason, sort)
select o.title, c.id, o.stage, o.mode, o.origin, o.destination, o.volume_note, o.est_value, 'USD', current_date + o.days, o.lost_reason, extract(epoch from now()) * 1000 - o.n
from (values
  ( 1, 'Anadolu Tekstil San. A.Ş.',    'Bursa → Hamburg haftalık LCL',          'lead',        'sea_lcl', 'Gemlik',   'Hamburg',     'Haftalık 8-10 CBM',      12000, 30, null),
  ( 2, 'Marmara Otomotiv Yedek Parça', 'Kocaeli → Detroit FCL',                 'lead',        'sea_fcl', 'Kocaeli',  'New York',    'Ayda 3 x 40HC',          45000, 45, null),
  ( 3, 'Konya Makine İmalat A.Ş.',     'Proje kargo - Mısır',                   'lead',        'sea_fcl', 'Mersin',   'Alexandria',  '2 x 40FR, 1 x 40OT',     28000, 60, null),
  ( 4, 'Kayseri Mobilya Grup',         'Irak karayolu sevkiyatları',            'lead',        'road',    'Kayseri',  'Erbil',       'Ayda 4 tır FTL',         16000, 40, null),
  ( 5, 'Denizli Ev Tekstili San.',     'ABD numune gönderileri (hava)',         'lead',        'air',     'İstanbul', 'New York JFK','Aylık 300-400 kg',        6000, 25, null),
  ( 6, 'Gaziantep Halı Dış Tic.',      'Gaziantep → Jebel Ali FCL',             'contacted',   'sea_fcl', 'Mersin',   'Jebel Ali',   'Ayda 2 x 40HC',          18000, 20, null),
  ( 7, 'Anadolu Tekstil San. A.Ş.',    'Acil hava sevkiyatı - Londra',          'contacted',   'air',     'İstanbul', 'Londra LHR',  '1.200 kg',                5500, 10, null),
  ( 8, 'Ege Kuru Gıda Ltd. Şti.',      'Fındık ihracatı Çin',                   'contacted',   'sea_fcl', 'İzmir',    'Shanghai',    'Çeyreklik 10 x 20DC',    60000, 35, null),
  ( 9, 'Kayseri Mobilya Grup',         'Mobilya - Suudi Arabistan',             'contacted',   'sea_fcl', 'Mersin',   'Jeddah',      'Ayda 3 x 40HC',          24000, 30, null),
  (10, 'Akdeniz Taze Meyve Koop.',     'Narenciye - Rusya reefer',              'quoted',      'sea_fcl', 'Mersin',   'Novorossiysk','Sezonluk 40 x 40RF',     95000, 14, null),
  (11, 'İstanbul Medikal Cihaz A.Ş.',  'Medikal cihaz - Almanya hava',          'quoted',      'air',     'İstanbul', 'Frankfurt',   'Haftalık 250 kg',        15000, 12, null),
  (12, 'Marmara Otomotiv Yedek Parça', 'Yedek parça - Almanya parsiyel',        'quoted',      'road',    'Kocaeli',  'Stuttgart',   'Haftalık LTL 4-6 LDM',   30000, 18, null),
  (13, 'Denizli Ev Tekstili San.',     'Havlu - İngiltere LCL',                 'quoted',      'sea_lcl', 'İzmir',    'Felixstowe',  '15 günde 12 CBM',         9000, 21, null),
  (14, 'Ege Kuru Gıda Ltd. Şti.',      'Kuru incir - Hollanda',                 'negotiation', 'sea_fcl', 'İzmir',    'Rotterdam',   'Ayda 4 x 20DC',          22000,  7, null),
  (15, 'Gaziantep Halı Dış Tic.',      'Halı - ABD hava + deniz kombine',       'negotiation', 'air',     'Gaziantep','Chicago',     'Aylık 2.000 kg',         20000,  9, null),
  (16, 'Akdeniz Taze Meyve Koop.',     'Domates - Romanya frigo tır',           'negotiation', 'road',    'Antalya',  'Bükreş',      'Haftalık 3 frigo FTL',   36000,  5, null),
  (17, 'İstanbul Medikal Cihaz A.Ş.',  'Yıllık hava kargo anlaşması',           'won',         'air',     'İstanbul', 'Dubai',       'Haftalık 500 kg',        40000,  0, null),
  (18, 'Ege Kuru Gıda Ltd. Şti.',      'Kuruyemiş - Almanya FCL',               'won',         'sea_fcl', 'İzmir',    'Hamburg',     'Ayda 2 x 40HC',          26000,  0, null),
  (19, 'Konya Makine İmalat A.Ş.',     'Makine - Kazakistan karayolu',          'lost',        'road',    'Konya',    'Almatı',      '5 tır',                  21000,  0, 'Fiyat yüksek bulundu'),
  (20, 'Anadolu Tekstil San. A.Ş.',    'İspanya FCL ihaleler',                  'lost',        'sea_fcl', 'Gemlik',   'Valencia',    'Ayda 1 x 40HC',           8000,  0, 'Rakip forwarder ile devam etti')
) as o(n, company, title, stage, mode, origin, destination, volume_note, est_value, days, lost_reason)
join c on c.name = o.company;
