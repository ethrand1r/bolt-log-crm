import type { ChargeLine, DimLine } from './types'

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '-'
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d)
  return date.toLocaleDateString('tr-TR')
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '-'
  return new Date(d).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtMoney(n: number | null | undefined, currency = 'USD'): string {
  if (n === null || n === undefined) return '-'
  return `${fmtNum(n)} ${currency}`
}

export function todayISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Yerel saatle ay başı / sonraki ay başı (ISO) */
export function monthRange(year: number, month: number): [string, string] {
  return [new Date(year, month, 1).toISOString(), new Date(year, month + 1, 1).toISOString()]
}

/** Ölçü satırlarından toplam hacim (cm → m³) */
export function cbmFromDims(dims: DimLine[] | null | undefined): number | null {
  const valid = (dims ?? []).filter((d) => d.qty > 0 && d.l > 0 && d.w > 0 && d.h > 0)
  if (!valid.length) return null
  return Math.round(valid.reduce((s, d) => s + (d.qty * d.l * d.w * d.h) / 1_000_000, 0) * 1000) / 1000
}

/**
 * Karayolu yükleme metresi (LDM): taban alanı / 2,40 m dorse genişliği.
 * İstiflenebilir yükte 2,70 m iç yüksekliğe sığan kat sayısı kadar parça üst üste konur.
 * 0,01'e yukarı yuvarlanır.
 */
export const TRAILER_WIDTH_CM = 240
export const TRAILER_HEIGHT_CM = 270
export function ldmFromDims(dims: DimLine[] | null | undefined, stackable: boolean | null | undefined): number | null {
  const valid = (dims ?? []).filter((d) => d.qty > 0 && d.l > 0 && d.w > 0 && d.h > 0)
  if (!valid.length) return null
  const total = valid.reduce((s, d) => {
    const levels = stackable === false ? 1 : Math.max(1, Math.floor(TRAILER_HEIGHT_CM / d.h))
    return s + Math.ceil(d.qty / levels) * (d.l * d.w) / (TRAILER_WIDTH_CM * 100)
  }, 0)
  return Math.ceil(Math.round(total * 10000) / 100) / 100
}

/**
 * Ücretlendirilebilir ağırlık:
 *  - Hava: max(brüt kg, CBM × 167), üst tam sayıya yuvarlanır
 *  - Karayolu: max(brüt kg, CBM × 333), üst tam sayıya yuvarlanır
 *  - Deniz LCL: W/M = max(CBM, brüt ton)
 */
export function chargeableFor(mode: string | null | undefined, grossKg: number | null, cbm: number | null): number | null {
  if (!grossKg && !cbm) return null
  const g = grossKg ?? 0
  const v = cbm ?? 0
  if (mode === 'air') return Math.ceil(Math.max(g, v * 167))
  if (mode === 'road') return Math.ceil(Math.max(g, v * 333))
  if (mode === 'sea_lcl') return Math.round(Math.max(v, g / 1000) * 1000) / 1000
  return null
}

export type CurrencyTotals = Record<string, { buy: number; sell: number; profit: number }>

/** Masraf kalemlerini döviz bazında toplar (kurlar karıştırılmaz). */
export function totalsByCurrency(lines: Pick<ChargeLine, 'qty' | 'buy_price' | 'sell_price' | 'currency'>[]): CurrencyTotals {
  const t: CurrencyTotals = {}
  for (const l of lines) {
    const c = l.currency || 'USD'
    t[c] ??= { buy: 0, sell: 0, profit: 0 }
    const qty = Number(l.qty) || 0
    t[c].buy += qty * (Number(l.buy_price) || 0)
    t[c].sell += qty * (Number(l.sell_price) || 0)
    t[c].profit = t[c].sell - t[c].buy
  }
  return t
}

/** Boş string'leri null'a çevirir (form → veritabanı). */
export function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? null : v
  return out as T
}

export function numOrNull(v: string | number | null | undefined): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isNaN(n) ? null : n
}
