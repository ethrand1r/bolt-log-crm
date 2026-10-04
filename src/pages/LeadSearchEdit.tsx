import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, BarChart3, Loader2, RefreshCw, Repeat, Save } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { LeadConfig, LeadSearch, SearchCriteria, TradeData } from '../lib/types'
import { getCountries, getSettings } from '../lib/refdata'
import { DEFAULT_LEAD_CONFIG, HS_CHAPTERS, MODE_HINT_LABEL, analyzeFlow, fmtUsd, getTradeData, trendPct, type SectorStat } from '../lib/trade'
import { fmtDateTime } from '../lib/format'
import { ErrorBox, Field, PageHeader, Section, Spinner } from '../components/ui'
import { CityMultiPicker, CountryPicker } from '../components/pickers'

type Flow = 'X' | 'M'
const FLOW_INFO: Record<Flow, { key: 'export' | 'import'; title: string; who: string }> = {
  X: { key: 'export', title: 'İhracat', who: 'Bu sektörlerde o ülkeye satış yapan Türk ihracatçılar aranır.' },
  M: { key: 'import', title: 'İthalat', who: 'Bu sektörlerde o ülkeden mal getiren Türk ithalatçılar aranır.' },
}
const VISIBLE = 12

interface Selection { on: Set<string>; cities: Record<string, string[]> }

