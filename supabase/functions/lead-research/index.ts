// BOLT LOG CRM - lead-research Edge Function
// Sıradaki lead'leri (research_status = 'pending') Claude ile web'de araştırır ve puanlar.
// Her dakika pg_cron tarafından çağrılır (009_lead_research.sql > lead_research_setup); sırada iş yoksa hemen döner.
//
// Gizli değişken: ANTHROPIC_API_KEY
// Bu fonksiyonda "Verify JWT" KAPALI olmalı: çağrıyı zamanlayıcı yapar, x-research-secret başlığıyla doğrulanır.
//
// Puanlama: Claude her kriter için evet / hayır / bilinmiyor + kanıt döner, puanı bu fonksiyon ağırlıklardan hesaplar.
// Böylece puan tutarlı olur ve her puanın gerekçesi lead ekranında görünür.
//
// Canlı izleme: yanıt akış (stream) olarak alınır; her web araması, okunan sayfa ve sonuç yazımı
// lead_research_events tablosuna adım olarak yazılır (Lead Generation > Araştırma ekranı).

import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const MODEL = 'claude-opus-5-5'
/** Bir çağrıda paralel araştırılan lead sayısı (fonksiyon süre sınırı içinde kalmak için) */
const PARALLEL = 3
/** pause_turn sonrası en fazla devam sayısı */
const MAX_CONTINUATIONS = 3
/** Yaklaşık maliyet (USD, liste fiyatı): Claude Opus 5.5 token fiyatları ve web araması */
const PRICE = { input: 4 / 1e6, output: 20 / 1e6, cacheRead: 0.2 / 1e6, cacheWrite: 5 / 1e6, search: 0.01 }

interface Criterion { key: string; label: string; weight: number; guide: string }

const CUSTOMER_CRITERIA: Criterion[] = [
  { key: 'b2b_goods', label: 'Üretici / ihracatçı / ithalatçı (fiziksel ürün ticareti yapan firma)', weight: 30,
    guide: 'Manufactures, exports, imports or wholesales physical goods. "no" for retail shops, restaurants, service providers, consultants and logistics companies.' },
  { key: 'target_trade', label: 'Hedef ülkeyle ticaret kanıtı', weight: 25,
    guide: 'Evidence of selling to or buying from the target country: the country listed among export markets or references, a website version in that language, an office or distributor there, trade fairs there.' },
  { key: 'international', label: 'Düzenli uluslararası sevkiyat', weight: 15,
    guide: 'Ships internationally on a regular basis: export department, list of export markets, foreign-language website, international certifications, foreign trade staff.' },
  { key: 'freight_fit', label: 'Ürünler deniz / hava kargoya uygun', weight: 10,
    guide: 'Goods move in containers, on pallets or as air cargo (not pipeline or bulk-only, not purely local services).' },
  { key: 'size', label: 'Yeterli büyüklük (üretim tesisi / ~50+ çalışan)', weight: 10,
    guide: 'Own production facility, roughly 50+ employees, or clearly significant trade volumes.' },
  { key: 'reachable', label: 'Ulaşılabilir (e-posta / telefon, tercihen yetkili kişi)', weight: 10,
    guide: 'A company email or phone found; "yes" with more confidence when a named export, logistics or purchasing contact is found.' },
]

const AGENT_CRITERIA: Criterion[] = [
  { key: 'forwarder', label: 'Gerçek freight forwarder / lojistik organizatörü', weight: 30,
    guide: 'Freight forwarder, NVOCC, or customs broker with forwarding that organises international shipments. "no" for local trucking-only carriers, parcel couriers, shipping lines, ports, software vendors.' },
  { key: 'sea_air', label: 'Deniz (FCL/LCL) ve/veya hava kargo hizmeti', weight: 20,
    guide: 'Offers ocean FCL/LCL and/or air freight services.' },
  { key: 'turkey_lane', label: 'Türkiye ile çalışma kanıtı', weight: 20,
    guide: 'Mentions the Turkey / Türkiye trade lane, Turkish partners or offices, Turkish-speaking staff, routes via Istanbul, Mersin, Izmir.' },
  { key: 'network', label: 'Acente ağı üyeliği (WCA, JCtrans, FIATA vb.)', weight: 15,
    guide: 'Member of forwarder networks such as WCA, JCtrans, GLA, X2, or FIATA / a national forwarders association.' },
  { key: 'independent', label: 'Bağımsız, partner olabilecek ölçekte', weight: 5,
    guide: '"yes" for independent forwarders that work with overseas agents; "no" for global integrators (DHL, Kuehne+Nagel, DSV and similar) that use their own offices.' },
  { key: 'reachable', label: 'Ulaşılabilir (e-posta / telefon, tercihen yetkili kişi)', weight: 10,
    guide: 'A company email or phone found; "yes" with more confidence when a named sales or overseas-network contact is found.' },
]

