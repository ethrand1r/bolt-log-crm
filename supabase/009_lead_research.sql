-- BOLT LOG CRM - Güncelleme 009: Lead'lerin internetten otomatik araştırılması ve araştırmaya göre puanlama
-- 008_agents_research.sql'den SONRA çalıştırılır. Supabase > SQL Editor > New query > yapıştır > Run
--
-- Akış: research_status = 'pending' olan lead'ler (Google taramasından gelenler ya da elle "araştır" denenler)
-- her dakika çalışan bir zamanlayıcı (pg_cron) ile lead-research Edge Function'a gönderilir. Fonksiyon her lead'i
-- Claude ile web'de araştırır, sonucu lead_research_save ile kaydeder. Puan artık bu araştırmadan gelir.
-- Ayarlar'daki "research_paused" ile durdurulur / devam ettirilir.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

alter table leads add column if not exists research jsonb;            -- Claude'un araştırma sonucu (özet, kanıtlar, kaynaklar, puan)
alter table leads add column if not exists research_started_at timestamptz;
alter table leads add column if not exists researched_at timestamptz;
alter table leads add column if not exists research_error text;
alter table leads add column if not exists research_attempts int not null default 0;
-- research_status: pending (sırada) | running (araştırılıyor) | done | failed (3 denemede olmadı)

update settings set lead_config = '{"research_paused": false, "research_monthly_limit": 200}'::jsonb || coalesce(lead_config, '{}'::jsonb) where id = 1;
alter table settings alter column lead_config set default '{
  "coverage": 80,
  "max_sectors": 10,
  "always_cities": ["Istanbul", "Ankara", "Izmir"],
  "excluded_sectors": ["Enerji & Yenilenebilir", "Diğer"],
  "places_pages": 1,
  "places_monthly_limit": 900,
  "research_paused": false,
  "research_monthly_limit": 200
}'::jsonb;

-- Zamanlayıcının Edge Function'a kendini tanıtmak için kullandığı gizli anahtar.
-- RLS açık ve politika yok: uygulama kullanıcıları okuyamaz, sadece veritabanı ve servis anahtarı okur.
create table if not exists app_secrets (key text primary key, value text not null);
alter table app_secrets enable row level security;
insert into app_secrets (key, value)
values ('research_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- ============================================================
-- Puanlama: araştırılmış lead'in puanı araştırmadan gelir (müşteri ve acente).
-- Araştırma bekleyen / süren / başarısız olan ve araştırılmamış acenteler puanlanmaz.
-- Araştırma gerektirmeyen (elle / CSV) müşteri lead'leri eski kurallarla puanlanır.
-- ============================================================
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

  if new.search_id is not null and new.lead_type <> 'agent' then
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

  if new.research_status = 'done' and new.research is not null then
    new.score_items := coalesce(new.research->'score_items', '[]'::jsonb);
    new.score := coalesce((new.research->>'score')::int, 0);
    return new;
  end if;

  if new.lead_type = 'agent' or new.research_status is not null then
    new.score_items := '[]'::jsonb;
    new.score := 0;
    return new;
  end if;

  new.score_items := lead_score_items(new, cfg);
  select coalesce(round(100.0 * sum((i->>'weight')::int) filter (where (i->>'ok')::boolean)
                        / nullif(sum((i->>'weight')::int), 0)), 0)
    into s from jsonb_array_elements(new.score_items) i;
  new.score := s;
  return new;
end $$;

-- ============================================================
-- Kuyruk
-- ============================================================
-- Sıradaki lead'leri "araştırılıyor" olarak işaretleyip döner. Duraklatıldıysa ya da aylık sınır dolduysa boş döner.
-- 10 dakikadır "araştırılıyor"da kalan (fonksiyon yarıda kesilmiş) lead'ler yeniden alınır, 3. denemeden sonra başarısız sayılır.
create or replace function lead_research_claim(p_n int) returns setof leads
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
    where (research_status = 'pending' or (research_status = 'running' and research_started_at < now() - interval '10 minutes'))
      and status not in ('converted', 'disqualified')
    order by created_at
    limit least(p_n, lim - used)
    for update skip locked)
  returning l.*;
end $$;

-- Araştırma sonucunu kaydeder. Lead'de boş olan alanlar araştırmadan doldurulur, girilmiş bilgiye dokunulmaz
-- (yön hariç: araştırma net bir sonuç bulduysa sektörden yapılan tahmini düzeltir).
-- p_disqualify doluysa ve lead'e henüz dokunulmamışsa (Yeni) otomatik "Uygun değil" yapılır.
create or replace function lead_research_save(p_lead uuid, p_research jsonb, p_disqualify text default null) returns void
language plpgsql set search_path = public, extensions as $$
declare
  r jsonb := p_research;
  arr text[];
