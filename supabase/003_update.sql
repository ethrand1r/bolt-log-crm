-- BOLT LOG CRM - Güncelleme 003
-- 002_update.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run

-- ============================================================
-- Teklif numarası: taşıma moduna göre SEA / AIR / ROAD + yıl (2 hane) + 5 haneli sayaç
-- Örnek: SEA2601371, AIR2700001. Sayaç tüm modlarda ortaktır ve her yıl sıfırlanır.
-- 2026 serisi 01371'den başlar.
-- ============================================================
create or replace function quote_prefix(p_mode text) returns text
language sql immutable as $$
  select case when p_mode = 'air' then 'AIR' when p_mode = 'road' then 'ROAD' else 'SEA' end
$$;

create or replace function next_quote_number(p_mode text) returns text
language plpgsql as $$
declare
  y int := extract(year from now() at time zone 'Europe/Istanbul')::int;
  v int;
begin
  insert into counters(kind, year, value) values ('quote_no', y, case when y = 2026 then 1371 else 1 end)
  on conflict (kind, year) do update set value = counters.value + 1
  returning value into v;
  return quote_prefix(p_mode) || lpad((y % 100)::text, 2, '0') || lpad(v::text, 5, '0');
end $$;

create or replace function quotes_set_no() returns trigger
language plpgsql as $$
begin
  if new.quote_no is null or new.quote_no = '' then
    new.quote_no := next_quote_number(new.mode);
  end if;
  return new;
end $$;

-- Teklifin modu sonradan değişirse ön ek de değişir, numara aynı kalır (SEA2601371 → AIR2601371)
create or replace function quotes_sync_prefix() returns trigger
language plpgsql as $$
begin
  if new.mode is distinct from old.mode and new.quote_no ~ '^(SEA|AIR|ROAD)[0-9]{7}$' then
    new.quote_no := quote_prefix(new.mode) || substring(new.quote_no from '[0-9]{7}$');
  end if;
  return new;
end $$;
create or replace trigger quotes_prefix before update of mode on quotes
  for each row execute function quotes_sync_prefix();

-- ============================================================
-- Karayolu yükleme metresi (LDM), hava aktarma havalimanları
-- ============================================================
alter table quotes add column if not exists ldm numeric(10,2);
alter table shipments add column if not exists ldm numeric(10,2);
alter table shipments add column if not exists transits jsonb default '[]'::jsonb; -- ["Istanbul Airport (IST)", ...]

-- ============================================================
-- Ülke / şehir adları İngilizce: mevcut kayıtlardaki Türkçe adları çevir
-- ============================================================
create extension if not exists unaccent;

