import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Combobox, type ComboOption } from './Combobox'
import { CompanyForm } from './forms'
import { supabase, q } from '../lib/supabase'
import {
  addCustomCarrier, getCarrierOptions, getCities, getCompanyOptions, getCountries, getPortOptions, getSectors,
  invalidateRefData, type Country,
} from '../lib/refdata'
import { COMPANY_TYPES } from '../lib/constants'
import type { Company } from '../lib/types'

function useAsyncList<T>(fn: () => Promise<T[]>, deps: unknown[]): [T[], boolean, (v: T[]) => void] {
  const [list, setList] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    fn().then((l) => { if (alive) setList(l) }).catch(() => { if (alive) setList([]) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, deps)
  return [list, loading, setList]
}

// ------------------------------------------------------------ Ülke
export function CountryPicker({ value, onChange, placeholder = 'Ülke ara…' }: {
  value: string | null
  onChange: (code: string | null, country?: Country) => void
  placeholder?: string
}) {
  const [countries, loading] = useAsyncList(getCountries, [])
  const options = useMemo(() => countries.map((c) => ({ value: c.code, label: c.name, keywords: `${c.code} ${c.tr}` })), [countries])
  return (
    <Combobox options={options} loading={loading} value={value} placeholder={placeholder}
      onChange={(v) => onChange(v, countries.find((c) => c.code === v))} />
  )
}

// ------------------------------------------------------------ Ülke (çoklu, değer: ülke kodu)
export function CountryMultiPicker({ value, onChange, placeholder = 'Ülke ara…' }: {
  value: string[]
  onChange: (codes: string[]) => void
  placeholder?: string
}) {
  const [countries, loading] = useAsyncList(getCountries, [])
  const options = useMemo(() => countries.map((c) => ({ value: c.code, label: c.name, keywords: `${c.code} ${c.tr}` })), [countries])
  return <Combobox multiple options={options} loading={loading} value={value} onChange={onChange} placeholder={placeholder} />
}

// ------------------------------------------------------------ Şehir (çoklu, tek ülke)
export function CityMultiPicker({ countryCode, value, onChange }: {
  countryCode: string
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [cities, loading] = useAsyncList(() => getCities(countryCode), [countryCode])
  const options = useMemo(() => cities.map((c) => ({ value: c, label: c })), [cities])
  return (
    <Combobox multiple options={options} loading={loading} value={value} onChange={onChange} placeholder="Şehir ara…"
      onCreate={(t) => { if (!value.includes(t)) onChange([...value, t]) }} createLabel={(t) => <>“{t}” ekle</>} />
  )
}

// ------------------------------------------------------------ Şehir (ülkeye bağlı)
export function CityPicker({ countryCode, value, onChange }: {
  countryCode: string | null
  value: string | null
  onChange: (v: string | null) => void
}) {
  const [cities, loading] = useAsyncList(() => (countryCode ? getCities(countryCode) : Promise.resolve([])), [countryCode])
  const options = useMemo(() => cities.map((c) => ({ value: c, label: c })), [cities])
  return (
    <Combobox options={options} loading={loading && !!countryCode} value={value} onChange={onChange} allowFree
      disabled={!countryCode} placeholder={countryCode ? 'Şehir ara…' : 'Önce ülke seçin'}
      createLabel={(t) => <>“{t}” olarak kullan</>} />
  )
}

// ------------------------------------------------------------ Sektör (çoklu, yeni eklenebilir)
export function SectorPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [sectors, loading, setSectors] = useAsyncList(getSectors, [])
  const options = useMemo(() => sectors.map((s) => ({ value: s.name, label: s.name })), [sectors])

  async function create(name: string) {
    try {
      const row = await q<{ id: string; name: string }>(supabase.from('sectors').insert({ name }).select('id,name').single())
      invalidateRefData('sectors')
      setSectors([...sectors, row].sort((a, b) => a.name.localeCompare(b.name, 'tr')))
    } catch { /* zaten varsa yine de seç */ }
    if (!value.includes(name)) onChange([...value, name])
  }

  return (
    <Combobox multiple options={options} loading={loading} value={value} onChange={onChange}
      placeholder="Sektör ara veya ekle…" onCreate={create} createLabel={(t) => <>“{t}” sektörünü oluştur</>} />
  )
}

// ------------------------------------------------------------ Firma (aranabilir, "Firma ekle" ile yeni oluşturma)
type CompanyOpt = Pick<Company, 'id' | 'name' | 'type' | 'city' | 'country'>

export function CompanyCombo({ value, onChange, types, placeholder = 'Firma ara…', allowCreate = true, defaultType }: {
  value: string | null
  onChange: (id: string | null, company?: CompanyOpt) => void
  types?: string[]
  placeholder?: string
  allowCreate?: boolean
  defaultType?: string
}) {
  const [list, loading, setList] = useAsyncList(getCompanyOptions, [])
  const [creating, setCreating] = useState<string | null>(null)
  const options: ComboOption[] = useMemo(
    () => list
      .filter((c) => !types || types.includes(c.type) || c.id === value)
      .map((c) => ({
        value: c.id,
        label: c.name,
        sub: [COMPANY_TYPES.find((t) => t.value === c.type)?.label, c.city, c.country].filter(Boolean).join(' · '),
      })),
    [list, types, value],
  )

  return (
    <>
      <Combobox options={options} loading={loading} value={value} placeholder={placeholder}
        onChange={(v) => onChange(v, list.find((c) => c.id === v))}
        onCreate={allowCreate ? (t) => setCreating(t) : undefined}
        createLabel={(t) => <>Firma ekle: “{t}”</>} />
      {creating !== null && (
        <CompanyForm
          initialName={creating}
          defaultType={defaultType ?? types?.[0] ?? 'customer'}
          onClose={() => setCreating(null)}
          onSaved={(c) => {
            setCreating(null)
            setList([...list, c].sort((a, b) => a.name.localeCompare(b.name, 'tr')))
            onChange(c.id, c)
          }}
        />
      )}
    </>
  )
}

// ------------------------------------------------------------ Liman / havalimanı
export function PortPicker({ kind, value, onChange, placeholder }: {
  kind: 'sea' | 'air'
  value: string | null
  onChange: (v: string | null) => void
  placeholder?: string
}) {
  const [options, loading] = useAsyncList(() => getPortOptions(kind), [kind])
  return (
    <Combobox options={options} loading={loading} value={value} onChange={onChange} allowFree
      placeholder={placeholder ?? (kind === 'sea' ? 'Liman adı veya kodu…' : 'Havalimanı, şehir veya IATA kodu…')}
      createLabel={(t) => <>“{t}” olarak kullan</>} />
  )
}

// ------------------------------------------------------------ Karayolu: ülke + şehir → "Şehir, Ülke"
export function RoadPlacePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [countries] = useAsyncList(getCountries, [])
  const [code, setCode] = useState<string | null>(null)
  const idx = value?.lastIndexOf(', ') ?? -1
  const city = value && idx > 0 ? value.slice(0, idx) : value
  const countryLabel = value && idx > 0 ? value.slice(idx + 2) : null

  // Kayıtlı değerden ülke kodunu bul
  useEffect(() => {
    if (!countryLabel || !countries.length) return
    // Eski kayıtlarda ülke adı Türkçe olabilir
    const c = countries.find((x) => x.name === countryLabel || x.tr === countryLabel)
    if (c) setCode(c.code)
  }, [countryLabel, countries])

  const cName = (c: string | null) => countries.find((x) => x.code === c)?.name ?? ''
  return (
    <div className="grid grid-cols-2 gap-2">
      <CountryPicker value={code} placeholder="Ülke…" onChange={(c) => { setCode(c); onChange(null) }} />
      <CityPicker countryCode={code} value={city || null} onChange={(v) => onChange(v ? `${v}, ${cName(code)}` : null)} />
    </div>
  )
}

