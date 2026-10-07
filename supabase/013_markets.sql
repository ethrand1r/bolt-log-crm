-- BOLT LOG CRM - Güncelleme 013: Lead ve firmalarda "Pazar" (hedef ülke)
-- 012_research_batch.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run
--
-- market: lead'in / firmanın hangi pazar için çalışıldığı (ülke kodu: DE, US…). Elle seçilebilir.
-- Boş bırakılan yeni lead'lerde otomatik doldurulur: aramadan gelen → aramanın ülkesi, yurt dışı acente → bulunduğu ülke.
-- (target_markets ayrı: firmanın satış yaptığı / aldığı ülkeler, puanlamada kullanılır.)

alter table leads add column if not exists market text;
alter table companies add column if not exists market text;
create index if not exists leads_market_idx on leads (market);

create or replace function leads_default_market() returns trigger
language plpgsql as $$
begin
  if new.market is null then
    if new.search_id is not null then
      select country_code into new.market from lead_searches where id = new.search_id;
    end if;
    if new.market is null and new.lead_type = 'agent' and coalesce(new.country_code, 'TR') <> 'TR' then
      new.market := new.country_code;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists leads_default_market on leads;
create trigger leads_default_market before insert on leads
  for each row execute function leads_default_market();

-- Lead firmaya dönüştürülünce pazar firmaya taşınır (firmada pazar seçili değilse)
create or replace function leads_market_to_company() returns trigger
language plpgsql as $$
begin
  if new.market is not null then
    update companies set market = new.market where id = new.company_id and market is null;
  end if;
  return new;
end $$;

drop trigger if exists leads_market_to_company on leads;
create trigger leads_market_to_company after update of company_id on leads
  for each row when (new.company_id is not null and old.company_id is distinct from new.company_id)
  execute function leads_market_to_company();

-- Mevcut kayıtlar: aramanın ülkesi, acentenin ülkesi, tek ülke girilmişse "Satış yaptığı ülkeler"
update leads l set market = s.country_code from lead_searches s where l.market is null and l.search_id = s.id;
update leads set market = country_code where market is null and lead_type = 'agent' and coalesce(country_code, 'TR') <> 'TR';
update leads set market = target_markets[1] where market is null and cardinality(target_markets) = 1;
update companies c set market = l.market from leads l where l.company_id = c.id and c.market is null and l.market is not null;