drop table if exists country_names;
create temp table country_names (code text primary key, en text, tr text);
insert into country_names (code, en, tr) values
  ('AF', 'Afghanistan', 'Afganistan'),
  ('AX', 'Åland Islands', 'Åland Adaları'),
  ('AL', 'Albania', 'Arnavutluk'),
  ('DZ', 'Algeria', 'Cezayir'),
  ('AS', 'American Samoa', 'Amerikan Samoası'),
  ('AD', 'Andorra', 'Andorra'),
  ('AO', 'Angola', 'Angola'),
  ('AI', 'Anguilla', 'Anguilla'),
  ('AQ', 'Antarctica', 'Antarktika'),
  ('AG', 'Antigua & Barbuda', 'Antigua ve Barbuda'),
  ('AR', 'Argentina', 'Arjantin'),
  ('AM', 'Armenia', 'Ermenistan'),
  ('AW', 'Aruba', 'Aruba'),
  ('AU', 'Australia', 'Avustralya'),
  ('AT', 'Austria', 'Avusturya'),
  ('AZ', 'Azerbaijan', 'Azerbaycan'),
  ('BS', 'Bahamas', 'Bahamalar'),
  ('BH', 'Bahrain', 'Bahreyn'),
  ('BD', 'Bangladesh', 'Bangladeş'),
  ('BB', 'Barbados', 'Barbados'),
  ('BY', 'Belarus', 'Belarus'),
  ('BE', 'Belgium', 'Belçika'),
  ('BZ', 'Belize', 'Belize'),
  ('BJ', 'Benin', 'Benin'),
  ('BM', 'Bermuda', 'Bermuda'),
  ('BT', 'Bhutan', 'Butan'),
  ('BO', 'Bolivia', 'Bolivya'),
  ('BA', 'Bosnia & Herzegovina', 'Bosna-Hersek'),
  ('BW', 'Botswana', 'Botsvana'),
  ('BV', 'Bouvet Island', 'Bouvet Adası'),
  ('BR', 'Brazil', 'Brezilya'),
  ('IO', 'British Indian Ocean Territory', 'Britanya Hint Okyanusu Toprakları'),
  ('VG', 'British Virgin Islands', 'Britanya Virjin Adaları'),
  ('BN', 'Brunei', 'Brunei'),
  ('BG', 'Bulgaria', 'Bulgaristan'),
  ('BF', 'Burkina Faso', 'Burkina Faso'),
  ('BI', 'Burundi', 'Burundi'),
  ('KH', 'Cambodia', 'Kamboçya'),
  ('CM', 'Cameroon', 'Kamerun'),
  ('CA', 'Canada', 'Kanada'),
  ('CV', 'Cape Verde', 'Cabo Verde'),
  ('BQ', 'Caribbean Netherlands', 'Karayip Hollandası'),
  ('KY', 'Cayman Islands', 'Cayman Adaları'),
  ('CF', 'Central African Republic', 'Orta Afrika Cumhuriyeti'),
  ('TD', 'Chad', 'Çad'),
  ('CL', 'Chile', 'Şili'),
  ('CN', 'China', 'Çin'),
  ('CX', 'Christmas Island', 'Christmas Adası'),
  ('CC', 'Cocos (Keeling) Islands', 'Cocos (Keeling) Adaları'),
  ('CO', 'Colombia', 'Kolombiya'),
  ('KM', 'Comoros', 'Komorlar'),
  ('CG', 'Congo - Brazzaville', 'Kongo - Brazavil'),
  ('CD', 'Congo - Kinshasa', 'Kongo - Kinşasa'),
  ('CK', 'Cook Islands', 'Cook Adaları'),
  ('CR', 'Costa Rica', 'Kosta Rika'),
  ('CI', 'Côte d''Ivoire', 'Côte d’Ivoire'),
  ('HR', 'Croatia', 'Hırvatistan'),
  ('CU', 'Cuba', 'Küba'),
  ('CW', 'Curaçao', 'Curaçao'),
  ('CY', 'Cyprus', 'Kıbrıs'),
  ('CZ', 'Czechia', 'Çekya'),
  ('DK', 'Denmark', 'Danimarka'),
  ('DJ', 'Djibouti', 'Cibuti'),
  ('DM', 'Dominica', 'Dominika'),
  ('DO', 'Dominican Republic', 'Dominik Cumhuriyeti'),
  ('EC', 'Ecuador', 'Ekvador'),
  ('EG', 'Egypt', 'Mısır'),
  ('SV', 'El Salvador', 'El Salvador'),
  ('GQ', 'Equatorial Guinea', 'Ekvator Ginesi'),
  ('ER', 'Eritrea', 'Eritre'),
  ('EE', 'Estonia', 'Estonya'),
  ('SZ', 'Eswatini', 'Esvatini'),
  ('ET', 'Ethiopia', 'Etiyopya'),
  ('FK', 'Falkland Islands', 'Falkland Adaları'),
  ('FO', 'Faroe Islands', 'Faroe Adaları'),
  ('FJ', 'Fiji', 'Fiji'),
  ('FI', 'Finland', 'Finlandiya'),
  ('FR', 'France', 'Fransa'),
  ('GF', 'French Guiana', 'Fransız Guyanası'),
  ('PF', 'French Polynesia', 'Fransız Polinezyası'),
  ('TF', 'French Southern Territories', 'Fransız Güney Toprakları'),
  ('GA', 'Gabon', 'Gabon'),
  ('GM', 'Gambia', 'Gambiya'),
  ('GE', 'Georgia', 'Gürcistan'),
  ('DE', 'Germany', 'Almanya'),
  ('GH', 'Ghana', 'Gana'),
  ('GI', 'Gibraltar', 'Cebelitarık'),
  ('GR', 'Greece', 'Yunanistan'),
  ('GL', 'Greenland', 'Grönland'),
  ('GD', 'Grenada', 'Grenada'),
  ('GP', 'Guadeloupe', 'Guadeloupe'),
  ('GU', 'Guam', 'Guam'),
  ('GT', 'Guatemala', 'Guatemala'),
  ('GG', 'Guernsey', 'Guernsey'),
  ('GN', 'Guinea', 'Gine'),
  ('GW', 'Guinea-Bissau', 'Gine-Bissau'),
  ('GY', 'Guyana', 'Guyana'),
  ('HT', 'Haiti', 'Haiti'),
  ('HM', 'Heard & McDonald Islands', 'Heard Adası ve McDonald Adaları'),
  ('HN', 'Honduras', 'Honduras'),
  ('HK', 'Hong Kong SAR China', 'Çin Hong Kong ÖİB'),
  ('HU', 'Hungary', 'Macaristan'),
  ('IS', 'Iceland', 'İzlanda'),
  ('IN', 'India', 'Hindistan'),
  ('ID', 'Indonesia', 'Endonezya'),
  ('IR', 'Iran', 'İran'),
  ('IQ', 'Iraq', 'Irak'),
  ('IE', 'Ireland', 'İrlanda'),
  ('IM', 'Isle of Man', 'Man Adası'),
  ('IL', 'Israel', 'İsrail'),
  ('IT', 'Italy', 'İtalya'),
  ('JM', 'Jamaica', 'Jamaika'),
  ('JP', 'Japan', 'Japonya'),
  ('JE', 'Jersey', 'Jersey'),
  ('JO', 'Jordan', 'Ürdün'),
  ('KZ', 'Kazakhstan', 'Kazakistan'),
  ('KE', 'Kenya', 'Kenya'),
  ('KI', 'Kiribati', 'Kiribati'),
  ('XK', 'Kosovo', 'Kosova'),
  ('KW', 'Kuwait', 'Kuveyt'),
  ('KG', 'Kyrgyzstan', 'Kırgızistan'),
  ('LA', 'Laos', 'Laos'),
  ('LV', 'Latvia', 'Letonya'),
  ('LB', 'Lebanon', 'Lübnan'),
  ('LS', 'Lesotho', 'Lesotho'),
  ('LR', 'Liberia', 'Liberya'),
  ('LY', 'Libya', 'Libya'),
  ('LI', 'Liechtenstein', 'Liechtenstein'),
  ('LT', 'Lithuania', 'Litvanya'),
  ('LU', 'Luxembourg', 'Lüksemburg'),
  ('MO', 'Macao SAR China', 'Çin Makao ÖİB'),
  ('MG', 'Madagascar', 'Madagaskar'),
  ('MW', 'Malawi', 'Malavi'),
  ('MY', 'Malaysia', 'Malezya'),
  ('MV', 'Maldives', 'Maldivler'),
  ('ML', 'Mali', 'Mali'),
  ('MT', 'Malta', 'Malta'),
  ('MH', 'Marshall Islands', 'Marshall Adaları'),
  ('MQ', 'Martinique', 'Martinik'),
  ('MR', 'Mauritania', 'Moritanya'),
  ('MU', 'Mauritius', 'Mauritius'),
  ('YT', 'Mayotte', 'Mayotte'),
  ('MX', 'Mexico', 'Meksika'),
  ('FM', 'Micronesia', 'Mikronezya'),
  ('MD', 'Moldova', 'Moldova'),
  ('MC', 'Monaco', 'Monako'),
  ('MN', 'Mongolia', 'Moğolistan'),
  ('ME', 'Montenegro', 'Karadağ'),
  ('MS', 'Montserrat', 'Montserrat'),
  ('MA', 'Morocco', 'Fas'),
  ('MZ', 'Mozambique', 'Mozambik'),
  ('MM', 'Myanmar (Burma)', 'Myanmar (Burma)'),
  ('NA', 'Namibia', 'Namibya'),
  ('NR', 'Nauru', 'Nauru'),
  ('NP', 'Nepal', 'Nepal'),
  ('NL', 'Netherlands', 'Hollanda'),
  ('NC', 'New Caledonia', 'Yeni Kaledonya'),
  ('NZ', 'New Zealand', 'Yeni Zelanda'),
  ('NI', 'Nicaragua', 'Nikaragua'),
  ('NE', 'Niger', 'Nijer'),
  ('NG', 'Nigeria', 'Nijerya'),
  ('NU', 'Niue', 'Niue'),
  ('NF', 'Norfolk Island', 'Norfolk Adası'),
  ('KP', 'North Korea', 'Kuzey Kore'),
  ('MK', 'North Macedonia', 'Kuzey Makedonya'),
  ('MP', 'Northern Mariana Islands', 'Kuzey Mariana Adaları'),
  ('NO', 'Norway', 'Norveç'),
  ('OM', 'Oman', 'Umman'),
  ('PK', 'Pakistan', 'Pakistan'),
  ('PW', 'Palau', 'Palau'),
  ('PS', 'Palestinian Territories', 'Filistin Bölgeleri'),
  ('PA', 'Panama', 'Panama'),
  ('PG', 'Papua New Guinea', 'Papua Yeni Gine'),
  ('PY', 'Paraguay', 'Paraguay'),
  ('PE', 'Peru', 'Peru'),
  ('PH', 'Philippines', 'Filipinler'),
  ('PN', 'Pitcairn Islands', 'Pitcairn Adaları'),
  ('PL', 'Poland', 'Polonya'),
  ('PT', 'Portugal', 'Portekiz'),
  ('PR', 'Puerto Rico', 'Porto Riko'),
  ('QA', 'Qatar', 'Katar'),
  ('RE', 'Réunion', 'Reunion'),
  ('RO', 'Romania', 'Romanya'),
  ('RU', 'Russia', 'Rusya'),
  ('RW', 'Rwanda', 'Ruanda'),
  ('WS', 'Samoa', 'Samoa'),
  ('SM', 'San Marino', 'San Marino'),
  ('ST', 'São Tomé & Príncipe', 'Sao Tome ve Principe'),
  ('SA', 'Saudi Arabia', 'Suudi Arabistan'),
  ('SN', 'Senegal', 'Senegal'),
  ('RS', 'Serbia', 'Sırbistan'),
  ('SC', 'Seychelles', 'Seyşeller'),
  ('SL', 'Sierra Leone', 'Sierra Leone'),
  ('SG', 'Singapore', 'Singapur'),
  ('SX', 'Sint Maarten', 'Sint Maarten'),
  ('SK', 'Slovakia', 'Slovakya'),
  ('SI', 'Slovenia', 'Slovenya'),
  ('SB', 'Solomon Islands', 'Solomon Adaları'),
  ('SO', 'Somalia', 'Somali'),
  ('ZA', 'South Africa', 'Güney Afrika'),
  ('GS', 'South Georgia & South Sandwich Islands', 'Güney Georgia ve Güney Sandwich Adaları'),
  ('KR', 'South Korea', 'Güney Kore'),
  ('SS', 'South Sudan', 'Güney Sudan'),
  ('ES', 'Spain', 'İspanya'),
  ('LK', 'Sri Lanka', 'Sri Lanka'),
  ('BL', 'St. Barthélemy', 'Saint Barthelemy'),
  ('SH', 'St. Helena', 'Saint Helena'),
  ('KN', 'St. Kitts & Nevis', 'Saint Kitts ve Nevis'),
  ('LC', 'St. Lucia', 'Saint Lucia'),
  ('MF', 'St. Martin', 'Saint Martin'),
  ('PM', 'St. Pierre & Miquelon', 'Saint Pierre ve Miquelon'),
  ('VC', 'St. Vincent & Grenadines', 'Saint Vincent ve Grenadinler'),
  ('SD', 'Sudan', 'Sudan'),
  ('SR', 'Suriname', 'Surinam'),
  ('SJ', 'Svalbard & Jan Mayen', 'Svalbard ve Jan Mayen'),
  ('SE', 'Sweden', 'İsveç'),
  ('CH', 'Switzerland', 'İsviçre'),
  ('SY', 'Syria', 'Suriye'),
  ('TW', 'Taiwan', 'Tayvan'),
  ('TJ', 'Tajikistan', 'Tacikistan'),
  ('TZ', 'Tanzania', 'Tanzanya'),
  ('TH', 'Thailand', 'Tayland'),
  ('TL', 'Timor-Leste', 'Timor-Leste'),
  ('TG', 'Togo', 'Togo'),
  ('TK', 'Tokelau', 'Tokelau'),
  ('TO', 'Tonga', 'Tonga'),
  ('TT', 'Trinidad & Tobago', 'Trinidad ve Tobago'),
  ('TN', 'Tunisia', 'Tunus'),
  ('TR', 'Türkiye', 'Türkiye'),
  ('TM', 'Turkmenistan', 'Türkmenistan'),
  ('TC', 'Turks & Caicos Islands', 'Turks ve Caicos Adaları'),
  ('TV', 'Tuvalu', 'Tuvalu'),
  ('UM', 'U.S. Outlying Islands', 'ABD Küçük Harici Adaları'),
  ('VI', 'U.S. Virgin Islands', 'ABD Virjin Adaları'),
  ('UG', 'Uganda', 'Uganda'),
  ('UA', 'Ukraine', 'Ukrayna'),
  ('AE', 'United Arab Emirates', 'Birleşik Arap Emirlikleri'),
  ('GB', 'United Kingdom', 'Birleşik Krallık'),
  ('US', 'United States', 'Amerika Birleşik Devletleri'),
  ('UY', 'Uruguay', 'Uruguay'),
  ('UZ', 'Uzbekistan', 'Özbekistan'),
  ('VU', 'Vanuatu', 'Vanuatu'),
  ('VA', 'Vatican City', 'Vatikan'),
  ('VE', 'Venezuela', 'Venezuela'),
  ('VN', 'Vietnam', 'Vietnam'),
  ('WF', 'Wallis & Futuna', 'Wallis ve Futuna'),
  ('EH', 'Western Sahara', 'Batı Sahra'),
  ('YE', 'Yemen', 'Yemen'),
  ('ZM', 'Zambia', 'Zambiya'),
  ('ZW', 'Zimbabwe', 'Zimbabve');

