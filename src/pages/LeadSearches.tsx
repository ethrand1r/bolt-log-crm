import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Radar, Trash2 } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { LeadSearch } from '../lib/types'
import { OPEN_LEAD_STATUSES } from '../lib/constants'
import { fmtDate } from '../lib/format'
import { fetchAll, getLeadSearches } from '../lib/leads'
import { Empty, ErrorBox, PageHeader, Spinner, useLoad } from '../components/ui'
import { LeadTabs } from './LeadGeneration'

type LeadRow = { search_id: string | null; score: number; status: string }

interface Stats { total: number; open: number; hot: number; converted: number; avg: number }

export default function LeadSearches() {
  const nav = useNavigate()
  const [showArchived, setShowArchived] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { data, loading, error, reload } = useLoad(async () => {
    const [searches, leads] = await Promise.all([getLeadSearches(), fetchAll<LeadRow>('leads', 'search_id,score,status')])
    return { searches, leads }
  })

  const stats = useMemo(() => {
    const m = new Map<string, Stats>()
    for (const l of data?.leads ?? []) {
      if (!l.search_id) continue
      const s = m.get(l.search_id) ?? { total: 0, open: 0, hot: 0, converted: 0, avg: 0 }
      s.total++
      s.avg += l.score
      if (OPEN_LEAD_STATUSES.includes(l.status)) s.open++
      if (OPEN_LEAD_STATUSES.includes(l.status) && l.score >= 70) s.hot++
      if (l.status === 'converted') s.converted++
      m.set(l.search_id, s)
    }
    m.forEach((s) => { s.avg = s.total ? Math.round(s.avg / s.total) : 0 })
    return m
  }, [data])

  async function archive(s: LeadSearch) {
    try {
      await q(supabase.from('lead_searches').update({ status: s.status === 'archived' ? 'active' : 'archived' }).eq('id', s.id))
      reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function del(s: LeadSearch) {
    const n = stats.get(s.id)?.total ?? 0
    if (!confirm(`"${s.name}" araması silinsin mi?${n ? ` Bağlı ${n} lead silinmez, aramasız kalır ve yeniden puanlanır.` : ''}`)) return
    try {
      await q(supabase.from('lead_searches').delete().eq('id', s.id))
      reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const list = (data?.searches ?? []).filter((s) => showArchived || s.status === 'active')
  const archivedCount = (data?.searches ?? []).filter((s) => s.status === 'archived').length

  return (
    <>
      <PageHeader
        title="Lead Generation"
        subtitle="Her arama bir hedef ülkeye göre oluşturulur; sektör ve bölgeler ticaret verisinden çıkarılır."
        actions={<button className="btn-primary" onClick={() => nav('/lead-generation/aramalar/yeni')}><Plus className="h-4 w-4" /> Yeni arama</button>}
      />
      <LeadTabs />
      <ErrorBox error={error ?? err} />

      {loading && !data ? <Spinner /> : list.length === 0 ? (
        <div className="card"><Empty>Henüz arama yok. “Yeni arama” ile bir hedef ülke seçin.</Empty></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => {
            const st = stats.get(s.id)
            return (
              <div key={s.id} className={`card flex cursor-pointer flex-col p-4 hover:border-brand-500 ${s.status === 'archived' ? 'opacity-60' : ''}`}
                onClick={() => nav(`/lead-generation?arama=${s.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{s.name}</h3>
                    <div className="text-xs text-slate-400">{s.country} · {s.criteria.year} verisi · {fmtDate(s.created_at)}{s.status === 'archived' && ' · Arşivlendi'}</div>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {s.status === 'active' && (
                      <button className="btn-ghost px-1.5 py-1 text-xs text-brand-600" onClick={() => nav(`/lead-generation/aramalar/${s.id}/tarama`)} title="Google'da firma tara">
                        <Radar className="h-3.5 w-3.5" /> Tara
                      </button>
                    )}
                    <button className="btn-ghost p-1" onClick={() => nav(`/lead-generation/aramalar/${s.id}`)} aria-label="Kriterleri düzenle"><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="btn-ghost px-1.5 py-1 text-xs" onClick={() => archive(s)}>{s.status === 'archived' ? 'Geri al' : 'Arşivle'}</button>
                    <button className="btn-ghost p-1 text-red-500" onClick={() => del(s)} aria-label="Sil"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {([['İhracat', s.criteria.export, ArrowUpRight, 'text-emerald-600'], ['İthalat', s.criteria.import, ArrowDownLeft, 'text-sky-600']] as const).map(([k, list, Icon, color]) => (
                    <div key={k} className="grid grid-cols-[4.5rem_1fr] gap-2">
                      <dt className="flex items-center gap-1 text-slate-500"><Icon className={`h-3.5 w-3.5 ${color}`} />{k}</dt>
                      <dd className={`line-clamp-2 ${list.length ? 'text-slate-700' : 'text-slate-400'}`}>{list.map((x) => x.sector).join(', ') || '—'}</dd>
                    </div>
                  ))}
                </dl>
                {s.notes && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{s.notes}</p>}
                <div className="mt-auto grid grid-cols-4 gap-2 border-t border-slate-100 pt-3 text-center">
                  {([['Lead', st?.total], ['Aktif', st?.open], ['70+', st?.hot], ['Ort. puan', st?.avg]] as const).map(([k, v]) => (
                    <div key={k}>
                      <div className="text-lg font-semibold text-slate-900">{v ?? 0}</div>
                      <div className="text-[11px] text-slate-500">{k}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {archivedCount > 0 && (
        <button className="btn-ghost mt-3 text-xs" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Arşivlenenleri gizle' : `Arşivlenen ${archivedCount} aramayı göster`}
        </button>
      )}

    </>
  )
}
