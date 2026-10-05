import { supabase, q, invokeFn } from './supabase'
import { norm } from '../components/Combobox'
import type { LeadSearch, LeadSearchQuery, PlacesBatchResult, ResearchStats } from './types'
import { getSettings } from './refdata'

// ------------------------------------------------------------ Aramalar
export function getLeadSearches(): Promise<LeadSearch[]> {
  return q<LeadSearch[]>(supabase.from('lead_searches').select('*').order('created_at', { ascending: false }))
}

// ------------------------------------------------------------ Google taraması
/** Aramanın kriterlerinden sorgu planını çıkarır / günceller (yön × sektör × il × anahtar kelime). */
export function planSearch(searchId: string): Promise<{ total: number; pending: number; done: number; error: number }> {
  return q(supabase.rpc('lead_search_plan', { p_search: searchId }))
}

export function getSearchQueries(searchId: string): Promise<LeadSearchQuery[]> {
  return fetchAllWhere<LeadSearchQuery>('lead_search_queries', '*', 'search_id', searchId)
}

/** Bekleyen sorgulardan bir partiyi Google'da çalıştırır. */
export function runPlacesBatch(searchId: string, limit = 5): Promise<PlacesBatchResult> {
  return invokeFn<PlacesBatchResult>('places-search', { search_id: searchId, limit })
}

/** Bu ayki Google isteği sayısı */
export async function getPlacesUsage(): Promise<number> {
  const month = new Date().toISOString().slice(0, 7) + '-01'
  const rows = await q<{ requests: number }[]>(supabase.from('api_usage').select('requests').eq('month', month).eq('api', 'google_places'))
  return rows[0]?.requests ?? 0
}

/** Sorguları yeniden çalıştırılmak üzere bekleyene alır. */
export function requeueQueries(ids: string[]): Promise<unknown> {
  return q(supabase.from('lead_search_queries').update({ status: 'pending', error: null }).in('id', ids))
}

// ------------------------------------------------------------ İnternet araştırması (lead-research Edge Function)
export function getResearchStats(): Promise<ResearchStats> {
  return q(supabase.rpc('lead_research_stats'))
}

/** Her dakika çalışan zamanlayıcıyı bu projenin adresiyle kurar */
export function setupResearch(): Promise<unknown> {
  return q(supabase.rpc('lead_research_setup', { p_url: import.meta.env.VITE_SUPABASE_URL }))
}

export async function setResearchPaused(paused: boolean): Promise<void> {
  const s = await getSettings()
  await q(supabase.from('settings').update({ lead_config: { ...s.lead_config, research_paused: paused } }).eq('id', 1))
}

/**
 * Lead'leri elle araştırma sırasına alır (dönüştürülmüşler ve toplu işlemde bekleyenler hariç).
 * Elle istenenler öncelikli: toplu işlemi beklemeden, birkaç dakika içinde araştırılır.
 */
export async function queueResearch(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    await q(supabase.from('leads').update({ research_status: 'pending', research_priority: true, research_error: null, research_attempts: 0 })
      .in('id', ids.slice(i, i + 200)).neq('status', 'converted').or('research_status.is.null,research_status.neq.batched'))
  }
}

export async function retryFailedResearch(): Promise<void> {
  await q(supabase.from('leads').update({ research_status: 'pending', research_error: null, research_attempts: 0 }).eq('research_status', 'failed'))
}