const BUSINESS_TYPES = ['manufacturer', 'exporter_trader', 'importer_distributor', 'wholesaler', 'retailer', 'service_provider',
  'freight_forwarder', 'logistics_other', 'other', 'unknown']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-research-secret',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  return keys.default ?? Object.values(keys)[0] ?? ''
}

function schemaFor(criteria: Criterion[]) {
  const str = { type: 'string' }
  const strArr = { type: 'array', items: { type: 'string' } }
  const tri = { type: 'string', enum: ['yes', 'no', 'unknown'] }
  const properties = {
    summary: str,
    business_type: { type: 'string', enum: BUSINESS_TYPES },
    relevant: { type: 'string', enum: ['yes', 'no', 'unclear'] },
    not_relevant_reason: str,
    products: str,
    website: str,
    linkedin_url: str,
    emails: strArr,
    phones: strArr,
    contact_name: str,
    contact_title: str,
    contact_email: str,
    employees: { type: 'integer' },
    exports: tri,
    imports: tri,
    export_markets: strArr,
    modes: { type: 'array', items: { type: 'string', enum: ['sea_fcl', 'sea_lcl', 'air', 'road'] } },
    sources: strArr,
    criteria: {
      type: 'object',
      additionalProperties: false,
      required: criteria.map((c) => c.key),
      properties: Object.fromEntries(criteria.map((c) => [c.key, {
        type: 'object',
        additionalProperties: false,
        required: ['result', 'evidence'],
        properties: { result: tri, evidence: str },
      }])),
    },
  }
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties }
}

function systemPrompt(kind: 'customer' | 'agent', criteria: Criterion[]): string {
  const role = kind === 'customer'
    ? 'Your job is to decide whether a Turkish company is a promising CUSTOMER: a shipper that exports or imports goods and would need international sea or air freight.'
    : 'Your job is to decide whether a company abroad is a promising AGENT PARTNER: an overseas freight forwarder that could handle the destination side of shipments to and from Turkey and send cargo our way.'
  return `You research companies for BOLT LOG, a newly founded Turkish freight forwarder focused on sea (FCL/LCL) and air freight.
${role}

How to work:
- If a website is given, read it with web_fetch (home page, then an about / export / contact page if needed).
- Use web_search with the company name and city to verify the company, find its website if missing, and fill gaps (export markets, size, contacts).
- Be economical: a few searches and fetches are usually enough. Stop once each criterion can be answered.
- Base every judgement on evidence you actually saw. When the evidence is missing, answer "unknown" rather than guessing.

Criteria (answer each with yes / no / unknown and a short evidence sentence, citing where you saw it):
${criteria.map((c) => `- ${c.key}: ${c.guide}`).join('\n')}

Output rules:
- Write summary, products, not_relevant_reason and every evidence text in Turkish.
- relevant = "no" only when the company is clearly not a potential ${kind === 'customer' ? 'customer (for example a retail shop, restaurant or an unrelated service business)' : 'partner (for example not a logistics company at all)'}; give the reason in not_relevant_reason. Otherwise "yes" or "unclear" and leave not_relevant_reason empty.
- emails, phones, contact_*: only details that belong to this company. Leave empty strings / arrays when not found.
- export_markets: ISO 3166-1 alpha-2 country codes the company sells to.
- employees: your best integer estimate, 0 if unknown.
- modes: freight modes the company's goods (or, for agents, services) plausibly use.
- sources: the URLs you relied on.`
}