-- Firmalar: ülke adı koda göre, şehir Latin harflerle (İzmir → Izmir)
update companies c set country = n.en from country_names n where c.country_code = n.code and c.country is distinct from n.en;
update companies set city = unaccent(replace(replace(city, 'ı', 'i'), 'İ', 'I')) where city ~ '[^\x01-\x7F]';

-- Karayolu teklif / sevkiyat yerleri: "Şehir, Ülke"
update quotes q set
  pol = unaccent(replace(replace(regexp_replace(q.pol, ', [^,]*$', ''), 'ı', 'i'), 'İ', 'I')) || ', ' || n.en
from country_names n
where q.mode = 'road' and substring(q.pol from ', ([^,]*)$') in (n.tr, n.en) and q.pol is distinct from
  unaccent(replace(replace(regexp_replace(q.pol, ', [^,]*$', ''), 'ı', 'i'), 'İ', 'I')) || ', ' || n.en;
update quotes q set
  pod = unaccent(replace(replace(regexp_replace(q.pod, ', [^,]*$', ''), 'ı', 'i'), 'İ', 'I')) || ', ' || n.en
from country_names n
where q.mode = 'road' and substring(q.pod from ', ([^,]*)$') in (n.tr, n.en) and q.pod is distinct from
  unaccent(replace(replace(regexp_replace(q.pod, ', [^,]*$', ''), 'ı', 'i'), 'İ', 'I')) || ', ' || n.en;
update shipments s set
  pol = unaccent(replace(replace(regexp_replace(s.pol, ', [^,]*$', ''), 'ı', 'i'), 'İ', 'I')) || ', ' || n.en
from country_names n
where s.mode = 'road' and substring(s.pol from ', ([^,]*)$') in (n.tr, n.en) and s.pol is distinct from
  unaccent(replace(replace(regexp_replace(s.pol, ', [^,]*$', ''), 'ı', 'i'), 'İ', 'I')) || ', ' || n.en;
update shipments s set
  pod = unaccent(replace(replace(regexp_replace(s.pod, ', [^,]*$', ''), 'ı', 'i'), 'İ', 'I')) || ', ' || n.en
from country_names n
where s.mode = 'road' and substring(s.pod from ', ([^,]*)$') in (n.tr, n.en) and s.pod is distinct from
  unaccent(replace(replace(regexp_replace(s.pod, ', [^,]*$', ''), 'ı', 'i'), 'İ', 'I')) || ', ' || n.en;

drop table country_names;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
