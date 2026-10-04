import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, FileUp, Plus, Search, Trash2 } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Lead } from '../lib/types'
import { LEAD_SOURCES, LEAD_STATUSES, OPEN_LEAD_STATUSES } from '../lib/constants'
import { fmtDate, todayISO } from '../lib/format'
import { fetchAll, scoreTone } from '../lib/leads'
import { Badge, Empty, ErrorBox, PageHeader, Select, Spinner, useLoad } from '../components/ui'
import { LeadForm } from '../components/leadForms'
import { LeadImport } from '../components/LeadImport'

type Row = Pick<Lead, 'id' | 'name' | 'sectors' | 'city' | 'country' | 'website' | 'source' | 'source_detail' | 'status' | 'score'
  | 'next_action_date' | 'next_action_note' | 'last_contact_at' | 'converted_at' | 'contact_name' | 'created_at'>

const COLUMNS = 'id,name,sectors,city,country,website,source,source_detail,status,score,next_action_date,next_action_note,last_contact_at,converted_at,contact_name,created_at'
const PAGE = 200

/** Liste görünümleri: açık lead'ler, takibi gelenler, tek tek durumlar, tümü */
const VIEWS = [
  { value: 'open', label: 'Aktif' },
  { value: 'due', label: 'Takibi gelen' },
  ...LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label })),
  { value: 'all', label: 'Tümü' },
]

const SORTS = [
  { value: 'score', label: 'Puan (yüksek → düşük)' },
  { value: 'next', label: 'Sonraki adım tarihi' },
  { value: 'created', label: 'Eklenme (yeni → eski)' },
  { value: 'name', label: 'Firma adı' },
]

export function ScorePill({ score, className = '' }: { score: number; className?: string }) {
  return (
    <span className={`inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${scoreTone(score)} ${className}`}
      title="Lead puanı (0-100)">{score}</span>
  )
}