type Log = (kind: string, message: string) => void

/** Araştırma adımlarını lead_research_events'e yazar; yazma hataları araştırmayı durdurmaz */
function logger(db: SupabaseClient, leadId: string) {
  const pending: PromiseLike<unknown>[] = []
  const log: Log = (kind, message) => {
    pending.push(db.from('lead_research_events')
      .insert({ lead_id: leadId, kind, message: message.slice(0, 500), created_at: new Date().toISOString() })
      .then(() => undefined, () => undefined))
  }
  return { log, flush: () => Promise.all(pending) }
}

type Lead = {
  id: string; name: string; lead_type: 'customer' | 'agent'; city: string | null; country: string | null; country_code: string | null
  address: string | null; website: string | null; phones: string[] | null; emails: string[] | null; sectors: string[] | null
  direction: string | null; notes: string | null; search_id: string | null; source_detail: string | null; research_attempts: number
}
type Search = { id: string; country: string | null; country_code: string }

async function research(client: Anthropic, lead: Lead, search: Search | undefined, log: Log) {
  const kind = lead.lead_type === 'agent' ? 'agent' : 'customer'
  // Aramaya bağlı olmayan müşteri lead'inde hedef ülke yok: o kriter değerlendirilmez
  const criteria = kind === 'customer'
    ? CUSTOMER_CRITERIA.filter((c) => c.key !== 'target_trade' || search)
    : AGENT_CRITERIA

  const facts = [
    `Company: ${lead.name}`,
    `Location: ${[lead.address, lead.city, lead.country].filter(Boolean).join(', ')}`,
    lead.website && `Website: ${lead.website}`,
    lead.phones?.length && `Phone: ${lead.phones.join(', ')}`,
    lead.sectors?.length && `Sector (from our search): ${lead.sectors.join(', ')}`,
    lead.notes && `Notes: ${lead.notes}`,
    lead.source_detail && `Found with search query: ${lead.source_detail}`,
    kind === 'customer' && search && `Target country: ${search.country ?? search.country_code} (${search.country_code}). We are looking for Turkish companies trading with this country.`,
    kind === 'customer' && !search && 'Target country: none specified; skip the target-country criterion.',
  ].filter(Boolean).join('\n')

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: `Research this company and evaluate it against the criteria.\n\n${facts}` },
  ]
  const params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'messages'> = {
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    // Güvenlik sınıflandırıcısı reddederse istek sunucu tarafında önerilen modelle yeniden çalışır
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: schemaFor(criteria) } },
    system: systemPrompt(kind, criteria),
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3, max_content_tokens: 6000 },
    ],
  }

  let cost = 0
  let searches = 0
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = client.beta.messages.stream({ ...params, messages })
    // Blok tamamlanınca (arama sorgusu / adres belli olunca) adım olarak kaydedilir
    stream.on('contentBlock', (b) => {
      if (b.type === 'server_tool_use' && b.name === 'web_search') log('search', `Web'de aranıyor: “${String(b.input.query ?? '')}”`)
      else if (b.type === 'server_tool_use' && b.name === 'web_fetch') log('fetch', `Sayfa açılıyor: ${String(b.input.url ?? '')}`)
      else if (b.type === 'web_search_tool_result') {
        log('search_result', Array.isArray(b.content) ? `${b.content.length} sonuç bulundu` : `Arama yapılamadı (${b.content.error_code})`)
      } else if (b.type === 'web_fetch_tool_result') {
        if (b.content.type === 'web_fetch_result') log('fetch_result', `Sayfa okundu${b.content.content.title ? `: ${b.content.content.title}` : ''}`)
        else log('fetch_error', `Sayfa açılamadı (${b.content.error_code})`)
      }
    })
    stream.on('streamEvent', (e) => {
      if (e.type === 'content_block_start' && e.content_block.type === 'text') log('writing', 'Kriterler değerlendiriliyor, sonuç yazılıyor')
    })
    const res = await stream.finalMessage()
    const u = res.usage
    const webSearches = u.server_tool_use?.web_search_requests ?? 0
    searches += webSearches
    cost += u.input_tokens * PRICE.input + u.output_tokens * PRICE.output
      + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite
      + webSearches * PRICE.search

    if (res.stop_reason === 'pause_turn') {
      // Sunucu tarafındaki araç döngüsü durakladı: yanıtı geri gönderince kaldığı yerden devam eder
      messages.push({ role: 'assistant', content: res.content })
      log('continue', 'Araştırma devam ediyor')
      continue
    }
    if (res.stop_reason === 'refusal') throw new Error(`Claude bu firmayı araştırmayı reddetti (${res.stop_details?.category ?? 'kategori yok'}).`)
    if (res.stop_reason === 'max_tokens') throw new Error('Yanıt uzunluk sınırına takıldı.')

    const text = [...res.content].reverse().find((b) => b.type === 'text')
    if (!text || text.type !== 'text') throw new Error('Claude sonuç döndürmedi.')
    const out = JSON.parse(text.text)

    const items = criteria.map((c) => {
      const r = out.criteria?.[c.key] ?? { result: 'unknown', evidence: '' }
      return { key: c.key, label: c.label, weight: c.weight, ok: r.result === 'yes' ? true : r.result === 'no' ? false : null, evidence: r.evidence }
    })
    const total = items.reduce((a, x) => a + x.weight, 0)
    const score = Math.round((100 * items.filter((x) => x.ok).reduce((a, x) => a + x.weight, 0)) / (total || 1))
    const { criteria: _criteria, ...rest } = out
    return {
      research: { ...rest, kind, score, score_items: items, model: res.model, cost_usd: Math.round(cost * 1000) / 1000, web_searches: searches,
        target_country: kind === 'customer' ? search?.country_code ?? null : null },
      disqualify: out.relevant === 'no' ? (out.not_relevant_reason || 'İlgili bir firma değil') : null,
      cost,
    }
  }
  throw new Error('Araştırma çok uzun sürdü (devam sınırı aşıldı).')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } })

    const { data: secret } = await db.from('app_secrets').select('value').eq('key', 'research_secret').maybeSingle()
    if (!secret?.value || req.headers.get('x-research-secret') !== secret.value) return json({ error: 'Yetkisiz.' }, 401)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY tanımlı değil. Supabase > Edge Functions > Secrets altına ekleyin.')
    const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 })

    const { data: leads, error } = await db.rpc('lead_research_claim', { p_n: PARALLEL })
    if (error) throw new Error(error.message)
    if (!leads?.length) return json({ processed: 0 })
    await db.rpc('lead_research_events_cleanup')

    const searchIds = [...new Set((leads as Lead[]).map((l) => l.search_id).filter(Boolean))]
    const { data: searches } = searchIds.length
      ? await db.from('lead_searches').select('id,country,country_code').in('id', searchIds)
      : { data: [] as Search[] }
    const byId = new Map((searches ?? []).map((s: Search) => [s.id, s]))

    const results = await Promise.allSettled((leads as Lead[]).map(async (lead) => {
      const { log, flush } = logger(db, lead.id)
      try {
        log('start', `Araştırma başladı${lead.research_attempts > 1 ? ` (${lead.research_attempts}. deneme)` : ''}`)
        const r = await research(client, lead, lead.search_id ? byId.get(lead.search_id) : undefined, log)
        const { error: saveErr } = await db.rpc('lead_research_save', { p_lead: lead.id, p_research: r.research, p_disqualify: r.disqualify })
        if (saveErr) throw new Error(saveErr.message)
        await db.rpc('api_usage_add', { p_api: 'claude_research', p_n: 1 })
        await db.rpc('api_usage_add', { p_api: 'claude_cost_cents', p_n: Math.max(1, Math.round(r.cost * 100)) })
        log('done', `Tamamlandı: puan ${r.research.score}${r.disqualify ? ' · otomatik “Uygun değil”' : ''} · ~$${r.cost.toFixed(2)}`)
      } catch (e) {
        log('error', `Hata: ${(e as Error).message}`)
        await db.rpc('lead_research_fail', { p_lead: lead.id, p_error: (e as Error).message })
        throw e
      } finally {
        await flush()
      }
    }))

    return json({
      processed: results.length,
      failed: results.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason?.message),
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
