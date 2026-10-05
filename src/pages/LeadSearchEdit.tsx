import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, BarChart3, Globe2, Loader2, RefreshCw, Repeat, Save, X } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { LeadConfig, LeadSearch, SearchCriteria, SearchSector, TradeData } from '../lib/types'
import { getCountries, getHubCities, getSettings } from '../lib/refdata'
import {
  DEFAULT_AGENT_KEYWORDS, DEFAULT_LEAD_CONFIG, HS_CHAPTERS, MODE_HINT_LABEL, analyzeFlow, fmtUsd, getTradeData, sectorProfile,
  trendPct, uniqueCities, type SectorStat,
} from '../lib/trade'
import { fmtDateTime } from '../lib/format'
import { Combobox } from '../components/Combobox'
import { ErrorBox, Field, PageHeader, Section, Spinner } from '../components/ui'
import { CityMultiPicker, CountryPicker, ListInput } from '../components/pickers'

type Flow = 'X' | 'M'
const FLOW_INFO: Record<Flow, { key: 'export' | 'import'; title: string; who: string }> = {
  X: { key: 'export', title: 'İhracat', who: 'Bu sektörlerde o ülkeye satış yapan Türk ihracatçılar aranır.' },
  M: { key: 'import', title: 'İthalat', who: 'Bu sektörlerde o ülkeden mal getiren Türk ithalatçılar aranır.' },
}
const VISIBLE = 12

