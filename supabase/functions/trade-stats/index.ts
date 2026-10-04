// BOLT LOG CRM - trade-stats Edge Function
// Türkiye ile bir ülke arasındaki ihracat / ithalatı HS fasılları (2 hane) bazında UN Comtrade'den çeker.
// Comtrade tarayıcıdan doğrudan çağrılamadığı (CORS) için bu fonksiyon aradan geçer.
//
// Girdi:  { "partner": 643 }   (Comtrade ülke kodu, ör. Rusya 643)
// Çıktı:  { year, prevYear, rows: [{ flow: "X" | "M", hs: "72", value, prev }] }
//   X: Türkiye'nin o ülkeye ihracatı, M: Türkiye'nin o ülkeden ithalatı, değerler USD
//
// Anahtarsız "preview" servisi kullanılır: sorgu başına tek yıl, birkaç saniyede bir istek.
// İleride Comtrade anahtarı eklenirse COMTRADE_KEY gizli değişkeni ile tam servis kullanılabilir.

const TURKEY = 792
const BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface ComtradeRow { flowCode: string; cmdCode: string; primaryValue: number }

/** Bir yılın verisini çeker. İstek sınırına takılırsa bekleyip tekrar dener. */
async function fetchYear(partner: number, year: number): Promise<ComtradeRow[]> {
  const url = `${BASE}?reporterCode=${TURKEY}&partnerCode=${partner}&flowCode=X,M&cmdCode=AG2&period=${year}`
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url)
    const body = await res.json().catch(() => null)
    if (res.status === 429 || body?.statusCode === 429) {
      await sleep(4000)
      continue
    }
    if (!res.ok) throw new Error(`Comtrade hatası (${res.status}): ${body?.message ?? body?.error ?? ''}`)
    if (body?.error) throw new Error(`Comtrade hatası: ${body.error}`)
    return body?.data ?? []
  }
  throw new Error('Comtrade istek sınırı aşıldı, biraz sonra tekrar deneyin.')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { partner } = await req.json()
    if (!Number.isInteger(partner)) throw new Error('Geçersiz ülke kodu.')

    // Yayınlanmış en güncel yılı bul (veriler birkaç ay gecikmeli gelir)
    const thisYear = new Date().getFullYear()
    let year = 0
    let current: ComtradeRow[] = []
    for (const y of [thisYear - 1, thisYear - 2, thisYear - 3]) {
      current = await fetchYear(partner, y)
      if (current.length) { year = y; break }
      await sleep(3500)
    }
    if (!year) throw new Error('Bu ülke için son üç yılda Türkiye ticaret verisi bulunamadı.')

    await sleep(3500)
    const previous = await fetchYear(partner, year - 1)
    const prevMap = new Map(previous.map((r) => [`${r.flowCode}:${r.cmdCode}`, r.primaryValue]))

    const rows = current
      .filter((r) => (r.flowCode === 'X' || r.flowCode === 'M') && /^\d{2}$/.test(r.cmdCode))
      .map((r) => ({
        flow: r.flowCode,
        hs: r.cmdCode,
        value: Math.round(r.primaryValue),
        prev: Math.round(prevMap.get(`${r.flowCode}:${r.cmdCode}`) ?? 0),
      }))

    return new Response(JSON.stringify({ year, prevYear: year - 1, rows }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
