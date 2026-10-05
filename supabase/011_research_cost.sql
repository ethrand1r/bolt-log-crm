-- BOLT LOG CRM - Güncelleme 011: Ucuzlatılmış araştırma (Sonnet 5.5) için ölçüm
-- 010_research_events.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run
--
-- * Lead yeniden araştırılınca önceki sonuç research_prev'de saklanır: eski ve yeni puan / kriterler
--   yan yana karşılaştırılabilir (yeni ayarların kaliteyi düşürüp düşürmediğini görmek için).
-- * Lead başına maliyet artık birkaç sent: sent altı tutarlar kaybolmasın diye maliyet 1/100 sent
--   biriminde de tutulur (api_usage.api = 'claude_cost_e4', 1 birim = 0,0001 $).

alter table leads add column if not exists research_prev jsonb;

create or replace function leads_keep_prev_research() returns trigger
language plpgsql as $$
begin
  if old.research is not null and new.research is distinct from old.research then
    new.research_prev := old.research;
  end if;
  return new;
end $$;
create or replace trigger leads_keep_prev_research before update of research on leads
  for each row execute function leads_keep_prev_research();

create or replace function lead_research_stats() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'pending', count(*) filter (where research_status = 'pending' and status not in ('converted', 'disqualified')),
    'running', count(*) filter (where research_status = 'running'),
    'done', count(*) filter (where research_status = 'done'),
    'failed', count(*) filter (where research_status = 'failed'),
    'month_leads', (select coalesce(sum(requests), 0) from api_usage where month = date_trunc('month', now())::date and api = 'claude_research'),
    'month_cost_cents', (select coalesce(sum(case api when 'claude_cost_cents' then requests::numeric else requests / 100.0 end), 0)
                         from api_usage where month = date_trunc('month', now())::date and api in ('claude_cost_cents', 'claude_cost_e4')),
    'configured', exists (select 1 from cron.job where jobname = 'lead-research'))
  from leads
$$;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
