-- BOLT LOG CRM - Güncelleme 006: Aramaya bağlı lead'lerde muhtemel taşıma modu otomatik
-- 005_lead_searches.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run
--
-- Lead'in modu boşsa, aramadaki eşleşen sektörlerin mod tahmininden doldurulur:
--   sea → Deniz FCL + Deniz LCL, air → Hava, mixed → Deniz FCL + Deniz LCL + Hava
-- Yön ile aynı mantık: elle girilen mod korunur.

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

  new.score_items := lead_score_items(new, cfg);
  select coalesce(round(100.0 * sum((i->>'weight')::int) filter (where (i->>'ok')::boolean)
                        / nullif(sum((i->>'weight')::int), 0)), 0)
    into s from jsonb_array_elements(new.score_items) i;
  new.score := s;
  return new;
end $$;

-- Mevcut aramaya bağlı lead'lerin boş modlarını doldur
update leads set score = score where search_id is not null;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
