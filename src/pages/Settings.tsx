import { useEffect, useState, type ReactNode } from 'react'
import { Moon, Plus, Save, Sun, Trash2 } from 'lucide-react'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { supabase, q } from '../lib/supabase'
import type { ChargeTemplate, LeadConfig, LeadScoring, Location, Settings } from '../lib/types'
import { DEFAULT_LEAD_CONFIG } from '../lib/trade'
import { CityMultiPicker, SectorPicker } from '../components/pickers'
import { CHARGE_UNITS, CURRENCIES, MODES } from '../lib/constants'
import { Link } from 'react-router-dom'
import { ToggleChips } from '../components/leadForms'
import { clean } from '../lib/format'
import { getSettings, invalidateRefData } from '../lib/refdata'
import { ErrorBox, Field, PageHeader, Section, Select, Spinner, useLoad } from '../components/ui'

function CompanySettings() {
  const [f, setF] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { getSettings().then(setF).catch((e) => setError(e.message)) }, [])
  if (!f) return error ? <ErrorBox error={error} /> : <Spinner />
  const set = (k: keyof Settings, v: string | null) => { setF({ ...f, [k]: v }); setMsg(null) }

  function onLogo(file: File | undefined) {
    if (!file) return
    if (file.size > 500_000) return setError('Logo 500 KB’den küçük olmalı.')
    const r = new FileReader()
    r.onload = () => set('logo_data_url', r.result as string)
    r.readAsDataURL(file)
  }

  async function save() {
    setError(null)
    try {
      // Lead puanlama ayrı bölümde kaydedilir; burada eski değeriyle ezilmemeli
      const { id: _id, lead_scoring: _ls, ...rest } = f!
      await q(supabase.from('settings').update(clean(rest)).eq('id', 1))
      setMsg('Kaydedildi ✓')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Section title="Şirket bilgileri (teklif PDF'inde görünür)" actions={
      <div className="flex items-center gap-2">
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
        <button className="btn-primary" onClick={save}><Save className="h-4 w-4" /> Kaydet</button>
      </div>
    }>
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Şirket ünvanı"><input className="input" value={f.company_name ?? ''} onChange={(e) => set('company_name', e.target.value)} /></Field>
        <Field label="Web sitesi"><input className="input" value={f.website ?? ''} onChange={(e) => set('website', e.target.value)} /></Field>
        <Field label="Adres" className="sm:col-span-2"><textarea className="input" rows={2} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Telefon"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="E-posta"><input className="input" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Vergi dairesi"><input className="input" value={f.tax_office ?? ''} onChange={(e) => set('tax_office', e.target.value)} /></Field>
        <Field label="Vergi no"><input className="input" value={f.tax_no ?? ''} onChange={(e) => set('tax_no', e.target.value)} /></Field>
        <Field label="Banka bilgileri (IBAN vb.)" className="sm:col-span-2">
          <textarea className="input font-mono" rows={4} value={f.bank_info ?? ''} onChange={(e) => set('bank_info', e.target.value)} />
        </Field>
        <Field label="Varsayılan teklif şartları (TR)"><textarea className="input" rows={4} value={f.quote_terms_tr ?? ''} onChange={(e) => set('quote_terms_tr', e.target.value)} /></Field>
        <Field label="Default quotation terms (EN)"><textarea className="input" rows={4} value={f.quote_terms_en ?? ''} onChange={(e) => set('quote_terms_en', e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <span className="label">Logo (PNG/JPG, max 500 KB)</span>
          <div className="flex items-center gap-4">
            {f.logo_data_url && <img src={f.logo_data_url} alt="Logo" className="h-14 rounded border border-slate-200 bg-surface p-1" />}
            <input type="file" accept="image/png,image/jpeg" className="text-sm" onChange={(e) => onLogo(e.target.files?.[0])} />
            {f.logo_data_url && <button className="btn-ghost text-red-500" onClick={() => set('logo_data_url', null)}>Kaldır</button>}
          </div>
        </div>
      </div>
    </Section>
  )
}

const SCORING_DEFAULTS: LeadScoring = {
  w_sector: 0, w_city: 0, w_market: 0, w_exports: 0, target_modes: [], w_mode: 0, min_employees: 0, w_size: 0, w_contact: 0, w_person: 0, w_website: 0,
}

function LeadScoringSettings() {
  const [f, setF] = useState<LeadScoring | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getSettings().then((s) => {
      // Eski kayıtlardan kalan hedef listeleri (artık aramada) ayıklanır
      const { target_sectors: _a, target_cities: _b, target_markets: _c, ...rest } = (s.lead_scoring ?? {}) as LeadScoring & Record<string, unknown>
      setF({ ...SCORING_DEFAULTS, ...rest })
    }).catch((e) => setError(e.message))
  }, [])
  if (!f) return error ? <ErrorBox error={error} /> : <Spinner />
  const set = <K extends keyof LeadScoring>(k: K, v: LeadScoring[K]) => { setF({ ...f, [k]: v }); setMsg(null) }

  async function save() {
    setError(null)
    setBusy(true)
    try {
      await q(supabase.from('settings').update({ lead_scoring: f }).eq('id', 1))
      setMsg('Kaydedildi, tüm lead’ler yeniden puanlandı ✓')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const total = f.w_sector + f.w_city + f.w_exports + f.w_mode + f.w_market + f.w_size + f.w_contact + f.w_person + f.w_website
  const weight = (k: keyof LeadScoring) => (
    <input className="input w-20! text-right" type="number" min={0} max={100} value={f[k] as number}
      onChange={(e) => set(k, Math.max(0, Number(e.target.value) || 0) as never)} title="Ağırlık (0 = kapalı)" />
  )
  // Bileşen değil düz fonksiyon: render içinde tanımlı bileşen her tuşta yeniden oluşup odağı kaybettirir
  const row = (title: string, hint: string | null, w: keyof LeadScoring, children?: ReactNode) => (
    <div key={w} className={`grid gap-2 border-b border-slate-100 py-3 last:border-0 sm:grid-cols-[14rem_1fr_5rem] sm:items-start ${(f[w] as number) === 0 ? 'opacity-60' : ''}`}>
      <div>
        <div className="text-sm font-medium text-slate-800">{title}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      <div>{children}</div>
      <div className="sm:justify-self-end">{weight(w)}</div>
    </div>
  )

  return (
    <Section title="Lead puanlama" actions={
      <div className="flex items-center gap-2">
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
        <button className="btn-primary" disabled={busy} onClick={save}><Save className="h-4 w-4" /> {busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>
    }>
      <ErrorBox error={error} />
      <p className="mb-2 text-sm text-slate-600">
        Her lead, sağladığı kriterlerin ağırlığı oranında 0-100 arası puan alır. Ağırlığı 0 olan kriter hesaba katılmaz,
        bilgisi girilmemiş kriter puan getirmez. Hedef sektör, bölge ve pazarlar her lead aramasında ayrıca belirlenir
        (<Link to="/lead-generation/aramalar" className="text-brand-600 hover:underline">Lead Generation › Aramalar</Link>);
        aramaya bağlı olmayan lead'lerde bu üç kriter kullanılmaz. Kaydettiğinizde tüm lead’ler yeniden puanlanır.
      </p>
      <div className="mb-1 flex justify-end text-xs text-slate-500">Ağırlık · toplam {total}</div>
      {row('Hedef sektör', 'Lead’in sektörü aramanın ihracat veya ithalat sektörlerinde ise', 'w_sector', <span className="text-xs text-slate-500">Aramada belirlenir</span>)}
      {row('Hedef bölge', 'Lead’in şehri, sektörünün aramadaki hedef illerinde ise', 'w_city', <span className="text-xs text-slate-500">Aramada belirlenir</span>)}
      {row('Hedef ülke', 'Ticaret yaptığı ülkeler arasında aramanın ülkesi varsa', 'w_market', <span className="text-xs text-slate-500">Aramanın ülkesi</span>)}
      {row('İhracat yapıyor', '“İhracat yapıyor mu?” Evet ise', 'w_exports')}
      {row('Taşıma modu', 'Lead’in muhtemel modlarından biri seçili ise', 'w_mode', <ToggleChips options={MODES} value={f.target_modes} onChange={(v) => set('target_modes', v)} />)}
      {row('Firma büyüklüğü', 'Çalışan sayısı en az', 'w_size', <input className="input w-28!" type="number" min={0} value={f.min_employees} onChange={(e) => set('min_employees', Math.max(0, Number(e.target.value) || 0))} />)}
      {row('İletişim bilgisi var', 'Firma veya kişi e-posta/telefonu', 'w_contact')}
      {row('İrtibat kişisi belli', 'Ad soyad girilmiş', 'w_person')}
      {row('Web sitesi var', null, 'w_website')}
    </Section>
  )
}

interface SectorRegion { sector: string; cities: string[]; export_keywords: string[]; import_keywords: string[] }

/** Virgülle ayrılmış liste; yazarken bozulmasın diye çıkışta (blur) kaydedilir */
function ListInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value])
  return (
    <input className="input" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split(',').map((x) => x.trim()).filter(Boolean))} />
  )
}

