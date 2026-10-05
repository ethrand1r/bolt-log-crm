import { useMemo, useState } from 'react'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarClock, FileUp, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Lead, LeadSearch } from '../lib/types'
import { LEAD_DIRECTIONS, LEAD_SOURCES, LEAD_STATUSES, LEAD_TYPES, MODES, OPEN_LEAD_STATUSES, label } from '../lib/constants'
import { fmtDate, todayISO } from '../lib/format'
import { fetchAll, getLeadSearches, queueResearch, scoreTone } from '../lib/leads'
import { Badge, Empty, ErrorBox, PageHeader, Select, Spinner, useLoad } from '../components/ui'
import { LeadForm } from '../components/leadForms'
import { LeadImport } from '../components/LeadImport'
import { ResearchBar } from '../components/ResearchBar'

type Row = Pick<Lead, 'id' | 'name' | 'sectors' | 'city' | 'country' | 'website' | 'source' | 'source_detail' | 'status' | 'score'
  | 'next_action_date' | 'next_action_note' | 'last_contact_at' | 'converted_at' | 'contact_name' | 'created_at' | 'search_id' | 'direction' | 'modes'
  | 'lead_type' | 'research_status'>

const COLUMNS = 'id,name,sectors,city,country,website,source,source_detail,status,score,next_action_date,next_action_note,last_contact_at,converted_at,contact_name,created_at,search_id,direction,modes,lead_type,research_status'
const PAGE = 200

/** Liste görünümleri: açık lead'ler, takibi gelenler, tek tek durumlar, tümü */
const VIEWS = [
  { value: 'open', label: 'Aktif' },
  { value: 'due', label: 'Takibi gelen' },
  ...LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label })),
  { value: 'all', label: 'Tümü' },
]

/** Yön filtresi: "İhracatçılar" iki yönlüleri de içerir, "Sadece" seçenekleri içermez */
const DIRECTION_FILTERS: { value: string; label: string; match: (d: string | null) => boolean }[] = [
  { value: 'export', label: 'İhracatçılar', match: (d) => d === 'export' || d === 'both' },
  { value: 'export_only', label: 'Sadece ihracatçı', match: (d) => d === 'export' },
  { value: 'import', label: 'İthalatçılar', match: (d) => d === 'import' || d === 'both' },
  { value: 'import_only', label: 'Sadece ithalatçı', match: (d) => d === 'import' },
  { value: 'both', label: 'İki yönlü', match: (d) => d === 'both' },
  { value: 'none', label: 'Yönü belli değil', match: (d) => !d },
]

const SORTS = [
  { value: 'score', label: 'Puan (yüksek → düşük)' },
  { value: 'next', label: 'Sonraki adım tarihi' },
  { value: 'created', label: 'Eklenme (yeni → eski)' },
  { value: 'name', label: 'Firma adı' },
]

/** Lead Generation alt sekmeleri */
export function LeadTabs() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 px-3 py-2 text-sm font-medium ${isActive ? 'border-brand-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`
  return (
    <div className="mb-4 flex gap-1 border-b border-slate-200">
      <NavLink to="/lead-generation" end className={cls}>Lead'ler</NavLink>
      <NavLink to="/lead-generation/aramalar" className={cls}>Aramalar</NavLink>
      <NavLink to="/lead-generation/arastirma" className={cls}>Araştırma</NavLink>
    </div>
  )
}

export function ScorePill({ score, lead, className = '' }: {
  score: number
  /** Acente ve araştırılmamış lead'ler puanlanmaz, yerine etiket gösterilir */
  lead?: Pick<Lead, 'lead_type' | 'research_status'>
  className?: string
}) {
  const tag = (text: string, title: string, tone = 'bg-slate-100 text-slate-500') =>
    <span className={`inline-flex justify-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${tone} ${className}`} title={title}>{text}</span>
  const rs = lead?.research_status
  if (rs === 'pending') return tag('Araştırılacak', 'Firma internetten araştırıldıktan sonra puanlanacak')
  if (rs === 'running') return tag('Araştırılıyor…', 'Firma şu anda internetten araştırılıyor', 'bg-sky-50 text-sky-700')
  if (rs === 'failed') return tag('Araştırılamadı', 'Araştırma tamamlanamadı; lead ekranından tekrar deneyebilirsiniz', 'bg-red-50 text-red-700')
  if (lead?.lead_type === 'agent' && rs !== 'done') return tag('Acente', 'Yurt dışı acente / forwarder: araştırılınca puanlanır', 'bg-violet-100 text-violet-800')
  return (
    <span className={`inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${scoreTone(score)} ${className}`}
      title="Lead puanı (0-100)">{score}</span>
  )
}

