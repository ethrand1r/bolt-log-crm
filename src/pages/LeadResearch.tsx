import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../lib/supabase'
import type { Lead, LeadResearchEvent } from '../lib/types'
import { LEAD_TYPES } from '../lib/constants'
import { fmtDateTime } from '../lib/format'
import { Badge, Empty, ErrorBox, PageHeader, Section, Spinner } from '../components/ui'
import { ResearchBar, ResearchTimeline } from '../components/ResearchBar'
import { LeadTabs, ScorePill } from './LeadGeneration'

type Running = Pick<Lead, 'id' | 'name' | 'city' | 'country' | 'lead_type' | 'research_started_at' | 'research_attempts'>
type Queued = Pick<Lead, 'id' | 'name' | 'city' | 'country' | 'lead_type'>
type Recent = Pick<Lead, 'id' | 'name' | 'lead_type' | 'research_status' | 'score' | 'status' | 'researched_at' | 'updated_at' | 'research_error'>
  & { cost: unknown; prev_score: unknown }

interface Data {
  running: Running[]
  events: Map<string, LeadResearchEvent[]>
  queued: Queued[]
  queuedTotal: number
  recent: Recent[]
}

/** Durum birkaç saniyede bir okunur (araştırma sunucuda sürer; bu ekran sadece izler) */
const REFRESH_MS = 4000

async function load(): Promise<Data> {
  const [running, queuedRes, recent] = await Promise.all([
    q<Running[]>(supabase.from('leads').select('id,name,city,country,lead_type,research_started_at,research_attempts')
      .eq('research_status', 'running').order('research_started_at')),
    supabase.from('leads').select('id,name,city,country,lead_type', { count: 'exact' })
      .eq('research_status', 'pending').not('status', 'in', '(converted,disqualified)').order('created_at').limit(15),
    q<Recent[]>(supabase.from('leads')
      .select('id,name,lead_type,research_status,score,status,researched_at,updated_at,research_error,cost:research->cost_usd,prev_score:research_prev->score')
      .in('research_status', ['done', 'failed']).order('updated_at', { ascending: false }).limit(20)),
  ])
  if (queuedRes.error) throw new Error(queuedRes.error.message)

  // Sadece bu denemenin adımları (önceki denemelerinkiler gösterilmez)
  const events = new Map<string, LeadResearchEvent[]>()
  if (running.length) {
    const rows = await q<LeadResearchEvent[]>(supabase.from('lead_research_events').select('*')
      .in('lead_id', running.map((r) => r.id)).order('id'))
    const since = new Map(running.map((r) => [r.id, new Date(r.research_started_at ?? 0).getTime() - 5000]))
    for (const e of rows) {
      if (new Date(e.created_at).getTime() < (since.get(e.lead_id) ?? 0)) continue
      events.set(e.lead_id, [...(events.get(e.lead_id) ?? []), e])
    }
  }
  return { running, events, queued: (queuedRes.data ?? []) as Queued[], queuedTotal: queuedRes.count ?? 0, recent }
}

function elapsed(from: string | null, now: number): string {
  if (!from) return ''
  const s = Math.max(0, Math.round((now - new Date(from).getTime()) / 1000))
  return s < 60 ? `${s} sn` : `${Math.floor(s / 60)} dk ${s % 60} sn`
}

export default function LeadResearch() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const refresh = () => load().then((d) => { setData(d); setError(null) }).catch((e) => setError(e.message))

  useEffect(() => {
    refresh()
    const poll = setInterval(refresh, REFRESH_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [])

  return (
    <>
      <PageHeader title="Lead Generation" subtitle="Lead'lerin internetten araştırılmasını canlı izleyin: hangi firma araştırılıyor, Claude hangi adımda." />
      <LeadTabs />
      <ResearchBar onChange={refresh} />
      <ErrorBox error={error} />

      {!data ? <Spinner /> : (
        <div className="space-y-4">
          <Section title={`Şu an araştırılanlar (${data.running.length})`}>
            {data.running.length === 0 ? <Empty>Şu anda araştırılan lead yok. Sıradakiler her dakika otomatik başlar.</Empty> : (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {data.running.map((l) => (
                  <div key={l.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/lead-generation/${l.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-600">{l.name}</Link>
                        <div className="text-xs text-slate-500">
                          {[l.city, l.country].filter(Boolean).join(', ')}
                          {l.research_attempts > 1 && ` · ${l.research_attempts}. deneme`}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {l.lead_type === 'agent' && <Badge list={LEAD_TYPES} value="agent" />}
                        <div className="mt-0.5 text-xs text-slate-400 tabular-nums">{elapsed(l.research_started_at, now)}</div>
                      </div>
                    </div>
                    <ResearchTimeline events={data.events.get(l.id) ?? []} live />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <Section title={`Sırada (${data.queuedTotal})`}>
              {data.queued.length === 0 ? <Empty>Sırada lead yok.</Empty> : (
                <ol className="space-y-1.5 text-sm">
                  {data.queued.map((l, i) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <span className="w-5 text-right text-xs text-slate-400 tabular-nums">{i + 1}.</span>
                      <Link to={`/lead-generation/${l.id}`} className="truncate text-slate-700 hover:text-brand-600">{l.name}</Link>
                      {l.lead_type === 'agent' && <Badge list={LEAD_TYPES} value="agent" />}
                      <span className="ml-auto shrink-0 text-xs text-slate-400">{l.city}</span>
                    </li>
                  ))}
                  {data.queuedTotal > data.queued.length && <li className="pl-7 text-xs text-slate-400">+{data.queuedTotal - data.queued.length} lead daha</li>}
                </ol>
              )}
            </Section>

            <Section title="Son tamamlananlar">
              {data.recent.length === 0 ? <Empty>Henüz araştırılan lead yok.</Empty> : (
                <div className="-mx-4 -mb-4 overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr><th>Sonuç</th><th>Firma</th><th>Durum</th><th className="text-right">Maliyet</th><th>Zaman</th></tr>
                    </thead>
                    <tbody>
                      {data.recent.map((l) => (
                        <tr key={l.id}>
                          <td className="whitespace-nowrap">
                            {typeof l.prev_score === 'number' && l.research_status === 'done' && (
                              <span className="mr-1 text-xs text-slate-400 tabular-nums" title="Önceki araştırmanın puanı">{l.prev_score} →</span>
                            )}
                            <ScorePill score={l.score} lead={l} />
                          </td>
                          <td className="max-w-64">
                            <Link to={`/lead-generation/${l.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-600">{l.name}</Link>
                            {l.research_status === 'failed' && l.research_error && <div className="truncate text-xs text-red-600" title={l.research_error}>{l.research_error}</div>}
                          </td>
                          <td className="whitespace-nowrap text-xs">
                            {l.status === 'disqualified' ? <span className="text-red-600">Uygun değil</span> : <span className="text-slate-500">{l.lead_type === 'agent' ? 'Acente' : 'Müşteri adayı'}</span>}
                          </td>
                          <td className="text-right text-xs text-slate-500 tabular-nums">{typeof l.cost === 'number' ? `$${l.cost.toFixed(3)}` : '-'}</td>
                          <td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(l.researched_at ?? l.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </>
  )
}
