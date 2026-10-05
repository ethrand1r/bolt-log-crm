-- BOLT LOG CRM - Güncelleme 012: Ucuz araştırma (Haiku 4.5 + Batch API + kural ile ön değerlendirme)
-- 011_research_cost.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run
--
-- İki kuyruk:
--   * Öncelikli (research_priority = true): elle "araştır" denen lead'ler. Hemen, tek tek araştırılır.
--   * Normal: taramadan gelenler. Siteleri okunur, bariz vakalar kural ile puanlanır, kalanlar 10'arlı gruplar
--     halinde Anthropic Batch API'ye gönderilir (%50 indirimli). Sonuç gelene kadar durum 'batched'.
-- research_status: pending | running | batched | done | failed

alter table leads add column if not exists research_priority boolean not null default false;
alter table leads add column if not exists research_batch_id uuid;

-- Gönderilen toplu işlemler
create table if not exists research_batches (
  id uuid primary key default gen_random_uuid(),
  anthropic_id text not null,
  status text not null default 'submitted', -- submitted | processing | ended | failed
  -- { "<custom_id>": { "kind": "customer" | "agent", "leads": ["<lead id>", ...], "criteria": [...] } }
  requests jsonb not null,
  lead_count int not null default 0,
  error text,
  -- Sonuçları işleyen çağrı yarıda kalırsa 15 dakika sonra başka bir çağrı devralır
  processing_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists research_batches_status_idx on research_batches (status);

alter table research_batches enable row level security;
drop policy if exists "auth_all" on research_batches;
create policy "auth_all" on research_batches for all to authenticated using (true) with check (true);

-- Araştırma bitince öncelik bayrağı ve toplu işlem bağlantısı temizlenir
create or replace function leads_research_finished() returns trigger
language plpgsql as $$
begin
  if new.research_status in ('done', 'failed') then
    new.research_priority := false;
    new.research_batch_id := null;
  end if;
  return new;
end $$;
create or replace trigger leads_research_finished before update of research_status on leads
  for each row execute function leads_research_finished();

-- Kuyruktan alma: p_priority = true ise sadece elle istenenler, false ise sadece taramadan gelenler.
-- 10 dakikadır "araştırılıyor"da kalanlar yeniden alınır (toplu işlemdekiler 'batched' olduğu için etkilenmez).
create or replace function lead_research_claim(p_n int, p_priority boolean default false) returns setof leads
language plpgsql set search_path = public, extensions as $$
declare
  cfg jsonb;
  used int;
  lim int;
begin
  update leads set research_status = 'failed', research_error = 'Araştırma 3 denemede tamamlanamadı (zaman aşımı).'
  where research_status = 'running' and research_started_at < now() - interval '10 minutes' and research_attempts >= 3;

  select lead_config into cfg from settings where id = 1;
  if coalesce((cfg->>'research_paused')::boolean, false) then return; end if;
  select coalesce(sum(requests), 0) into used from api_usage
  where month = date_trunc('month', now())::date and api = 'claude_research';
  lim := coalesce((cfg->>'research_monthly_limit')::int, 200);
  if used >= lim then return; end if;

  return query
  update leads l set research_status = 'running', research_started_at = now(), research_attempts = l.research_attempts + 1
  where l.id in (
    select id from leads
    where research_priority = p_priority
      and (research_status = 'pending' or (research_status = 'running' and research_started_at < now() - interval '10 minutes'))
      and status not in ('converted', 'disqualified')
    order by created_at
    limit least(p_n, lim - used)
    for update skip locked)
  returning l.*;
end $$;
drop function if exists lead_research_claim(int);

create or replace function lead_research_stats() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'pending', count(*) filter (where research_status = 'pending' and status not in ('converted', 'disqualified')),
    'running', count(*) filter (where research_status = 'running'),
    'batched', count(*) filter (where research_status = 'batched'),
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