export default function LeadGeneration() {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [view, setView] = useState('open')
  const [source, setSource] = useState('')
  const [minScore, setMinScore] = useState('')
  const [sort, setSort] = useState('score')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [modal, setModal] = useState<null | 'new' | 'import'>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { data, loading, error, reload } = useLoad(() => fetchAll<Row>('leads', COLUMNS))

  const today = todayISO()
  const isOpen = (l: Row) => OPEN_LEAD_STATUSES.includes(l.status)
  const isDue = (l: Row) => isOpen(l) && !!l.next_action_date && l.next_action_date <= today

  const stats = useMemo(() => {
    const all = data ?? []
    const monthStart = today.slice(0, 7)
    return {
      open: all.filter(isOpen).length,
      hot: all.filter((l) => isOpen(l) && l.score >= 70).length,
      due: all.filter(isDue).length,
      converted: all.filter((l) => l.converted_at?.slice(0, 7) === monthStart).length,
    }
  }, [data, today])

  const rows = useMemo(() => {
    const s = search.toLocaleLowerCase('tr')
    const list = (data ?? []).filter((l) =>
      (view === 'all' || (view === 'open' ? isOpen(l) : view === 'due' ? isDue(l) : l.status === view)) &&
      (!source || l.source === source) &&
      (!minScore || l.score >= Number(minScore)) &&
      (!s || [l.name, l.city, l.country, l.website, l.contact_name, l.source_detail, ...(l.sectors ?? [])]
        .some((v) => v?.toLocaleLowerCase('tr').includes(s))))
    const by: Record<string, (a: Row, b: Row) => number> = {
      score: (a, b) => b.score - a.score || a.name.localeCompare(b.name, 'tr'),
      next: (a, b) => (a.next_action_date ?? '9999').localeCompare(b.next_action_date ?? '9999') || b.score - a.score,
      created: (a, b) => b.created_at.localeCompare(a.created_at),
      name: (a, b) => a.name.localeCompare(b.name, 'tr'),
    }
    return list.sort(by[sort])
  }, [data, search, view, source, minScore, sort, today])

  const shown = rows.slice(0, limit)
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id))

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function bulk(action: 'status' | 'delete') {
    const ids = [...selected]
    if (!ids.length) return
    setErr(null)
    try {
      if (action === 'delete') {
        if (!confirm(`${ids.length} lead ve temas geçmişleri silinecek. Emin misiniz?`)) return
        for (let i = 0; i < ids.length; i += 200) await q(supabase.from('leads').delete().in('id', ids.slice(i, i + 200)))
      } else {
        if (!bulkStatus) return
        // Dönüştürülmüş lead'lerin durumu toplu işlemle değiştirilmez
        for (let i = 0; i < ids.length; i += 200) {
          await q(supabase.from('leads').update({ status: bulkStatus }).in('id', ids.slice(i, i + 200)).neq('status', 'converted'))
        }
      }
      setSelected(new Set())
      setBulkStatus('')
      reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        title="Lead Generation"
        subtitle="Aday firmalar puanlarına göre sıralanır. Nitelikli olanları firmaya dönüştürün."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setModal('import')}><FileUp className="h-4 w-4" /> İçe aktar</button>
            <button className="btn-primary" onClick={() => setModal('new')}><Plus className="h-4 w-4" /> Yeni lead</button>
          </>
        }
      />
      <ErrorBox error={error ?? err} />
      {msg && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ['Aktif lead', stats.open, 'open'],
          ['Sıcak (70+ puan)', stats.hot, 'hot'],
          ['Takibi gelen', stats.due, 'due'],
          ['Bu ay dönüştürülen', stats.converted, 'converted'],
        ] as const).map(([label, n, key]) => (
          <button key={key} className="card px-4 py-3 text-left hover:border-brand-500"
            onClick={() => {
              setLimit(PAGE)
              if (key === 'hot') { setView('open'); setMinScore('70') }
              else { setView(key); setMinScore('') }
            }}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`mt-0.5 text-2xl font-semibold ${key === 'due' && n > 0 ? 'text-red-600' : 'text-slate-900'}`}>{n}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-2 left-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-8!" placeholder="Firma, kişi, şehir, sektör ara…" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE) }} />
        </div>
        <Select className="w-auto!" options={VIEWS} value={view} onChange={(v) => { setView(v); setLimit(PAGE) }} />
        <Select className="w-auto!" options={LEAD_SOURCES} placeholder="Tüm kaynaklar" value={source} onChange={setSource} />
        <Select className="w-auto!" options={[{ value: '70', label: '70+ puan' }, { value: '40', label: '40+ puan' }]} placeholder="Tüm puanlar" value={minScore} onChange={setMinScore} />
        <Select className="w-auto!" options={SORTS} value={sort} onChange={setSort} />
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm">
          <b>{selected.size} seçili</b>
          <Select className="w-auto!" options={LEAD_STATUSES.filter((s) => s.value !== 'converted')} placeholder="Durum seç…" value={bulkStatus} onChange={setBulkStatus} />
          <button className="btn-secondary" disabled={!bulkStatus} onClick={() => bulk('status')}>Uygula</button>
          <button className="btn-danger" onClick={() => bulk('delete')}><Trash2 className="h-4 w-4" /> Sil</button>
          <button className="btn-ghost ml-auto" onClick={() => setSelected(new Set())}>Seçimi kaldır</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        {loading && !data ? <Spinner /> : rows.length === 0 ? (
          <Empty>
            {data?.length ? 'Bu filtreye uyan lead yok.' : 'Henüz lead yok. “Yeni lead” ile tek tek ekleyin veya “İçe aktar” ile bir liste yükleyin.'}
          </Empty>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-8">
                  <input type="checkbox" checked={allShownSelected} aria-label="Tümünü seç"
                    onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((r) => r.id)))} />
                </th>
                <th>Puan</th><th>Firma</th><th>Sektör</th><th>Konum</th><th>Kaynak</th><th>Durum</th><th>Son temas</th><th>Sonraki adım</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className="cursor-pointer" onClick={() => nav(`/lead-generation/${l.id}`)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label="Seç" />
                  </td>
                  <td><ScorePill score={l.score} /></td>
                  <td>
                    <Link to={`/lead-generation/${l.id}`} className="font-medium text-slate-900" onClick={(e) => e.stopPropagation()}>{l.name}</Link>
                    {l.contact_name && <div className="text-xs text-slate-500">{l.contact_name}</div>}
                  </td>
                  <td className="max-w-48 truncate text-slate-600" title={(l.sectors ?? []).join(', ')}>{(l.sectors ?? []).join(', ')}</td>
                  <td className="text-slate-600">{[l.city, l.country].filter(Boolean).join(', ')}</td>
                  <td className="text-slate-600">
                    {l.source}
                    {l.source_detail && <div className="max-w-40 truncate text-xs text-slate-400" title={l.source_detail}>{l.source_detail}</div>}
                  </td>
                  <td><Badge list={LEAD_STATUSES} value={l.status} /></td>
                  <td className="text-slate-500">{l.last_contact_at ? fmtDate(l.last_contact_at) : '-'}</td>
                  <td className={isDue(l) ? 'font-medium text-red-600' : 'text-slate-600'}>
                    {l.next_action_date && (
                      <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{fmtDate(l.next_action_date)}</span>
                    )}
                    {l.next_action_note && <div className="max-w-48 truncate text-xs font-normal text-slate-500" title={l.next_action_note}>{l.next_action_note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > limit && (
          <div className="border-t border-slate-100 p-2 text-center">
            <button className="btn-ghost" onClick={() => setLimit(limit + PAGE)}>Daha fazla göster ({rows.length - limit} kaldı)</button>
          </div>
        )}
      </div>
      {data && rows.length > 0 && <p className="mt-2 text-xs text-slate-400">{rows.length} lead listeleniyor</p>}

      {modal === 'new' && <LeadForm onClose={() => setModal(null)} onSaved={(l) => nav(`/lead-generation/${l.id}`)} />}
      {modal === 'import' && (
        <LeadImport onClose={() => setModal(null)} onDone={(n) => { setModal(null); setMsg(`${n} lead içe aktarıldı ve puanlandı.`); reload() }} />
      )}
    </>
  )
}
