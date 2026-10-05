// BOLT LOG CRM - places-search Edge Function
// Bir lead aramasının bekleyen sorgularını Google Places (Text Search) ile çalıştırır,
// bulunan firmaları mükerrer kontrolüyle lead havuzuna ekler (lead_discovered_insert).
//
// Girdi:  { "search_id": "...", "limit": 5 }   (bu çağrıda en fazla kaç sorgu çalışsın)
// Çıktı:  { processed, found, inserted, requests, remaining, usage, limit, stopped? }
//
// Gizli değişken: GOOGLE_PLACES_KEY (Google Cloud > Places API (New) etkin bir API anahtarı)
// Veritabanına çağıranın oturumuyla erişilir (RLS geçerli, eklenen lead'lerin sahibi çağıran kullanıcı).

import { createClient } from 'npm:@supabase/supabase-js@2'

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText'
const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents', 'places.websiteUri',
  'places.internationalPhoneNumber', 'places.businessStatus', 'places.primaryTypeDisplayName', 'nextPageToken',
].join(',')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Place {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  // Google boş alanları yanıta hiç koymaz: types / longText eksik olabilir
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[]
  websiteUri?: string
  internationalPhoneNumber?: string
  businessStatus?: string
  primaryTypeDisplayName?: { text: string }
}

/** country_code: sorgunun çalıştığı ülke (müşteri sorguları TR, acente sorguları aramanın hedef ülkesi) */
interface Query { id: string; query: string; country_code: string }

/** Uygulamadaki il listesiyle aynı yazım: "İstanbul" → "Istanbul", "Kahramanmaraş" → "Kahramanmaras" */
function asciiCity(s: string): string {
  const map: Record<string, string> = { ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ü: 'u', Ü: 'U', ö: 'o', Ö: 'O', ç: 'c', Ç: 'C' }
  return s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => map[c])
}

class FatalError extends Error {}

async function searchPage(key: string, textQuery: string, country: string, pageToken?: string) {
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery, languageCode: country === 'TR' ? 'tr' : 'en', regionCode: country, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`
    // Anahtar / yetki / kota hataları tüm taramayı durdurur
    if ([400, 401, 403, 429].includes(res.status) && !/query/i.test(msg)) throw new FatalError(`Google Places: ${msg}`)
    throw new Error(`Google Places: ${msg}`)
  }
  return { places: (body?.places ?? []) as Place[], next: body?.nextPageToken as string | undefined }
}

function toItem(p: Place, country: string) {
  const comp = (type: string) => p.addressComponents?.find((c) => c.types?.includes(type))
  return {
    place_id: p.id,
    name: p.displayName?.text ?? '',
    // Türkiye'de il (1. seviye idari bölge); yurt dışında şehir, yoksa eyalet / bölge
    city: country === 'TR'
      ? asciiCity(comp('administrative_area_level_1')?.longText ?? '')
      : (comp('locality') ?? comp('postal_town') ?? comp('administrative_area_level_1'))?.longText ?? '',
    address: p.formattedAddress ?? '',
    website: p.websiteUri ?? '',
    phone: p.internationalPhoneNumber ?? '',
    category: p.primaryTypeDisplayName?.text ?? '',
    country: comp('country')?.shortText ?? '',
    country_name: comp('country')?.longText ?? '',
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const key = Deno.env.get('GOOGLE_PLACES_KEY')
    if (!key) throw new Error('Google Places anahtarı tanımlı değil. Supabase > Edge Functions > Secrets altına GOOGLE_PLACES_KEY ekleyin.')

    const { search_id, limit = 5 } = await req.json()
    if (typeof search_id !== 'string') throw new Error('Geçersiz arama.')

    const db = createClient(Deno.env.get('SUPABASE_URL')!, req.headers.get('apikey') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    })
    const check = <T>(r: { data: T; error: { message: string } | null }): T => {
      if (r.error) throw new Error(r.error.message)
      return r.data
    }

    const settings = check(await db.from('settings').select('lead_config').eq('id', 1).maybeSingle())
    const cfg = (settings?.lead_config ?? {}) as { places_pages?: number; places_monthly_limit?: number }
    const pages = Math.min(3, Math.max(1, cfg.places_pages ?? 1))
    const monthlyLimit = cfg.places_monthly_limit ?? 900

    const month = new Date().toISOString().slice(0, 7) + '-01'
    const usageRow = check(await db.from('api_usage').select('requests').eq('month', month).eq('api', 'google_places').maybeSingle())
    let usage = usageRow?.requests ?? 0

    const queries = check(await db.from('lead_search_queries').select('id,query,country_code')
      .eq('search_id', search_id).eq('status', 'pending').order('created_at').order('query').limit(Math.min(20, Math.max(1, limit)))) as Query[]

    let processed = 0, found = 0, inserted = 0, requests = 0
    let stopped: string | null = null

    for (const q of queries) {
      if (usage >= monthlyLimit) {
        stopped = `Aylık Google isteği sınırına ulaşıldı (${usage}/${monthlyLimit}). Sınırı Ayarlar > Lead araması'ndan değiştirebilirsiniz.`
        break
      }
      const items: ReturnType<typeof toItem>[] = []
      let qRequests = 0
      let step = 'Google araması'
      try {
        let token: string | undefined
        for (let page = 0; page < pages && usage < monthlyLimit; page++) {
          step = 'Google araması'
          const r = await searchPage(key, q.query, q.country_code, token)
          qRequests++
          step = 'istek sayacı'
          usage = check(await db.rpc('api_usage_add', { p_api: 'google_places', p_n: 1 })) as number
          step = 'sonuçların okunması'
          items.push(...r.places.filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY').map((p) => toItem(p, q.country_code)).filter((i) => !i.country || i.country === q.country_code))
          token = r.next
          if (!token) break
        }
        step = 'lead havuzuna ekleme'
        const n = check(await db.rpc('lead_discovered_insert', { p_query: q.id, p_items: items })) as number
        step = 'sorgu durumunun kaydı'
        check(await db.from('lead_search_queries').update({
          status: 'done', found: items.length, inserted: n, requests: qRequests, error: null, ran_at: new Date().toISOString(),
        }).eq('id', q.id))
        found += items.length
        inserted += n
      } catch (e) {
        const fatal = e instanceof FatalError
        await db.from('lead_search_queries').update({
          status: fatal ? 'pending' : 'error', requests: qRequests,
          error: fatal ? (e as Error).message : `[${step}] ${(e as Error).message}`, ran_at: new Date().toISOString(),
        }).eq('id', q.id)
        if (fatal) { stopped = (e as Error).message; break }
      }
      requests += qRequests
      processed++
    }

    const { count } = await db.from('lead_search_queries').select('id', { count: 'exact', head: true })
      .eq('search_id', search_id).eq('status', 'pending')

    return json({ processed, found, inserted, requests, remaining: count ?? 0, usage, limit: monthlyLimit, stopped })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