// ------------------------------------------------------------ Armatör / havayolu
export function CarrierPicker({ kind, value, onChange }: { kind: 'sea' | 'air'; value: string | null; onChange: (v: string | null) => void }) {
  const [options, loading, setOptions] = useAsyncList(() => getCarrierOptions(kind), [kind])
  async function create(t: string) {
    try {
      const label = await addCustomCarrier(kind, t)
      setOptions([...options, { value: label, label }])
      onChange(label)
    } catch {
      onChange(t)
    }
  }
  return (
    <Combobox options={options} loading={loading} value={value} onChange={onChange}
      placeholder={kind === 'air' ? 'Havayolu adı veya IATA kodu…' : 'Armatör ara…'}
      onCreate={create}
      createLabel={(t) => <>“{t}” {kind === 'air' ? 'havayolunu' : 'armatörünü'} listeye ekle</>} />
  )
}

// ------------------------------------------------------------ Çoklu telefon / e-posta
export function MultiTextInput({ values, onChange, type = 'text', placeholder, requiredFirst, addLabel }: {
  values: string[]
  onChange: (v: string[]) => void
  type?: 'text' | 'email' | 'tel'
  placeholder?: string
  requiredFirst?: boolean
  addLabel: string
}) {
  const list = values.length ? values : ['']
  const set = (i: number, v: string) => onChange(list.map((x, j) => (j === i ? v : x)))
  return (
    <div className="space-y-1.5">
      {list.map((v, i) => (
        <div key={i} className="flex gap-1">
          <input className="input" type={type} value={v} placeholder={placeholder} required={requiredFirst && i === 0}
            onChange={(e) => set(i, e.target.value)} />
          {list.length > 1 && (
            <button type="button" className="btn-ghost p-1.5 text-red-500" onClick={() => onChange(list.filter((_, j) => j !== i))}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline" onClick={() => onChange([...list, ''])}>
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </button>
    </div>
  )
}

/** Virgülle ayrılmış liste; yazarken bozulmasın diye çıkışta (blur) kaydedilir */
export function ListInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value])
  return (
    <input className="input" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split(',').map((x) => x.trim()).filter(Boolean))} />
  )
}