function LeadSearchSettings() {
  const [cfg, setCfg] = useState<LeadConfig | null>(null)
  const [regions, setRegions] = useState<SectorRegion[]>([])
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    Promise.all([getSettings(), q<SectorRegion[]>(supabase.from('sector_regions').select('sector,cities,export_keywords,import_keywords').order('sector'))])
      .then(([s, r]) => { setCfg({ ...DEFAULT_LEAD_CONFIG, ...s.lead_config }); setRegions(r) })
      .catch((e) => setError(e.message))
  }, [])
  if (!cfg) return error ? <ErrorBox error={error} /> : <Spinner />
  const set = <K extends keyof LeadConfig>(k: K, v: LeadConfig[K]) => { setCfg({ ...cfg, [k]: v }); setMsg(null) }
  const setRegion = (sector: string, patch: Partial<SectorRegion>) => {
    setRegions(regions.map((r) => (r.sector === sector ? { ...r, ...patch } : r)))
    setDirty(new Set(dirty).add(sector))
    setMsg(null)
  }

  async function save() {
    setError(null)
    setBusy(true)
    try {
      await q(supabase.from('settings').update({ lead_config: cfg }).eq('id', 1))
      const changed = regions.filter((r) => dirty.has(r.sector))
      if (changed.length) await q(supabase.from('sector_regions').upsert(changed))
      setDirty(new Set())
      setMsg('Kaydedildi ✓ (yeni aramalarda geçerli)')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Lead araması (hedef ülke analizi ve Google taraması)" actions={
      <div className="flex items-center gap-2">
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
        <button className="btn-primary" disabled={busy} onClick={save}><Save className="h-4 w-4" /> {busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>
    }>
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Otomatik seçim: hacmin yüzde kaçı (%)">
          <input className="input" type="number" min={10} max={100} value={cfg.coverage} onChange={(e) => set('coverage', Math.min(100, Math.max(10, Number(e.target.value) || 80)))} />
        </Field>
        <Field label="Yön başına en fazla sektör">
          <input className="input" type="number" min={1} max={30} value={cfg.max_sectors} onChange={(e) => set('max_sectors', Math.max(1, Number(e.target.value) || 10))} />
        </Field>
        <div>
          <span className="label">Her sektöre eklenen iller</span>
          <CityMultiPicker countryCode="TR" value={cfg.always_cities} onChange={(v) => set('always_cities', v)} />
        </div>
        <div>
          <span className="label">Analize alınmayan sektörler</span>
          <SectorPicker value={cfg.excluded_sectors} onChange={(v) => set('excluded_sectors', v)} />
        </div>
        <Field label="Google taraması: sorgu başına sayfa (1 sayfa = 20 firma = 1 istek)">
          <Select options={[{ value: '1', label: '1 sayfa (20 firma)' }, { value: '2', label: '2 sayfa (40 firma)' }, { value: '3', label: '3 sayfa (60 firma)' }]}
            value={String(cfg.places_pages)} onChange={(v) => set('places_pages', Number(v))} />
        </Field>
        <Field label="Google taraması: aylık istek sınırı (ilk 1.000 istek ücretsiz)">
          <input className="input" type="number" min={0} value={cfg.places_monthly_limit} onChange={(e) => set('places_monthly_limit', Math.max(0, Number(e.target.value) || 0))} />
        </Field>
      </div>
      <h4 className="mt-5 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Sektör profilleri</h4>
      <p className="mb-2 text-xs text-slate-500">
        İller: yeni aramada sektörün varsayılan hedef bölgeleri (arama ekranında ayrıca değiştirilebilir).
        Anahtar kelimeler: Google'da “&lt;anahtar kelime&gt; &lt;il&gt;” olarak aranır, virgülle birden fazla yazılabilir (her biri ayrı sorgu = ayrı istek).
      </p>
      <div className="max-h-[32rem] overflow-y-auto">
        <table className="table-base">
          <thead>
            <tr><th>Sektör</th><th className="min-w-64">İller (ilk 5)</th><th className="min-w-48">İhracat anahtar kelimesi</th><th className="min-w-48">İthalat anahtar kelimesi</th></tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.sector}>
                <td className="w-48 text-sm font-medium">{r.sector}</td>
                <td><CityMultiPicker countryCode="TR" value={r.cities} onChange={(v) => setRegion(r.sector, { cities: v })} /></td>
                <td><ListInput value={r.export_keywords} onChange={(v) => setRegion(r.sector, { export_keywords: v })} placeholder="ör. mobilya fabrikası" /></td>
                <td><ListInput value={r.import_keywords} onChange={(v) => setRegion(r.sector, { import_keywords: v })} placeholder="ör. mobilya ithalatçısı" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Locations() {
  const { data, error, reload } = useLoad(() => q<Location[]>(supabase.from('locations').select('*').order('kind').order('code')))
  const [n, setN] = useState({ kind: 'sea', code: '', name: '', country: '' })
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    if (!n.code || !n.name) return
    try {
      await q(supabase.from('locations').insert(clean({ ...n, code: n.code.toUpperCase() })))
      setN({ ...n, code: '', name: '', country: '' })
      invalidateRefData()
      reload()
    } catch (e) { setErr((e as Error).message) }
  }
  async function del(id: string) {
    await q(supabase.from('locations').delete().eq('id', id))
    invalidateRefData()
    reload()
  }

  return (
    <Section title="Limanlar ve havalimanları">
      <ErrorBox error={error ?? err} />
      <div className="mb-3 grid grid-cols-[6rem_6rem_1fr_4rem_auto] gap-2">
        <Select options={[{ value: 'sea', label: 'Liman' }, { value: 'air', label: 'Havalimanı' }]} value={n.kind} onChange={(v) => setN({ ...n, kind: v })} />
        <input className="input" placeholder="Kod" value={n.code} onChange={(e) => setN({ ...n, code: e.target.value })} />
        <input className="input" placeholder="Ad" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <input className="input" placeholder="Ülke" value={n.country} onChange={(e) => setN({ ...n, country: e.target.value })} />
        <button className="btn-secondary" onClick={add}><Plus className="h-4 w-4" /></button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="table-base">
          <tbody>
            {(data ?? []).map((l) => (
              <tr key={l.id} className="group">
                <td className="w-20 text-xs text-slate-500">{l.kind === 'sea' ? 'Liman' : 'Havalimanı'}</td>
                <td className="w-20 font-mono text-xs">{l.code}</td>
                <td>{l.name}</td>
                <td className="text-slate-500">{l.country}</td>
                <td className="w-8"><button className="btn-ghost p-1 text-red-500 opacity-0 group-hover:opacity-100" onClick={() => del(l.id)}><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Templates() {
  const { data, error, reload } = useLoad(() => q<ChargeTemplate[]>(supabase.from('charge_templates').select('*').order('sort')))
  const [n, setN] = useState({ name: '', name_en: '', mode: 'all', unit: 'shipment', currency: 'USD' })
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    if (!n.name) return
    try {
      await q(supabase.from('charge_templates').insert(clean({ ...n, sort: (data?.length ?? 0) + 1 })))
      setN({ ...n, name: '', name_en: '' })
      invalidateRefData()
      reload()
    } catch (e) { setErr((e as Error).message) }
  }
  async function del(id: string) {
    await q(supabase.from('charge_templates').delete().eq('id', id))
    invalidateRefData()
    reload()
  }
  const modeLabel = (m: string) => (m === 'sea' ? 'Deniz' : m === 'air' ? 'Hava' : m === 'road' ? 'Karayolu' : 'Tümü')

  return (
    <Section title="Masraf kalemi şablonları">
      <ErrorBox error={error ?? err} />
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_5.5rem_7rem_5.5rem_auto]">
        <input className="input" placeholder="Ad (TR)" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <input className="input" placeholder="Name (EN)" value={n.name_en} onChange={(e) => setN({ ...n, name_en: e.target.value })} />
        <Select options={[{ value: 'all', label: 'Tümü' }, { value: 'sea', label: 'Deniz' }, { value: 'air', label: 'Hava' }, { value: 'road', label: 'Karayolu' }]} value={n.mode} onChange={(v) => setN({ ...n, mode: v })} />
        <Select options={CHARGE_UNITS} value={n.unit} onChange={(v) => setN({ ...n, unit: v })} />
        <Select options={CURRENCIES} value={n.currency} onChange={(v) => setN({ ...n, currency: v })} />
        <button className="btn-secondary" onClick={add}><Plus className="h-4 w-4" /></button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="table-base">
          <tbody>
            {(data ?? []).map((t) => (
              <tr key={t.id} className="group">
                <td>{t.name}</td>
                <td className="text-slate-500">{t.name_en}</td>
                <td className="text-xs text-slate-500">{modeLabel(t.mode)}</td>
                <td className="text-xs text-slate-500">{CHARGE_UNITS.find((u) => u.value === t.unit)?.label}</td>
                <td className="text-xs">{t.currency}</td>
                <td className="w-8"><button className="btn-ghost p-1 text-red-500 opacity-0 group-hover:opacity-100" onClick={() => del(t.id)}><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Appearance() {
  const [theme, setT] = useState<Theme>(getTheme)
  const choose = (t: Theme) => { setTheme(t); setT(t) }
  return (
    <Section title="Görünüm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-800">Karanlık mod</div>
          <div className="text-xs text-slate-500">Bu tarayıcıda hatırlanır.</div>
        </div>
        <div className="flex rounded-md border border-slate-300 p-0.5 text-sm">
          <button className={`flex items-center gap-1.5 rounded px-3 py-1 ${theme === 'light' ? 'bg-brand-600 text-on-brand' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => choose('light')}>
            <Sun className="h-4 w-4" /> Açık
          </button>
          <button className={`flex items-center gap-1.5 rounded px-3 py-1 ${theme === 'dark' ? 'bg-brand-600 text-on-brand' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => choose('dark')}>
            <Moon className="h-4 w-4" /> Koyu
          </button>
        </div>
      </div>
    </Section>
  )
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Ayarlar" />
      <div className="space-y-4">
        <Appearance />
        <CompanySettings />
        <LeadSearchSettings />
        <LeadScoringSettings />
        <div className="grid gap-4 xl:grid-cols-2">
          <Templates />
          <Locations />
        </div>
      </div>
    </>
  )
}
