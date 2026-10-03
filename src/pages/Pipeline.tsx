import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Opportunity } from '../lib/types'
import { MODES, STAGES, label } from '../lib/constants'
import { fmtDate, fmtNum } from '../lib/format'
import { ErrorBox, PageHeader, Spinner, useLoad } from '../components/ui'
import { OpportunityForm } from '../components/forms'

export default function Pipeline() {
  const [editing, setEditing] = useState<Opportunity | null | undefined>(undefined)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { data, setData, loading, error, reload } = useLoad(
    () => q<Opportunity[]>(supabase.from('opportunities').select('*, companies(name)').order('sort', { ascending: false })),
  )

  async function moveTo(oppId: string, stage: string) {
    const opp = data?.find((o) => o.id === oppId)
    if (!opp || opp.stage === stage) return
    let lost_reason = opp.lost_reason
    if (stage === 'lost') {
      const r = prompt('Kaybedilme nedeni (opsiyonel):', opp.lost_reason ?? '')
      if (r === null) return
      lost_reason = r || null
    }
    const sort = Date.now()
    setData((d) => d?.map((o) => (o.id === oppId ? { ...o, stage, sort, lost_reason } : o)) ?? null)
    try {
      await q(supabase.from('opportunities').update({ stage, sort, lost_reason }).eq('id', oppId))
    } catch (e) {
      setErr((e as Error).message)
      reload()
    }
  }

  if (loading && !data) return <Spinner />

  return (
    <>
      <PageHeader
        title="Satış Hunisi"
        subtitle="Kartları sürükleyerek aşamalar arasında taşıyın"
        actions={<button className="btn-primary" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Yeni fırsat</button>}
      />
      <ErrorBox error={error ?? err} />

      <div className="grid grid-cols-2 gap-2 pb-4 md:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((s) => {
          const items = (data ?? []).filter((o) => o.stage === s.value)
          const sums: Record<string, number> = {}
          items.forEach((o) => { if (o.est_value) sums[o.currency ?? 'USD'] = (sums[o.currency ?? 'USD'] ?? 0) + Number(o.est_value) })
          return (
            <div
              key={s.value}
              className={`flex min-w-0 flex-col rounded-lg bg-slate-100 transition ${over === s.value ? 'ring-2 ring-brand-500' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(s.value) }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (dragId) moveTo(dragId, s.value) }}
            >
              <div className="px-2.5 pt-3 pb-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                  {s.label}
                  <span className="ml-auto rounded-full bg-surface px-2 text-xs text-slate-500">{items.length}</span>
                </div>
                {Object.keys(sums).length > 0 && (
                  <div className="mt-1 truncate text-xs text-slate-500">{Object.entries(sums).map(([c, v]) => `${fmtNum(v, 0)} ${c}`).join(' · ')}</div>
                )}
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {items.map((o) => (
                  <div
                    key={o.id}
                    draggable
                    onDragStart={() => setDragId(o.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setEditing(o)}
                    className={`card cursor-grab p-2.5 text-sm hover:border-brand-500 active:cursor-grabbing ${dragId === o.id ? 'opacity-50' : ''}`}
                  >
                    <div className="line-clamp-2 font-medium break-words text-slate-900">{o.title}</div>
                    {o.company_id && (
                      <Link to={`/firmalar/${o.company_id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-xs text-brand-600 hover:underline">
                        {o.companies?.name}
                      </Link>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      {o.mode && <span className="rounded bg-slate-100 px-1.5 py-0.5">{label(MODES, o.mode)}</span>}
                      {(o.origin || o.destination) && <span className="truncate">{o.origin} → {o.destination}</span>}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{o.est_value ? `${fmtNum(o.est_value, 0)} ${o.currency}` : ''}</span>
                      <span className="flex items-center gap-2 text-slate-400">
                        {o.expected_close && fmtDate(o.expected_close)}
                        {o.company_id && !['won', 'lost'].includes(o.stage) && (
                          <Link
                            to={`/teklifler/yeni?company=${o.company_id}&opportunity=${o.id}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Teklif hazırla"
                            className="hover:text-brand-600"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </span>
                    </div>
                    {o.stage === 'lost' && o.lost_reason && <div className="mt-1 text-xs text-red-600">{o.lost_reason}</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {editing !== undefined && (
        <OpportunityForm opportunity={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); reload() }} />
      )}
    </>
  )
}
