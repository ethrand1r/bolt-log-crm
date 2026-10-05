import { supabase, q } from './supabase'
import type { Carrier, ChargeTemplate, Company, Location, Settings } from './types'
import type { ComboOption } from '../components/Combobox'
import { AIRLINES, OCEAN_CARRIERS } from '../data/carriers'

// Sık kullanılan referans verileri için basit önbellek
const cache = new Map<string, Promise<unknown>>()

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    cache.set(key, fn().catch((e) => {
      cache.delete(key)
      throw e
    }))
  }
  return cache.get(key) as Promise<T>
}

export function invalidateRefData(...keys: string[]) {
  if (keys.length === 0) cache.clear()
  else keys.forEach((k) => cache.delete(k))
}

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${path} yüklenemedi`)
  return r.json()
}

// ------------------------------------------------------------ Veritabanı
export const getLocations = () => cached('locations', () => q<Location[]>(supabase.from('locations').select('*').order('code')))
export const getChargeTemplates = () => cached('templates', () => q<ChargeTemplate[]>(supabase.from('charge_templates').select('*').order('sort')))
export const getSectors = () => cached('sectors', () => q<{ id: string; name: string }[]>(supabase.from('sectors').select('id,name').order('name')))
export const getCustomCarriers = () => cached('carriers', () => q<Carrier[]>(supabase.from('carriers').select('*').order('name')))

export function getSettings(): Promise<Settings> {
  return q<Settings>(supabase.from('settings').select('*').eq('id', 1).single())
}

export function getCompanyOptions(): Promise<Pick<Company, 'id' | 'name' | 'type' | 'city' | 'country'>[]> {
  return q(supabase.from('companies').select('id,name,type,city,country').order('name'))
}

// ------------------------------------------------------------ Ülke / şehir (public/geo)
/** name: İngilizce ad (ekranda ve kayıtta), tr: Türkçe ad (sadece aramada) */
export interface Country { code: string; name: string; tr: string }
export const getCountries = () => cached('countries', () => fetchJson<Country[]>('/geo/countries.json'))
export const getCities = (code: string) => cached(`cities:${code}`, () => fetchJson<string[]>(`/geo/cities/${code}.json`))

export async function countryName(code: string | null | undefined): Promise<string> {
  if (!code) return ''
  const list = await getCountries()
  return list.find((c) => c.code === code)?.name ?? code
}

// ------------------------------------------------------------ Limanlar / havalimanları (public/ref)
/** [UN/LOCODE, liman adı, ülke kodu] */
type SeaPortRow = [string, string, string]
/** [IATA, havalimanı adı, şehir, ülke kodu] */
type AirportRow = [string, string, string, string]

export function getPortOptions(kind: 'sea' | 'air'): Promise<ComboOption[]> {
  return cached(`ports:${kind}`, async () => {
    const [countries, custom] = await Promise.all([getCountries(), getLocations().catch(() => [] as Location[])])
    const cn = new Map(countries.map((c) => [c.code, c.name]))
    const own: ComboOption[] = custom
      .filter((l) => l.kind === kind)
      .map((l) => ({ value: `${l.name} (${l.code})`, label: `${l.name} (${l.code})`, sub: l.country ?? undefined, keywords: l.code }))

    if (kind === 'sea') {
      const rows = await fetchJson<SeaPortRow[]>('/ref/seaports.json')
      const list = rows.map(([code, name, cc]) => ({
        value: `${name} (${code})`,
        label: `${name} (${code})`,
        sub: cn.get(cc) ?? cc,
        keywords: `${code} ${cc}`,
      }))
      return dedupe([...own, ...list])
    }
    const rows = await fetchJson<AirportRow[]>('/ref/airports.json')
    const list = rows.map(([iata, name, city, cc]) => ({
      value: `${name} (${iata})`,
      label: `${name} (${iata})`,
      sub: [city, cn.get(cc) ?? cc].filter(Boolean).join(', '),
      keywords: `${iata} ${city} ${cc}`,
    }))
    return dedupe([...own, ...list])
  })
}

// ------------------------------------------------------------ Armatör / havayolu
export function getCarrierOptions(kind: 'sea' | 'air'): Promise<ComboOption[]> {
  return cached(`carrierOpts:${kind}`, async () => {
    const custom = await getCustomCarriers().catch(() => [] as Carrier[])
    const base: ComboOption[] = kind === 'air'
      ? AIRLINES.map(([name, code]) => ({ value: `${name} (${code})`, label: `${name} (${code})`, keywords: code }))
      : OCEAN_CARRIERS.map((name) => ({ value: name, label: name }))
    const own = custom.filter((c) => c.kind === kind).map((c) => {
      const label = c.code ? `${c.name} (${c.code})` : c.name
      return { value: label, label, keywords: c.code ?? undefined }
    })
    return dedupe([...base, ...own]).sort((a, b) => a.label.localeCompare(b.label, 'tr'))
  })
}

export async function addCustomCarrier(kind: 'sea' | 'air', input: string): Promise<string> {
  // "Ad (KOD)" biçiminde girildiyse kodu ayır
  const m = input.match(/^(.*?)\s*\(([A-Z0-9]{2,3})\)\s*$/i)
  const name = (m ? m[1] : input).trim()
  const code = m ? m[2].toUpperCase() : null
  await q(supabase.from('carriers').upsert({ kind, name, code }, { onConflict: 'kind,name' }))
  invalidateRefData('carriers', `carrierOpts:${kind}`)
  return code ? `${name} (${code})` : name
}

/** Ülkenin uluslararası havalimanı olan şehirleri: acente / forwarder aramasında varsayılan şehirler */
export async function getHubCities(code: string, max = 6): Promise<string[]> {
  const rows = await cached('airports', () => fetchJson<AirportRow[]>('/ref/airports.json'))
  const inCountry = rows.filter((r) => r[3] === code && r[2])
  const intl = inCountry.filter((r) => /international/i.test(r[1]))
  return [...new Set((intl.length ? intl : inCountry).map((r) => r[2]))].slice(0, max)
}

function dedupe(list: ComboOption[]): ComboOption[] {
  const seen = new Set<string>()
  return list.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)))
}
