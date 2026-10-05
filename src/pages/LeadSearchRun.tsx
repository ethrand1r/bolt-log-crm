import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Globe2, Loader2, Pencil, Play, RotateCcw, Square } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { LeadConfig, LeadSearch, LeadSearchQuery } from '../lib/types'
import { SEARCH_QUERY_STATUSES } from '../lib/constants'
import { fmtDateTime } from '../lib/format'
import { getPlacesUsage, getSearchQueries, planSearch, requeueQueries, runPlacesBatch } from '../lib/leads'
import { getSettings } from '../lib/refdata'
import { DEFAULT_LEAD_CONFIG } from '../lib/trade'
import { Badge, Empty, ErrorBox, PageHeader, Section, Select, Spinner } from '../components/ui'
import { ResearchBar } from '../components/ResearchBar'

/** Bir Edge Function çağrısında çalışan sorgu sayısı (sayfa başına ~1 sn, fonksiyon süre sınırının altında kalır) */
const BATCH = 3

export default function LeadSearchRun() {
  const { id = '' } = useParams<{ id: string }>()
  const [search, setSearch] = useState<LeadSearch | null>(null)
  const [cfg, setCfg] = useState<LeadConfig>(DEFAULT_LEAD_CONFIG)
  const [queries, setQueries] = useState<LeadSearchQuery[]>([])
  const [usage, setUsage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [progress, setProgress] = useState<{ processed: number; found: number; inserted: number } | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [dirFilter, setDirFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const stopRef = useRef(false)

  const reloadQueries = async () => {
    const list = await getSearchQueries(id)
    setQueries(list)
    return list
  }

  // Açılışta plan kriterlere göre güncellenir (kriterler düzenlendiyse yeni sorgular eklenir)
  useEffect(() => {
    (async () => {
      try {
        const [s, settings, u] = await Promise.all([
          q<LeadSearch>(supabase.from('lead_searches').select('*').eq('id', id).single()),
          getSettings(),
          getPlacesUsage(),
        ])
        setSearch(s)
        setCfg({ ...DEFAULT_LEAD_CONFIG, ...settings.lead_config })
        setUsage(u)
        await planSearch(id)
        await reloadQueries()
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
    return () => { stopRef.current = true }
  }, [id])

  const stats = useMemo(() => {
    const by = (s: string) => queries.filter((x) => x.status === s)
    return {
      pending: by('pending').length,
      done: by('done').length,
      error: by('error'),
      found: queries.reduce((a, x) => a + x.found, 0),
      inserted: queries.reduce((a, x) => a + x.inserted, 0),
    }
  }, [queries])

  const rows = useMemo(() => queries
    .filter((x) => (!statusFilter || x.status === statusFilter) && (!dirFilter || x.direction === dirFilter))
    .sort((a, b) => a.direction.localeCompare(b.direction) || a.sector.localeCompare(b.sector, 'tr') || a.city.localeCompare(b.city, 'tr')),
  [queries, statusFilter, dirFilter])

  const estimate = stats.pending * cfg.places_pages
  const quotaLeft = Math.max(0, cfg.places_monthly_limit - usage)

  async function run() {
    stopRef.current = false
    setRunning(true)
    setError(null)
    setMsg(null)
    const total = { processed: 0, found: 0, inserted: 0 }
    setProgress(total)
    const startedAt = new Date(Date.now() - 60_000).toISOString()
    let latest: LeadSearchQuery[] = queries
    try {
      while (!stopRef.current) {
        const r = await runPlacesBatch(id, BATCH)
        total.processed += r.processed
        total.found += r.found
        total.inserted += r.inserted
        setProgress({ ...total })
        setUsage(r.usage)
        latest = await reloadQueries()
        if (r.stopped) { setError(r.stopped); break }
        if (!r.remaining || !r.processed) break
      }
      // Bu çalıştırmada hataya düşen sorgular (saat farkı için 1 dk pay bırakılır)
      const failed = latest.filter((x) => x.status === 'error' && x.ran_at && x.ran_at >= startedAt).length
      const summary = `${total.processed} sorgu, ${total.found} firma bulundu, ${total.inserted} yeni lead eklendi`
      if (failed) setError(`${failed} sorgu hata verdi (${summary}). Hata mesajları aşağıdaki tabloda.`)
      else if (!stopRef.current) setMsg(`Tarama tamamlandı: ${summary}.`)
    } catch (e) {
      setError((e as Error).message)
      await reloadQueries().catch(() => {})
    } finally {
      setRunning(false)
      setStopping(false)
    }
  }

  async function requeue(list: LeadSearchQuery[], what: string) {
    if (!list.length) return
    if (what === 'all' && !confirm(`${list.length} taranmış sorgu yeniden çalıştırılmak üzere sıraya alınacak (yeni açılan firmaları yakalamak için). Mükerrer firmalar eklenmez. Devam edilsin mi?`)) return
    try {
      for (let i = 0; i < list.length; i += 200) await requeueQueries(list.slice(i, i + 200).map((x) => x.id))
      await reloadQueries()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (loading) return <Spinner />
  if (!search) return <ErrorBox error={error ?? 'Arama bulunamadı.'} />

  return (
    <>
      <Link to="/lead-generation/aramalar" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Aramalar
      </Link>
      <PageHeader
        title={`${search.name}: Google taraması`}
        subtitle="Her sektör ve il için Google Haritalar'da firma aranır; bulunanlar mükerrer kontrolünden geçip lead havuzuna “araştırılacak” olarak eklenir. Puanlama, firmalar araştırıldıktan sonra yapılır."
        actions={
          <>
            <Link to={`/lead-generation/aramalar/${id}`} className="btn-secondary"><Pencil className="h-4 w-4" /> Kriterler</Link>
            <Link to={`/lead-generation?arama=${id}`} className="btn-secondary">Lead'leri gör ({stats.inserted})</Link>
          </>
        }
      />
      <ErrorBox error={error} />
      <ResearchBar />
      {msg && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([
          ['Sorgu', queries.length],
          ['Bekleyen', stats.pending],
          ['Bulunan firma', stats.found],
          ['Havuza eklenen', stats.inserted],
          ['Bu ay Google isteği', `${usage} / ${cfg.places_monthly_limit}`],
        ] as const).map(([k, v]) => (
          <div key={k} className="card px-4 py-3">
            <div className="text-xs text-slate-500">{k}</div>
            <div className="mt-0.5 text-2xl font-semibold text-slate-900 tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        {running ? (
          <button className="btn-secondary" disabled={stopping} onClick={() => { stopRef.current = true; setStopping(true) }}><Square className="h-4 w-4" /> Durdur</button>
        ) : (
          <button className="btn-primary" disabled={!stats.pending || !quotaLeft} onClick={run}><Play className="h-4 w-4" /> Taramayı başlat</button>
        )}
        <div className="text-sm text-slate-600">
          {running && progress ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stopping ? 'Mevcut parti bitince duracak…' : `${progress.processed} sorgu tarandı, ${progress.found} firma bulundu, ${progress.inserted} yeni lead`}
            </span>
          ) : stats.pending ? (
            <>
              {stats.pending} bekleyen sorgu, tahmini <b>{estimate}</b> Google isteği (sorgu başına {cfg.places_pages} sayfa).
              {estimate > quotaLeft && <span className="text-amber-700"> Bu ay kalan {quotaLeft} istek; sınıra gelince tarama durur, kalan sorgular bekler.</span>}
            </>
          ) : 'Bekleyen sorgu yok.'}
        </div>
        {!running && (
          <div className="ml-auto flex gap-2">
            {stats.error.length > 0 && (
              <button className="btn-ghost text-xs" onClick={() => requeue(stats.error, 'error')}><RotateCcw className="h-3.5 w-3.5" /> Hatalıları tekrar dene ({stats.error.length})</button>
            )}
            {stats.done > 0 && (
              <button className="btn-ghost text-xs" onClick={() => requeue(queries.filter((x) => x.status === 'done'), 'all')}><RotateCcw className="h-3.5 w-3.5" /> Tümünü yeniden tara</button>
            )}
          </div>
        )}
      </div>

      <Section title="Sorgular" actions={
        <div className="flex gap-2">
          <Select className="w-auto!" options={[{ value: 'export', label: 'İhracat' }, { value: 'import', label: 'İthalat' }, { value: 'agent', label: 'Acente / forwarder' }]} placeholder="Tüm yönler" value={dirFilter} onChange={setDirFilter} />
          <Select className="w-auto!" options={SEARCH_QUERY_STATUSES} placeholder="Tüm durumlar" value={statusFilter} onChange={setStatusFilter} />
        </div>
      }>
        <p className="mb-2 text-xs text-slate-500">
          Sorgular aramanın sektör ve illerinden, sektör anahtar kelimeleriyle oluşturulur (“&lt;anahtar kelime&gt; &lt;il&gt;”).
          Anahtar kelimeler <Link to="/ayarlar" className="text-brand-600 hover:underline">Ayarlar</Link>’dan değiştirilebilir; değişiklik bu sayfa yeniden açılınca plana yansır.
        </p>
        {rows.length === 0 ? <Empty>Sorgu yok. Aramanın kriterlerinde sektör ve il seçili olmalı.</Empty> : (
          <div className="-mx-4 -mb-4 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Yön</th><th>Sektör</th><th>Sorgu</th><th>Durum</th><th className="text-right">Bulunan</th><th className="text-right">Eklenen</th><th>Çalıştı</th></tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap">
                      {x.direction === 'export'
                        ? <span className="flex items-center gap-1 text-slate-600"><ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />İhracat</span>
                        : x.direction === 'import'
                          ? <span className="flex items-center gap-1 text-slate-600"><ArrowDownLeft className="h-3.5 w-3.5 text-sky-600" />İthalat</span>
                          : <span className="flex items-center gap-1 text-slate-600"><Globe2 className="h-3.5 w-3.5 text-violet-600" />Acente</span>}
                    </td>
                    <td className="text-slate-700">{x.sector}</td>
                    <td className="font-medium text-slate-800">{x.query}</td>
                    <td>
                      <Badge list={SEARCH_QUERY_STATUSES} value={x.status} />
                      {x.error && <div className="max-w-64 truncate text-xs text-red-600" title={x.error}>{x.error}</div>}
                    </td>
                    <td className="text-right tabular-nums">{x.ran_at ? x.found : '-'}</td>
                    <td className="text-right tabular-nums font-medium">{x.ran_at ? x.inserted : '-'}</td>
                    <td className="whitespace-nowrap text-slate-500">{x.ran_at ? fmtDateTime(x.ran_at) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  )
}