interface Selection { on: Set<string>; cities: Record<string, string[]> }
interface Agents { cities: string[]; keywords: string[] }
/** Tablodaki satır: ticaret verisinden gelen sektör ya da elle eklenen (manual) */
type Row = SectorStat & { manual?: boolean }

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
  /** Bu oturumda elle eklenen sektörler (işareti kaldırılsa da listede kalsın) */
  const [extra, setExtra] = useState<Record<Flow, string[]>>({ X: [], M: [] })
  const [agents, setAgents] = useState<Agents | null>(null)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [showAll, setShowAll] = useState<Record<Flow, boolean>>({ X: false, M: false })
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cname = (code: string | null) => (code ? countryNames.get(code) ?? code : '')

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
          setAgents(s.criteria.agents ?? null)
          // Sadece acente araması ise ticaret verisi çekilmez (gerekirse "analiz et" ile)
          if (s.criteria.export.length || s.criteria.import.length) setTrade(await getTradeData(s.country_code))
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

  const defaultCities = (sector: string) => uniqueCities([...(regions.get(sector) ?? []), ...cfg.always_cities])

  /** Ticaret verisindeki sektörler + elle eklenenler (veri yok: hacim 0) */
  const rowsOf = (f: Flow): Row[] => {
    const base: Row[] = analysis?.[f].sectors ?? []
    const known = new Set(base.map((s) => s.sector))
    const manual = uniqueCities([...extra[f], ...sel[f].on]).filter((s) => !known.has(s)).map((sector): Row => ({
      sector, value: 0, prev_value: 0, share: 0, ...sectorProfile(sector), cities: defaultCities(sector), auto: false, manual: true,
    }))
    return [...base, ...manual]
  }

  async function analyze(force = false) {
    if (!country) return
    setFetching(true)
    setError(null)
    try {
      const t = await getTradeData(country, force)
      setTrade(t)
      // Henüz sektör seçilmemişse kurala göre otomatik seçim ve varsayılan bölgeler
      if (!sel.X.on.size && !sel.M.on.size) {
        const a = { X: analyzeFlow(t, 'X', cfg, regions), M: analyzeFlow(t, 'M', cfg, regions) }
        const init = (list: SectorStat[]): Selection => ({
          on: new Set(list.filter((s) => s.auto).map((s) => s.sector)),
          cities: Object.fromEntries(list.map((s) => [s.sector, s.cities])),
        })
        setSel({ X: init(a.X.sectors), M: init(a.M.sectors) })
      }
      if (isNew) setName(`${cname(country)} – ${agents ? 'ihracat, ithalat & acenteler' : 'ihracat & ithalat'}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  async function startAgents() {
    if (!country) return
    setError(null)
    const cities = await getHubCities(country).catch(() => [] as string[])
    setAgents({ cities, keywords: DEFAULT_AGENT_KEYWORDS })
    if (isNew) setName(`${cname(country)} – ${trade ? 'ihracat, ithalat & acenteler' : 'forwarder & acenteler'}`)
  }

  const both = useMemo(() => [...sel.X.on].filter((s) => sel.M.on.has(s)), [sel])

  function toggle(flow: Flow, sector: string, cities: string[]) {
    setSel((p) => {
      const on = new Set(p[flow].on)
      if (on.has(sector)) on.delete(sector)
      else on.add(sector)
      const c = p[flow].cities[sector] ? p[flow].cities : { ...p[flow].cities, [sector]: cities }
      return { ...p, [flow]: { on, cities: c } }
    })
  }
  const setCities = (flow: Flow, sector: string, cities: string[]) =>
    setSel((p) => ({ ...p, [flow]: { ...p[flow], cities: { ...p[flow].cities, [sector]: cities } } }))

  function addSector(flow: Flow, sector: string | null) {
    if (!sector || sel[flow].on.has(sector)) return
    if (!analysis?.[flow].sectors.some((s) => s.sector === sector)) setExtra((p) => ({ ...p, [flow]: [...p[flow], sector] }))
    toggle(flow, sector, analysis?.[flow].sectors.find((s) => s.sector === sector)?.cities ?? defaultCities(sector))
  }

  async function save() {
    if (!country) return
    if (!name.trim()) return setError('Arama adı girin.')
    const agentsOk = agents && agents.cities.length > 0 && agents.keywords.length > 0
    if (agents && !agentsOk) return setError('Acente araması için en az bir şehir ve bir anahtar kelime girin (ya da acente bölümünü kaldırın).')
    if (!sel.X.on.size && !sel.M.on.size && !agentsOk) return setError('En az bir sektör seçin ya da acente araması ekleyin.')
    setSaving(true)
    setError(null)
    try {
      const pick = (flow: Flow): SearchSector[] => rowsOf(flow)
        .filter((s) => sel[flow].on.has(s.sector))
        .map(({ auto: _auto, manual: _manual, ...s }) => ({ ...s, cities: sel[flow].cities[s.sector] ?? s.cities }))
      const criteria: SearchCriteria = {
        year: trade?.year ?? 0, prev_year: trade?.prevYear ?? 0, export: pick('X'), import: pick('M'),
        ...(agentsOk ? { agents: agents! } : {}),
      }
      const payload = { name: name.trim(), country_code: country, country: cname(country), criteria, notes: notes.trim() || null }
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

  const ready = !!analysis || !!agents
  const summary = analysis && (['X', 'M'] as Flow[]).map((f) => {
    const chosen = rowsOf(f).filter((s) => sel[f].on.has(s.sector))
    return { f, count: chosen.length, share: chosen.reduce((a, s) => a + s.share, 0), total: analysis[f].total }
  })
  const allSectors = [...regions.keys()].sort((a, b) => a.localeCompare(b, 'tr'))

  return (
    <>
      <Link to="/lead-generation/aramalar" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Aramalar
      </Link>
      <PageHeader title={isNew ? 'Yeni lead araması' : search?.name ?? 'Arama'}
        subtitle="Hedef ülkeyi seçin. Ticaret verisinden Türkiye'deki ihracatçı / ithalatçı sektörleri çıkarılır; isterseniz o ülkedeki forwarder ve acenteleri de arayabilirsiniz." />
      <ErrorBox error={error} />

      <Section title="1. Hedef ülke" className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-72">
            {isNew
              ? <CountryPicker value={country} onChange={(c) => { setCountry(c); setTrade(null); setAgents(null); setSel({ X: { on: new Set(), cities: {} }, M: { on: new Set(), cities: {} } }); setExtra({ X: [], M: [] }) }} />
              : <div className="py-1.5 font-medium">{cname(country)}</div>}
          </div>
          {!trade && (
            <button className="btn-primary" disabled={!country || fetching} onClick={() => analyze()}>
              <BarChart3 className="h-4 w-4" /> Ticaret verisini analiz et
            </button>
          )}
          {!agents && (
            <button className="btn-secondary" disabled={!country} onClick={startAgents} title="Hedef ülkedeki freight forwarder, lojistik ve nakliye acentelerini bul">
              <Globe2 className="h-4 w-4" /> Bu ülkedeki forwarder / acenteleri bul
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
            <Loader2 className="h-4 w-4 animate-spin" /> UN Comtrade’den Türkiye ↔ {cname(country)} ticaret verisi çekiliyor. Bu 15-30 saniye sürebilir…
          </p>
        )}
        {trade && (
          <p className="mt-2 text-xs text-slate-400">
            Kaynak: UN Comtrade, {trade.year} yılı (trend: {trade.prevYear} ile karşılaştırma)
            {trade.fetched_at && ` · Çekildi: ${fmtDateTime(trade.fetched_at)}`}
          </p>
        )}
      </Section>

      {ready && (
        <>
          <Section title="2. Arama kriterleri özeti" className="mb-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-3">
                <Field label="Arama adı"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Notlar"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              </div>
              <div className="space-y-2 text-sm">
                {summary?.map(({ f, count, share, total }) => (
                  <div key={f} className="flex items-center gap-2">
                    {f === 'X' ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownLeft className="h-4 w-4 text-sky-600" />}
                    <span><b>{FLOW_INFO[f].title}:</b> {count} sektör, toplam {fmtUsd(total)} hacmin <b>%{Math.round(share * 100)}</b>’i</span>
                  </div>
                ))}
                {analysis && (
                  <div className="flex items-start gap-2">
                    <Repeat className="mt-0.5 h-4 w-4 text-amber-600" />
                    <span>
                      <b>İki yönde yoğun:</b> {both.length ? both.join(', ') : 'yok'}
                      {both.length > 0 && <span className="block text-xs text-slate-500">Bu sektörlerdeki lead'ler otomatik olarak “İhracat + İthalat” işaretlenir.</span>}
                    </span>
                  </div>
                )}
                {agents && (
                  <div className="flex items-start gap-2">
                    <Globe2 className="mt-0.5 h-4 w-4 text-violet-600" />
                    <span><b>Acente / forwarder:</b> {cname(country)} içinde {agents.cities.length} şehir × {agents.keywords.length} anahtar kelime</span>
                  </div>
                )}
                {analysis && (
                  <p className="pt-1 text-xs text-slate-500">
                    Otomatik seçim kuralı: her yönde hacmin %{cfg.coverage}’ini oluşturan sektörler, en fazla {cfg.max_sectors}.
                    Bölgeler: sektörün yoğunlaştığı iller + {cfg.always_cities.join(', ')}.
                    {cfg.excluded_sectors.length > 0 && ` Hariç tutulan: ${cfg.excluded_sectors.join(', ')}.`}{' '}
                    <Link to="/ayarlar" className="text-brand-600 hover:underline">Ayarlar</Link>
                  </p>
                )}
              </div>
            </div>
          </Section>

          {analysis && (['X', 'M'] as Flow[]).map((f) => {
            const rows = rowsOf(f)
            const visible = showAll[f] ? rows : rows.filter((s, i) => i < VISIBLE || s.manual || sel[f].on.has(s.sector))
            const addable = allSectors.filter((s) => !sel[f].on.has(s)).map((s) => ({ value: s, label: s }))
            return (
              <Section key={f} title={`3${f === 'X' ? 'a' : 'b'}. ${FLOW_INFO[f].title} sektörleri (${sel[f].on.size} seçili)`} className="mb-4"
                actions={<div className="w-64"><Combobox options={addable} value={null} onChange={(v) => addSector(f, v)} placeholder="+ Sektör ekle…" /></div>}>
                <p className="mb-2 text-xs text-slate-500">{FLOW_INFO[f].who} Listede olmayan bir sektörü sağ üstten elle ekleyebilirsiniz.</p>
                {rows.length === 0 ? <p className="text-sm text-slate-400">Bu yönde ticaret verisi yok.</p> : (
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr><th className="w-8"></th><th>Sektör</th><th className="text-right">Hacim</th><th className="text-right">Pay</th><th className="text-right">Trend</th><th>Mod</th><th className="min-w-72">Hedef bölgeler</th></tr>
                      </thead>
                      <tbody>
                        {visible.map((s) => {
                          const on = sel[f].on.has(s.sector)
                          const t = s.manual ? null : trendPct(s.value, s.prev_value)
                          return (
                            <tr key={s.sector} className={on ? '' : 'opacity-60'}>
                              <td><input type="checkbox" checked={on} onChange={() => toggle(f, s.sector, s.cities)} aria-label={s.sector} /></td>
                              <td>
                                <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                  {s.sector}
                                  {s.manual && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">ELLE EKLENDİ</span>}
                                  {on && both.includes(s.sector) && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">İKİ YÖNDE</span>}
                                </div>
                                {s.hs.length > 0 && (
                                  <div className="max-w-72 truncate text-xs text-slate-400" title={s.hs.map((h) => `${h} ${HS_CHAPTERS[h]?.name ?? ''}`).join('\n')}>
                                    HS {s.hs.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="text-right tabular-nums">{s.manual ? '-' : fmtUsd(s.value)}</td>
                              <td className="text-right tabular-nums">{s.manual ? '-' : `%${(s.share * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}</td>
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

          {agents && (
            <Section title={`${analysis ? '4' : '3'}. ${cname(country)}: forwarder / acente araması`} className="mb-4"
              actions={<button className="btn-ghost text-xs" onClick={() => setAgents(null)}><X className="h-3.5 w-3.5" /> Kaldır</button>}>
              <p className="mb-3 text-xs text-slate-500">
                Google'da hedef ülkede “&lt;anahtar kelime&gt; &lt;şehir&gt;” olarak aranır. Bulunanlar lead havuzuna <b>Acente / Forwarder</b> türüyle eklenir
                ve müşteri kriterleriyle puanlanmaz. Her şehir × anahtar kelime bir Google isteğidir. Yerel dilde terim de ekleyebilirsiniz (ör. Almanya için “Spedition”).
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="label">Şehirler (varsayılan: uluslararası havalimanı olan şehirler)</span>
                  <CityMultiPicker countryCode={country!} value={agents.cities} onChange={(v) => setAgents({ ...agents, cities: v })} />
                </div>
                <Field label="Anahtar kelimeler (virgülle)">
                  <ListInput value={agents.keywords} onChange={(v) => setAgents({ ...agents, keywords: v })} placeholder="freight forwarder, logistics company" />
                </Field>
              </div>
            </Section>
          )}

          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-surface px-4 py-3 lg:-mx-6 lg:px-6">
            <span className="mr-auto text-xs text-slate-500">Kaydedince Google taraması ekranına geçilir; tarama oradan başlatılır.</span>
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
