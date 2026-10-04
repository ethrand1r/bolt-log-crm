import { supabase, q } from './supabase'
import { norm } from '../components/Combobox'
import type { LeadSearch } from './types'

// ------------------------------------------------------------ Aramalar
export function getLeadSearches(): Promise<LeadSearch[]> {
  return q<LeadSearch[]>(supabase.from('lead_searches').select('*').order('created_at', { ascending: false }))
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
export async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    // Sütun listesi çalışma zamanında verildiği için satır tipi çıkarılamaz
    const rows = await q<T[]>(supabase.from(table).select(columns).range(from, from + 999) as unknown as PromiseLike<{ data: T[]; error: { message: string } | null }>)
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
