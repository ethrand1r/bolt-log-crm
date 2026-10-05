import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Globe, Loader2, Pause, Play, RotateCcw, Search, Sparkles, XCircle } from 'lucide-react'
import type { LeadResearchEvent, ResearchStats } from '../lib/types'

const EVENT_ICON: Record<LeadResearchEvent['kind'], { icon: typeof Search; color: string }> = {
  start: { icon: Play, color: 'text-slate-500' },
  search: { icon: Search, color: 'text-sky-600' },
  search_result: { icon: Search, color: 'text-slate-400' },
  fetch: { icon: Globe, color: 'text-violet-600' },
  fetch_result: { icon: Globe, color: 'text-slate-400' },
  fetch_error: { icon: AlertTriangle, color: 'text-amber-600' },
  writing: { icon: FileText, color: 'text-brand-600' },
  continue: { icon: RotateCcw, color: 'text-slate-500' },
  done: { icon: CheckCircle2, color: 'text-emerald-600' },
  error: { icon: XCircle, color: 'text-red-600' },
}

/** Araştırmanın adımları; live: son adım "şu an" olarak dönen simgeyle gösterilir */
export function ResearchTimeline({ events, live = false }: { events: LeadResearchEvent[]; live?: boolean }) {
  if (!events.length) {
    return <p className="flex items-center gap-2 text-xs text-slate-500">{live && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Başlatılıyor…</p>
  }
  return (
    <ol className="space-y-1">
      {events.map((e, i) => {
        const current = live && i === events.length - 1
        const { icon: Icon, color } = EVENT_ICON[e.kind] ?? EVENT_ICON.start
        return (
          <li key={e.id} className={`flex items-start gap-2 text-xs ${current ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
            {current ? <Loader2 className="mt-px h-3.5 w-3.5 shrink-0 animate-spin text-brand-600" /> : <Icon className={`mt-px h-3.5 w-3.5 shrink-0 ${color}`} />}
            <span className="min-w-0 break-words">{e.message}</span>
            <span className="ml-auto shrink-0 text-slate-400 tabular-nums">
              {new Date(e.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
import { getResearchStats, retryFailedResearch, setResearchPaused, setupResearch } from '../lib/leads'
import { getSettings } from '../lib/refdata'

/**
 * Otomatik internet araştırmasının durumu: sıradaki / süren / biten lead'ler, bu ayki harcama, durdur / devam et.
 * Araştırma sunucuda her dakika çalışır; bu çubuk sadece durumu gösterir ve iş sürerken 15 sn'de bir yenilenir.
 */
export function ResearchBar({ onChange }: { onChange?: () => void }) {
  const [stats, setStats] = useState<ResearchStats | null>(null)
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const [s, settings] = await Promise.all([getResearchStats(), getSettings()])
      setStats(s)
      setPaused(!!settings.lead_config?.research_paused)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => { load() }, [])

  // İş sürerken durumu ve listeyi tazele
  const active = !!stats && stats.configured && ((!paused && stats.pending + stats.running > 0) || stats.batched > 0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => { load(); onChange?.() }, 15_000)
    return () => clearInterval(t)
  }, [active])

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      await load()
      onChange?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !stats) {
    return <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">İnternet araştırması: {error}</div>
  }
  if (!stats) return null

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
      <span className="flex items-center gap-1.5 font-medium text-slate-800">
        {active ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : <Sparkles className="h-4 w-4 text-brand-600" />}
        İnternet araştırması
      </span>
      {!stats.configured ? (
        <>
          <span className="text-slate-500">Henüz kurulmadı. Kurulunca “araştırılacak” lead'ler her dakika otomatik araştırılır.</span>
          <button className="btn-primary ml-auto" disabled={busy} onClick={() => act(setupResearch)}><Play className="h-4 w-4" /> Kur ve başlat</button>
        </>
      ) : (
        <>
          <span className={paused ? 'font-medium text-amber-700' : 'text-slate-600'}>
            {paused ? 'Durduruldu' : stats.pending + stats.running + stats.batched > 0 ? 'Çalışıyor' : 'Sırada lead yok'}
          </span>
          <span className="text-slate-500">
            {stats.pending} sırada · {stats.running} araştırılıyor{stats.batched > 0 && ` · ${stats.batched} toplu işlemde`} · {stats.done} tamamlandı
            {stats.failed > 0 && <span className="text-red-600"> · {stats.failed} başarısız</span>}
          </span>
          <span className="text-slate-400">Bu ay {stats.month_leads} lead, ~${(stats.month_cost_cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {error && <span className="text-red-600">{error}</span>}
          <div className="ml-auto flex gap-2">
            {stats.failed > 0 && (
              <button className="btn-ghost text-xs" disabled={busy} onClick={() => act(retryFailedResearch)}><RotateCcw className="h-3.5 w-3.5" /> Başarısızları tekrar dene</button>
            )}
            {paused
              ? <button className="btn-primary" disabled={busy} onClick={() => act(() => setResearchPaused(false))}><Play className="h-4 w-4" /> Devam et</button>
              : <button className="btn-secondary" disabled={busy} onClick={() => act(() => setResearchPaused(true))}><Pause className="h-4 w-4" /> Durdur</button>}
          </div>
        </>
      )}
    </div>
  )
}