begin
  update leads l set
    research = r,
    research_status = 'done',
    researched_at = now(),
    research_error = null,
    website = coalesce(nullif(l.website, ''), nullif(r->>'website', '')),
    linkedin_url = coalesce(nullif(l.linkedin_url, ''), nullif(r->>'linkedin_url', '')),
    emails = case when coalesce(cardinality(array_remove(l.emails, '')), 0) = 0
                  then array(select distinct x from jsonb_array_elements_text(coalesce(r->'emails', '[]'::jsonb)) x where x <> '')
                  else l.emails end,
    phones = case when coalesce(cardinality(array_remove(l.phones, '')), 0) = 0
                  then array(select distinct x from jsonb_array_elements_text(coalesce(r->'phones', '[]'::jsonb)) x where x <> '')
                  else l.phones end,
    contact_name = coalesce(nullif(l.contact_name, ''), nullif(r->>'contact_name', '')),
    contact_title = coalesce(nullif(l.contact_title, ''), nullif(r->>'contact_title', '')),
    contact_email = coalesce(nullif(l.contact_email, ''), nullif(r->>'contact_email', '')),
    employees = coalesce(l.employees, nullif((r->>'employees')::int, 0)),
    exports = coalesce(l.exports, case r->>'exports' when 'yes' then true when 'no' then false end),
    modes = case when coalesce(cardinality(array_remove(l.modes, '')), 0) = 0
                 then array(select jsonb_array_elements_text(coalesce(r->'modes', '[]'::jsonb)))
                 else l.modes end,
    target_markets = case when coalesce(cardinality(array_remove(l.target_markets, '')), 0) = 0
                          then array(select distinct upper(x) from jsonb_array_elements_text(coalesce(r->'export_markets', '[]'::jsonb)) x where x <> '')
                          else l.target_markets end,
    direction = case when l.lead_type = 'agent' then l.direction
                     when r->>'exports' = 'yes' and r->>'imports' = 'yes' then 'both'
                     when r->>'exports' = 'yes' then 'export'
                     when r->>'imports' = 'yes' then 'import'
                     else l.direction end,
    status = case when p_disqualify is not null and l.status = 'new' then 'disqualified' else l.status end,
    disqualify_reason = case when p_disqualify is not null and l.status = 'new'
                             then 'Otomatik (araştırma): ' || p_disqualify else l.disqualify_reason end
  where l.id = p_lead;
end $$;

-- Hata: 3 denemeye kadar tekrar sıraya alınır, sonra başarısız
create or replace function lead_research_fail(p_lead uuid, p_error text) returns void
language sql set search_path = public, extensions as $$
  update leads set
    research_status = case when research_attempts >= 3 then 'failed' else 'pending' end,
    research_error = p_error
  where id = p_lead
$$;

-- Ekrandaki durum çubuğu için (zamanlayıcının kurulu olup olmadığını görmek için cron.job'u okur)
create or replace function lead_research_stats() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'pending', count(*) filter (where research_status = 'pending' and status not in ('converted', 'disqualified')),
    'running', count(*) filter (where research_status = 'running'),
    'done', count(*) filter (where research_status = 'done'),
    'failed', count(*) filter (where research_status = 'failed'),
    'month_leads', (select coalesce(sum(requests), 0) from api_usage where month = date_trunc('month', now())::date and api = 'claude_research'),
    'month_cost_cents', (select coalesce(sum(requests), 0) from api_usage where month = date_trunc('month', now())::date and api = 'claude_cost_cents'),
    'configured', exists (select 1 from cron.job where jobname = 'lead-research'))
  from leads
$$;

-- ============================================================
-- Zamanlayıcı kurulumu: uygulama kendi Supabase adresiyle çağırır (Araştırma çubuğu > "Kur ve başlat").
-- Her dakika lead-research Edge Function'ı tetiklenir; fonksiyon sırada iş yoksa hemen döner.
-- ============================================================
create or replace function lead_research_setup(p_url text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  base text := rtrim(p_url, '/');
begin
  if auth.uid() is null then raise exception 'Giriş yapmanız gerekiyor.'; end if;
  -- Gizli anahtar sadece bu projenin kendi adresine gönderilebilir
  if base !~ '^https://[a-z0-9]+\.supabase\.co$' then raise exception 'Geçersiz Supabase adresi: %', p_url; end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'lead-research';
  perform cron.schedule('lead-research', '* * * * *', format(
    $cmd$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-research-secret', (select value from public.app_secrets where key = 'research_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000)$cmd$,
    base || '/functions/v1/lead-research'));
end $$;
revoke execute on function lead_research_setup(text) from public, anon;
grant execute on function lead_research_setup(text) to authenticated;

revoke execute on function lead_research_stats() from public, anon;
grant execute on function lead_research_stats() to authenticated;

-- PostgREST şema önbelleğini yenile
notify pgrst, 'reload schema';