/** Google kaydının haritadaki adresi */
export function mapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`
}

// ------------------------------------------------------------ Puan
export function scoreTone(score: number): string {
  if (score >= 70) return 'bg-emerald-100 text-emerald-800'
  if (score >= 40) return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-600'
}

// ------------------------------------------------------------ Mükerrer kontrolü
/** Firma ünvanındaki şirket türü / kalıp kelimeleri (karşılaştırmada yok sayılır) */
const LEGAL_WORDS = new Set([
  'as', 'a', 's', 'anonim', 'sirketi', 'sti', 'ltd', 'limited', 'san', 'sanayi', 've', 'tic', 'ticaret', 'ith', 'ihr',
  'ithalat', 'ihracat', 'paz', 'pazarlama', 'dis', 'ins', 'insaat', 'taah', 'tur', 'koll', 'kollektif', 'inc', 'llc',
  'gmbh', 'co', 'corp', 'company', 'srl', 'spa', 'bv', 'sa', 'the',
])

/** "ABC Tekstil San. ve Tic. A.Ş." → "abc tekstil" */
export function nameKey(name: string | null | undefined): string {
  return norm(name ?? '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !LEGAL_WORDS.has(w))
    .join(' ')
}

/** Veritabanındaki leads.domain sütunuyla aynı kural: "https://www.abc.com.tr/tr/" → "abc.com.tr" */
export function domainOf(url: string | null | undefined): string | null {
  const d = (url ?? '').trim().toLowerCase().replace(/^([a-z]+:\/\/)?(www\.)?/, '').replace(/[/?#:].*$/, '')
  return d || null
}

export interface DupIndex {
  byName: Map<string, string>
  byDomain: Map<string, string>
}

/** Lead havuzu ve firmalardan mükerrer kontrol dizini. Değer: eşleşen kaydın açıklaması. */
export async function loadDupIndex(): Promise<DupIndex> {
  const [leads, companies] = await Promise.all([
    fetchAll<{ name: string; website: string | null }>('leads', 'name,website'),
    fetchAll<{ name: string; website: string | null }>('companies', 'name,website'),
  ])
  const idx: DupIndex = { byName: new Map(), byDomain: new Map() }
  const add = (rows: { name: string; website: string | null }[], where: string) => rows.forEach((r) => {
    const k = nameKey(r.name)
    const d = domainOf(r.website)
    if (k && !idx.byName.has(k)) idx.byName.set(k, `${where}: ${r.name}`)
    if (d && !idx.byDomain.has(d)) idx.byDomain.set(d, `${where}: ${r.name}`)
  })
  add(companies, 'Firmalarda')
  add(leads, 'Lead havuzunda')
  return idx
}

export function findDup(idx: DupIndex, name: string, website: string | null | undefined): string | null {
  const d = domainOf(website)
  return (d && idx.byDomain.get(d)) || idx.byName.get(nameKey(name)) || null
}

/** Supabase tek sorguda en fazla 1000 satır döner; tümünü sayfa sayfa çeker. */
export function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  return fetchAllWhere<T>(table, columns)
}

/** fetchAll, isteğe bağlı tek eşitlik filtresiyle */
export async function fetchAllWhere<T>(table: string, columns: string, col?: string, value?: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select(columns)
    if (col) query = query.eq(col, value)
    // Sütun listesi çalışma zamanında verildiği için satır tipi çıkarılamaz
    const rows = await q<T[]>(query.order('id').range(from, from + 999) as unknown as PromiseLike<{ data: T[]; error: { message: string } | null }>)
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

// ------------------------------------------------------------ CSV
/** Excel'den kaydedilen CSV'yi okur: UTF-8 değilse Windows-1254 (Türkçe) olarak çözer. */
export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1254').decode(buf)
  }
}

/** Tırnaklı alanları destekleyen CSV ayrıştırıcı. Ayraç (; , sekme) ilk satırdan tahmin edilir. */
export function parseCsv(text: string): string[][] {
  const nl = text.indexOf('\n')
  const first = nl < 0 ? text : text.slice(0, nl)
  const count = (c: string) => first.split(c).length
  const sep = [';', '\t', ','].reduce((a, b) => (count(b) > count(a) ? b : a), ',')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (ch !== '\r') field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** "a@x.com; b@y.com" → ["a@x.com", "b@y.com"] */
export function splitList(v: string | undefined, sep = /[;,|\n]+/): string[] {
  return (v ?? '').split(sep).map((x) => x.trim()).filter(Boolean)
}

/** Evet/Hayır sütunu: boş veya anlaşılmazsa null */
export function parseBool(v: string | undefined): boolean | null {
  const s = norm(v ?? '').trim()
  if (!s) return null
  if (['evet', 'e', 'var', 'yes', 'y', 'true', '1', 'x'].includes(s)) return true
  if (['hayir', 'h', 'yok', 'no', 'n', 'false', '0'].includes(s)) return false
  return null
}