export default function LeadGeneration() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const searchId = params.get('arama') ?? ''
  const setSearchId = (v: string) => { setParams(v ? { arama: v } : {}); setLimit(PAGE) }
  const [search, setSearch] = useState('')
  const [view, setView] = useState('open')
  const [source, setSource] = useState('')
  const [minScore, setMinScore] = useState('')
  const [direction, setDirection] = useState('')
  const [leadType, setLeadType] = useState('')
  const [mode, setMode] = useState('')
  const [sort, setSort] = useState('score')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [modal, setModal] = useState<null | 'new' | 'import'>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { data: loaded, loading, error, reload } = useLoad(async () => {
    const [leads, searches] = await Promise.all([fetchAll<Row>('leads', COLUMNS), getLeadSearches()])
    return { leads, searches }
  })
  const searches: LeadSearch[] = loaded?.searches ?? []
  const searchName = useMemo(() => new Map(searches.map((s) => [s.id, s.name])), [searches])
  // Sayaçlar ve liste seçili aramaya göre daraltılır
  const data = useMemo(
    () => loaded && (searchId ? loaded.leads.filter((l) => (searchId === 'none' ? !l.search_id : l.search_id === searchId)) : loaded.leads),
    [loaded, searchId],
  )

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

  /** skip: o filtre hariç diğer filtreler (seçeneklerin yanındaki sayılar için) */
  const matches = (l: Row, skip?: 'direction' | 'type') => {
    const s = search.toLocaleLowerCase('tr')
    const dir = DIRECTION_FILTERS.find((d) => d.value === direction)
    return (view === 'all' || (view === 'open' ? isOpen(l) : view === 'due' ? isDue(l) : l.status === view)) &&
      (!source || l.source === source) &&
      (!minScore || l.score >= Number(minScore)) &&
      (skip === 'direction' || !dir || dir.match(l.direction)) &&
      (skip === 'type' || !leadType || l.lead_type === leadType) &&
      (!mode || (l.modes ?? []).includes(mode)) &&
      (!s || [l.name, l.city, l.country, l.website, l.contact_name, l.source_detail, ...(l.sectors ?? [])]
        .some((v) => v?.toLocaleLowerCase('tr').includes(s)))
  }

  const filterCounts = useMemo(() => {
    const forDir = (data ?? []).filter((l) => matches(l, 'direction'))
    const forType = (data ?? []).filter((l) => matches(l, 'type'))
    return {
      dirAll: forDir.length,
      dir: Object.fromEntries(DIRECTION_FILTERS.map((d) => [d.value, forDir.filter((l) => d.match(l.direction)).length])),
      typeAll: forType.length,
      type: Object.fromEntries(LEAD_TYPES.map((t) => [t.value, forType.filter((l) => l.lead_type === t.value).length])),
    }
  }, [data, search, view, source, minScore, direction, leadType, mode, today])

  const rows = useMemo(() => {
    const list = (data ?? []).filter((l) => matches(l))
    const by: Record<string, (a: Row, b: Row) => number> = {
      score: (a, b) => b.score - a.score || a.name.localeCompare(b.name, 'tr'),
      next: (a, b) => (a.next_action_date ?? '9999').localeCompare(b.next_action_date ?? '9999') || b.score - a.score,
      created: (a, b) => b.created_at.localeCompare(a.created_at),
      name: (a, b) => a.name.localeCompare(b.name, 'tr'),
    }
    return list.sort(by[sort])
  }, [data, search, view, source, minScore, direction, leadType, mode, sort, today])

  const shown = rows.slice(0, limit)
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id))

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function bulk(action: 'status' | 'delete' | 'research') {
    const ids = [...selected]
    if (!ids.length) return
    setErr(null)
    try {
      if (action === 'research') {
        if (!confirm(`${ids.length} lead internetten araştırılmak üzere sıraya alınacak (dönüştürülmüşler hariç). Daha önce araştırılanlar yeniden araştırılır. Devam edilsin mi?`)) return
        await queueResearch(ids)
      } else if (action === 'delete') {
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
        subtitle={searchId && searchId !== 'none' ? `Arama: ${searchName.get(searchId) ?? '…'}` : 'Aday firmalar puanlarına göre sıralanır. Nitelikli olanları firmaya dönüştürün.'}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setModal('import')}><FileUp className="h-4 w-4" /> İçe aktar</button>
            <button className="btn-primary" onClick={() => setModal('new')}><Plus className="h-4 w-4" /> Yeni lead</button>
          </>
        }
      />
      <LeadTabs />
      <ErrorBox error={error ?? err} />
      <ResearchBar onChange={reload} />
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
        <Select className="w-auto!" options={[{ value: 'none', label: 'Aramaya bağlı olmayanlar' }, ...searches.map((s) => ({ value: s.id, label: s.name }))]}
          placeholder="Tüm aramalar" value={searchId} onChange={setSearchId} />
        <Select className="w-auto!" options={VIEWS} value={view} onChange={(v) => { setView(v); setLimit(PAGE) }} />
        <Select className="w-auto!" options={LEAD_SOURCES} placeholder="Tüm kaynaklar" value={source} onChange={setSource} />
        <Select className="w-auto!" options={[{ value: '70', label: '70+ puan' }, { value: '40', label: '40+ puan' }]} placeholder="Tüm puanlar" value={minScore} onChange={setMinScore} />
        <Select className="w-auto!" options={DIRECTION_FILTERS.map((d) => ({ value: d.value, label: `${d.label} (${filterCounts.dir[d.value]})` }))}
          placeholder={`Tüm yönler (${filterCounts.dirAll})`} value={direction} onChange={(v) => { setDirection(v); setLimit(PAGE) }} />
        <Select className="w-auto!" options={LEAD_TYPES.map((t) => ({ value: t.value, label: `${t.label} (${filterCounts.type[t.value]})` }))}
          placeholder={`Tüm türler (${filterCounts.typeAll})`} value={leadType} onChange={(v) => { setLeadType(v); setLimit(PAGE) }} />
        <Select className="w-auto!" options={MODES} placeholder="Tüm modlar" value={mode} onChange={(v) => { setMode(v); setLimit(PAGE) }} />
        <Select className="w-auto!" options={SORTS} value={sort} onChange={setSort} />
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm">
          <b>{selected.size} seçili</b>
          <Select className="w-auto!" options={LEAD_STATUSES.filter((s) => s.value !== 'converted')} placeholder="Durum seç…" value={bulkStatus} onChange={setBulkStatus} />
          <button className="btn-secondary" disabled={!bulkStatus} onClick={() => bulk('status')}>Uygula</button>
          <button className="btn-secondary" onClick={() => bulk('research')}><Sparkles className="h-4 w-4" /> Araştırmaya gönder</button>
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
                <th>Puan</th><th>Firma</th><th>Sektör</th><th>Konum</th><th>Yön / Mod</th><th>Arama / Kaynak</th><th>Durum</th><th>Son temas</th><th>Sonraki adım</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className="cursor-pointer" onClick={() => nav(`/lead-generation/${l.id}`)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label="Seç" />
                  </td>
                  <td><ScorePill score={l.score} lead={l} /></td>
                  <td>
                    <Link to={`/lead-generation/${l.id}`} className="font-medium text-slate-900" onClick={(e) => e.stopPropagation()}>{l.name}</Link>
                    {l.lead_type === 'agent' && <Badge list={LEAD_TYPES} value="agent" className="ml-1.5" />}
                    {l.contact_name && <div className="text-xs text-slate-500">{l.contact_name}</div>}
                  </td>
                  <td className="max-w-48 truncate text-slate-600" title={(l.sectors ?? []).join(', ')}>{(l.sectors ?? []).join(', ')}</td>
                  <td className="text-slate-600">{[l.city, l.country].filter(Boolean).join(', ')}</td>
                  <td className="whitespace-nowrap">
                    <div className="text-slate-700">{label(LEAD_DIRECTIONS, l.direction) || <span className="text-slate-400">-</span>}</div>
                    {(l.modes ?? []).length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">{(l.modes ?? []).map((m) => <Badge key={m} list={MODES} value={m} />)}</div>
                    )}
                  </td>
                  <td className="text-slate-600">
                    {l.search_id && <div className="max-w-44 truncate font-medium text-slate-700">{searchName.get(l.search_id)}</div>}
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

      {modal === 'new' && <LeadForm defaultSearchId={searchId && searchId !== 'none' ? searchId : null} onClose={() => setModal(null)} onSaved={(l) => nav(`/lead-generation/${l.id}`)} />}
      {modal === 'import' && (
        <LeadImport defaultSearchId={searchId && searchId !== 'none' ? searchId : null} onClose={() => setModal(null)} onDone={(n) => { setModal(null); setMsg(`${n} lead içe aktarıldı ve puanlandı.`); reload() }} />
      )}
    </>
  )
}
