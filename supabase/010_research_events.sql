-- BOLT LOG CRM - Güncelleme 010: İnternet araştırmasının adımları (canlı izleme ekranı için)
-- 009_lead_research.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run
--
-- lead-research Edge Function her adımı (başladı, web'de arıyor, sayfa okuyor, sonuç yazıyor, bitti / hata) buraya yazar.
-- Lead Generation > Araştırma ekranı bu tabloyu birkaç saniyede bir okuyarak süren araştırmaları canlı gösterir.

create table if not exists lead_research_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- start | search | search_result | fetch | fetch_result | fetch_error | writing | continue | done | error
  kind text not null,
  message text not null
);
create index if not exists lead_research_events_lead_idx on lead_research_events (lead_id, created_at);

alter table lead_research_events enable row level security;
drop policy if exists "auth_all" on lead_research_events;
create policy "auth_all" on lead_research_events for all to authenticated using (true) with check (true);

-- Eski adım kayıtları (30 günden eski) her araştırma turunda temizlenir
create or replace function lead_research_events_cleanup() returns void
language sql set search_path = public, extensions as $$
  delete from lead_research_events where created_at < now() - interval '30 days'
$$;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