export default function LeadSearchEdit() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id
  const nav = useNavigate()

  const [cfg, setCfg] = useState<LeadConfig>(DEFAULT_LEAD_CONFIG)
  const [regions, setRegions] = useState<Map<string, string[]>>(new Map())
  const [countryNames, setCountryNames] = useState<Map<string, string>>(new Map())
  const [search, setSearch] = useState<LeadSearch | null>(null)
  const [country, setCountry] = useState<string | null>(null)
  const [trade, setTrade] = useState<TradeData | null>(null)
  const [sel, setSel] = useState<Record<Flow, Selection>>({ X: { on: new Set(), cities: {} }, M: { on: new Set(), cities: {} } })
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [showAll, setShowAll] = useState<Record<Flow, boolean>>({ X: false, M: false })
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ayarlar, sektör bölgeleri, ülke adları ve (düzenlemede) arama
  useEffect(() => {
    (async () => {
      try {
        const [settings, regionRows, countries] = await Promise.all([
          getSettings(),
          q<{ sector: string; cities: string[] }[]>(supabase.from('sector_regions').select('sector,cities')),
          getCountries(),
        ])
        setCfg({ ...DEFAULT_LEAD_CONFIG, ...settings.lead_config })
        setRegions(new Map(regionRows.map((r) => [r.sector, r.cities])))
        setCountryNames(new Map(countries.map((c) => [c.code, c.tr || c.name])))
        if (id) {
          const s = await q<LeadSearch>(supabase.from('lead_searches').select('*').eq('id', id).single())
          setSearch(s)
          setCountry(s.country_code)
          setName(s.name)
          setNotes(s.notes ?? '')
          setSel({ X: fromCriteria(s.criteria.export), M: fromCriteria(s.criteria.import) })
          setTrade(await getTradeData(s.country_code))
        }
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  const analysis = useMemo(() => {
    if (!trade) return null
    return { X: analyzeFlow(trade, 'X', cfg, regions), M: analyzeFlow(trade, 'M', cfg, regions) }
  }, [trade, cfg, regions])

  async function analyze(force = false) {
    if (!country) return
    setFetching(true)
    setError(null)
    try {
      const t = await getTradeData(country, force)
      setTrade(t)
      if (isNew) {
        // Yeni aramada kurala göre otomatik seçim ve varsayılan bölgeler
        const a = { X: analyzeFlow(t, 'X', cfg, regions), M: analyzeFlow(t, 'M', cfg, regions) }
        const init = (list: SectorStat[]): Selection => ({
          on: new Set(list.filter((s) => s.auto).map((s) => s.sector)),
          cities: Object.fromEntries(list.map((s) => [s.sector, s.cities])),
        })
        setSel({ X: init(a.X.sectors), M: init(a.M.sectors) })
        setName(`${countryNames.get(country) ?? country} – ihracat & ithalat`)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  const both = useMemo(() => [...sel.X.on].filter((s) => sel.M.on.has(s)), [sel])

  function toggle(flow: Flow, sector: string, defaultCities: string[]) {
    setSel((p) => {
      const on = new Set(p[flow].on)
      if (on.has(sector)) on.delete(sector)
      else on.add(sector)
      const cities = p[flow].cities[sector] ? p[flow].cities : { ...p[flow].cities, [sector]: defaultCities }
      return { ...p, [flow]: { on, cities } }
    })
  }
  const setCities = (flow: Flow, sector: string, cities: string[]) =>
    setSel((p) => ({ ...p, [flow]: { ...p[flow], cities: { ...p[flow].cities, [sector]: cities } } }))

  async function save() {
    if (!analysis || !trade || !country) return
    if (!name.trim()) return setError('Arama adı girin.')
    if (!sel.X.on.size && !sel.M.on.size) return setError('En az bir sektör seçin.')
    setSaving(true)
    setError(null)
    try {
      const pick = (flow: Flow) => analysis[flow].sectors
        .filter((s) => sel[flow].on.has(s.sector))
        .map(({ auto: _auto, ...s }) => ({ ...s, cities: sel[flow].cities[s.sector] ?? s.cities }))
      const criteria: SearchCriteria = { year: trade.year, prev_year: trade.prevYear, export: pick('X'), import: pick('M') }
      const payload = { name: name.trim(), country_code: country, country: countryNames.get(country) ?? country, criteria, notes: notes.trim() || null }
      let saved = search?.id
      if (saved) await q(supabase.from('lead_searches').update(payload).eq('id', saved))
      else saved = (await q<{ id: string }>(supabase.from('lead_searches').insert(payload).select('id').single())).id
      // Onaylanan kriterlerle tarama ekranına geçilir (plan orada güncellenir)
      nav(`/lead-generation/aramalar/${saved}/tarama`)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  if (loading) return <Spinner />

  const summary = analysis && (['X', 'M'] as Flow[]).map((f) => {
    const chosen = analysis[f].sectors.filter((s) => sel[f].on.has(s.sector))
    return { f, count: chosen.length, share: chosen.reduce((a, s) => a + s.share, 0), total: analysis[f].total }
  })

  return (
    <>
      <Link to="/lead-generation/aramalar" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Aramalar
      </Link>
      <PageHeader title={isNew ? 'Yeni lead araması' : search?.name ?? 'Arama'} subtitle="Hedef ülkeyi seçin; sektörler ve bölgeler ticaret verisinden çıkarılır. Kaydetmeden önce düzenleyebilirsiniz." />
      <ErrorBox error={error} />

      <Section title="1. Hedef ülke" className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-72">
            {isNew
              ? <CountryPicker value={country} onChange={(c) => { setCountry(c); setTrade(null) }} />
              : <div className="py-1.5 font-medium">{countryNames.get(country ?? '') ?? country}</div>}
          </div>
          {isNew && !trade && (
            <button className="btn-primary" disabled={!country || fetching} onClick={() => analyze()}>
              <BarChart3 className="h-4 w-4" /> Ticaret verisini analiz et
            </button>
          )}
          {trade && (
            <button className="btn-ghost text-xs" disabled={fetching} onClick={() => analyze(true)} title="Comtrade'den yeniden çek">
              <RefreshCw className="h-3.5 w-3.5" /> Veriyi yenile
            </button>
          )}
        </div>
        {fetching && (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> UN Comtrade’den Türkiye ↔ {countryNames.get(country ?? '')} ticaret verisi çekiliyor. Bu 15-30 saniye sürebilir…
          </p>
        )}
        {trade && (
          <p className="mt-2 text-xs text-slate-400">
            Kaynak: UN Comtrade, {trade.year} yılı (trend: {trade.prevYear} ile karşılaştırma)
            {trade.fetched_at && ` · Çekildi: ${fmtDateTime(trade.fetched_at)}`}
          </p>
        )}
      </Section>

      {analysis && summary && (
        <>
          <Section title="2. Arama kriterleri özeti" className="mb-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-3">
                <Field label="Arama adı"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Notlar"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              </div>
              <div className="space-y-2 text-sm">
                {summary.map(({ f, count, share, total }) => (
                  <div key={f} className="flex items-center gap-2">
                    {f === 'X' ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownLeft className="h-4 w-4 text-sky-600" />}
                    <span><b>{FLOW_INFO[f].title}:</b> {count} sektör, toplam {fmtUsd(total)} hacmin <b>%{Math.round(share * 100)}</b>’i</span>
                  </div>
                ))}
                <div className="flex items-start gap-2">
                  <Repeat className="mt-0.5 h-4 w-4 text-amber-600" />
                  <span>
                    <b>İki yönde yoğun:</b> {both.length ? both.join(', ') : 'yok'}
                    {both.length > 0 && <span className="block text-xs text-slate-500">Bu sektörlerdeki lead'ler otomatik olarak “İhracat + İthalat” işaretlenir.</span>}
                  </span>
                </div>
                <p className="pt-1 text-xs text-slate-500">
                  Otomatik seçim kuralı: her yönde hacmin %{cfg.coverage}’ini oluşturan sektörler, en fazla {cfg.max_sectors}.
                  Bölgeler: sektörün yoğunlaştığı iller + {cfg.always_cities.join(', ')}.
                  {cfg.excluded_sectors.length > 0 && ` Hariç tutulan: ${cfg.excluded_sectors.join(', ')}.`}{' '}
                  <Link to="/ayarlar" className="text-brand-600 hover:underline">Ayarlar</Link>
                </p>
              </div>
            </div>
          </Section>

          {(['X', 'M'] as Flow[]).map((f) => {
            const rows = analysis[f].sectors
            const visible = showAll[f] ? rows : rows.filter((s, i) => i < VISIBLE || sel[f].on.has(s.sector))
            return (
              <Section key={f} title={`3${f === 'X' ? 'a' : 'b'}. ${FLOW_INFO[f].title} sektörleri (${sel[f].on.size} seçili)`} className="mb-4">
                <p className="mb-2 text-xs text-slate-500">{FLOW_INFO[f].who}</p>
                {rows.length === 0 ? <p className="text-sm text-slate-400">Bu yönde ticaret verisi yok.</p> : (
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr><th className="w-8"></th><th>Sektör</th><th className="text-right">Hacim</th><th className="text-right">Pay</th><th className="text-right">Trend</th><th>Mod</th><th className="min-w-72">Hedef bölgeler</th></tr>
                      </thead>
                      <tbody>
                        {visible.map((s) => {
                          const on = sel[f].on.has(s.sector)
                          const t = trendPct(s.value, s.prev_value)
                          return (
                            <tr key={s.sector} className={on ? '' : 'opacity-60'}>
                              <td><input type="checkbox" checked={on} onChange={() => toggle(f, s.sector, s.cities)} aria-label={s.sector} /></td>
                              <td>
                                <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                  {s.sector}
                                  {on && both.includes(s.sector) && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">İKİ YÖNDE</span>}
                                </div>
                                <div className="max-w-72 truncate text-xs text-slate-400" title={s.hs.map((h) => `${h} ${HS_CHAPTERS[h]?.name ?? ''}`).join('\n')}>
                                  HS {s.hs.join(', ')}
                                </div>
                              </td>
                              <td className="text-right tabular-nums">{fmtUsd(s.value)}</td>
                              <td className="text-right tabular-nums">%{(s.share * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</td>
                              <td className={`text-right tabular-nums ${t === null ? 'text-slate-400' : t >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {t === null ? '-' : `${t >= 0 ? '+' : ''}${Math.round(t * 100)}%`}
                              </td>
                              <td className="whitespace-nowrap text-slate-600">{MODE_HINT_LABEL[s.mode]}</td>
                              <td>
                                {on
                                  ? <CityMultiPicker countryCode="TR" value={sel[f].cities[s.sector] ?? s.cities} onChange={(v) => setCities(f, s.sector, v)} />
                                  : <span className="text-xs text-slate-400">{s.cities.join(', ')}</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {rows.length > visible.length && (
                  <button className="btn-ghost mt-2 text-xs" onClick={() => setShowAll({ ...showAll, [f]: true })}>Tüm sektörleri göster ({rows.length})</button>
                )}
              </Section>
            )
          })}

          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-surface px-4 py-3 lg:-mx-6 lg:px-6">
            <span className="mr-auto text-xs text-slate-500">
              Kaydedince Google taraması ekranına geçilir; tarama oradan başlatılır.
            </span>
            <Link to="/lead-generation/aramalar" className="btn-secondary">Vazgeç</Link>
            <button className="btn-primary" disabled={saving} onClick={save}><Save className="h-4 w-4" /> {saving ? 'Kaydediliyor…' : 'Kriterleri onayla, taramaya geç'}</button>
          </div>
        </>
      )}
    </>
  )
}

function fromCriteria(list: { sector: string; cities: string[] }[]): Selection {
  return { on: new Set(list.map((s) => s.sector)), cities: Object.fromEntries(list.map((s) => [s.sector, s.cities])) }
}
