import { supabase, q } from './supabase'
import { COMTRADE_PARTNERS } from '../data/comtradePartners'
import type { LeadConfig, SearchSector, TradeData } from './types'

type ModeHint = 'sea' | 'air' | 'mixed'

/**
 * HS fasılları (2 hane) → CRM sektörü ve tipik taşıma modu.
 * Mod tahmini fasılın genel karakterine göredir: Comtrade'in ücretsiz özet verisinde ağırlık (kg) bulunmadığından
 * kg başına değer hesaplanamıyor.
 */
export const HS_CHAPTERS: Record<string, { name: string; sector: string; mode: ModeHint }> = {
  '01': { name: 'Canlı hayvanlar', sector: 'Tarım & Hayvancılık', mode: 'sea' },
  '02': { name: 'Etler', sector: 'Et & Süt Ürünleri', mode: 'sea' },
  '03': { name: 'Balıklar, su ürünleri', sector: 'Su Ürünleri', mode: 'mixed' },
  '04': { name: 'Süt ürünleri, yumurta, bal', sector: 'Et & Süt Ürünleri', mode: 'sea' },
  '05': { name: 'Diğer hayvansal ürünler', sector: 'Tarım & Hayvancılık', mode: 'sea' },
  '06': { name: 'Canlı bitkiler, çiçekler', sector: 'Tarım & Hayvancılık', mode: 'mixed' },
  '07': { name: 'Sebzeler', sector: 'Taze Meyve & Sebze', mode: 'sea' },
  '08': { name: 'Meyveler, sert kabuklular', sector: 'Taze Meyve & Sebze', mode: 'sea' },
  '09': { name: 'Kahve, çay, baharat', sector: 'Gıda', mode: 'sea' },
  '10': { name: 'Hububat', sector: 'Hububat & Bakliyat', mode: 'sea' },
  '11': { name: 'Değirmencilik ürünleri, un', sector: 'Hububat & Bakliyat', mode: 'sea' },
  '12': { name: 'Yağlı tohumlar', sector: 'Tarım & Hayvancılık', mode: 'sea' },
  '13': { name: 'Bitkisel özsu ve hülasalar', sector: 'Kimya', mode: 'sea' },
  '14': { name: 'Örülmeye elverişli bitkisel maddeler', sector: 'Tarım & Hayvancılık', mode: 'sea' },
  '15': { name: 'Hayvansal / bitkisel yağlar', sector: 'Gıda', mode: 'sea' },
  '16': { name: 'Et ve balık müstahzarları', sector: 'Gıda', mode: 'sea' },
  '17': { name: 'Şeker ve şeker mamulleri', sector: 'Gıda', mode: 'sea' },
  '18': { name: 'Kakao ve müstahzarları', sector: 'Gıda', mode: 'sea' },
  '19': { name: 'Hububat müstahzarları, makarna, bisküvi', sector: 'Gıda', mode: 'sea' },
  '20': { name: 'Sebze ve meyve müstahzarları', sector: 'Gıda', mode: 'sea' },
  '21': { name: 'Yenilen çeşitli gıda müstahzarları', sector: 'Gıda', mode: 'sea' },
  '22': { name: 'Meşrubat, alkollü içkiler', sector: 'İçecek', mode: 'sea' },
  '23': { name: 'Gıda sanayi kalıntıları, yem', sector: 'Tarım & Hayvancılık', mode: 'sea' },
  '24': { name: 'Tütün', sector: 'Tarım & Hayvancılık', mode: 'sea' },
  '25': { name: 'Tuz, kükürt, taş, çimento', sector: 'Madencilik & Doğal Taş', mode: 'sea' },
  '26': { name: 'Metal cevherleri', sector: 'Madencilik & Doğal Taş', mode: 'sea' },
  '27': { name: 'Mineral yakıtlar, yağlar', sector: 'Enerji & Yenilenebilir', mode: 'sea' },
  '28': { name: 'Anorganik kimyasallar', sector: 'Kimya', mode: 'sea' },
  '29': { name: 'Organik kimyasallar', sector: 'Kimya', mode: 'sea' },
  '30': { name: 'Eczacılık ürünleri', sector: 'İlaç & Medikal', mode: 'air' },
  '31': { name: 'Gübreler', sector: 'Kimya', mode: 'sea' },
  '32': { name: 'Boya, vernik, mürekkep', sector: 'Kimya', mode: 'sea' },
  '33': { name: 'Uçucu yağlar, kozmetik', sector: 'Kozmetik & Kişisel Bakım', mode: 'mixed' },
  '34': { name: 'Sabun, yıkama müstahzarları', sector: 'Kimya', mode: 'sea' },
  '35': { name: 'Albüminoid maddeler, tutkal', sector: 'Kimya', mode: 'sea' },
  '36': { name: 'Barut, patlayıcılar', sector: 'Kimya', mode: 'sea' },
  '37': { name: 'Fotoğrafçılık ürünleri', sector: 'Kimya', mode: 'sea' },
  '38': { name: 'Çeşitli kimyasal ürünler', sector: 'Kimya', mode: 'sea' },
  '39': { name: 'Plastikler ve mamulleri', sector: 'Plastik & Kauçuk', mode: 'sea' },
  '40': { name: 'Kauçuk ve mamulleri', sector: 'Plastik & Kauçuk', mode: 'sea' },
  '41': { name: 'Ham postlar, deriler', sector: 'Deri & Ayakkabı', mode: 'sea' },
  '42': { name: 'Deri eşya, saraciye', sector: 'Deri & Ayakkabı', mode: 'mixed' },
  '43': { name: 'Kürkler', sector: 'Deri & Ayakkabı', mode: 'mixed' },
  '44': { name: 'Ağaç ve ahşap eşya', sector: 'Orman Ürünleri', mode: 'sea' },
  '45': { name: 'Mantar', sector: 'Orman Ürünleri', mode: 'sea' },
  '46': { name: 'Hasır ve sepetçi eşyası', sector: 'Orman Ürünleri', mode: 'sea' },
  '47': { name: 'Odun hamuru', sector: 'Kağıt & Ambalaj', mode: 'sea' },
  '48': { name: 'Kağıt ve karton', sector: 'Kağıt & Ambalaj', mode: 'sea' },
  '49': { name: 'Basılı kitap, gazete', sector: 'Kağıt & Ambalaj', mode: 'sea' },
  '50': { name: 'İpek', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '51': { name: 'Yün, hayvan kılı', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '52': { name: 'Pamuk', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '53': { name: 'Diğer bitkisel lifler', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '54': { name: 'Sentetik / suni filamentler', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '55': { name: 'Sentetik / suni devamsız lifler', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '56': { name: 'Vatka, keçe, sicim, halat', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '57': { name: 'Halılar', sector: 'Ev Tekstili & Halı', mode: 'sea' },
  '58': { name: 'Özel dokunmuş mensucat', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '59': { name: 'Emdirilmiş, kaplanmış mensucat', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '60': { name: 'Örme mensucat', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '61': { name: 'Örme giyim eşyası', sector: 'Tekstil & Hazır Giyim', mode: 'mixed' },
  '62': { name: 'Örülmemiş giyim eşyası', sector: 'Tekstil & Hazır Giyim', mode: 'mixed' },
  '63': { name: 'Diğer hazır eşya (ev tekstili)', sector: 'Ev Tekstili & Halı', mode: 'sea' },
  '64': { name: 'Ayakkabılar', sector: 'Deri & Ayakkabı', mode: 'mixed' },
  '65': { name: 'Başlıklar', sector: 'Tekstil & Hazır Giyim', mode: 'mixed' },
  '66': { name: 'Şemsiyeler, bastonlar', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '67': { name: 'Kuş tüyü, yapma çiçek', sector: 'Tekstil & Hazır Giyim', mode: 'sea' },
  '68': { name: 'Taş, alçı, çimento eşya', sector: 'Madencilik & Doğal Taş', mode: 'sea' },
  '69': { name: 'Seramik mamulleri', sector: 'Cam & Seramik', mode: 'sea' },
  '70': { name: 'Cam ve cam eşya', sector: 'Cam & Seramik', mode: 'sea' },
  '71': { name: 'Kıymetli taş ve metaller, mücevher', sector: 'Mücevher & Değerli Taş', mode: 'air' },
  '72': { name: 'Demir ve çelik', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '73': { name: 'Demir / çelik eşya', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '74': { name: 'Bakır', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '75': { name: 'Nikel', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '76': { name: 'Alüminyum', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '78': { name: 'Kurşun', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '79': { name: 'Çinko', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '80': { name: 'Kalay', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '81': { name: 'Diğer adi metaller', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '82': { name: 'Aletler, bıçakçı eşyası', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '83': { name: 'Adi metallerden çeşitli eşya', sector: 'Demir-Çelik & Metal', mode: 'sea' },
  '84': { name: 'Makineler, mekanik cihazlar', sector: 'Makine & Ekipman', mode: 'sea' },
  '85': { name: 'Elektrikli makine ve cihazlar', sector: 'Elektrik & Elektronik', mode: 'mixed' },
  '86': { name: 'Demiryolu taşıtları', sector: 'Makine & Ekipman', mode: 'sea' },
  '87': { name: 'Motorlu kara taşıtları, parçaları', sector: 'Otomotiv & Yedek Parça', mode: 'sea' },
  '88': { name: 'Hava taşıtları, parçaları', sector: 'Savunma & Havacılık', mode: 'air' },
  '89': { name: 'Gemiler', sector: 'Makine & Ekipman', mode: 'sea' },
  '90': { name: 'Optik, ölçü, tıbbi cihazlar', sector: 'İlaç & Medikal', mode: 'air' },
  '91': { name: 'Saatler', sector: 'Mücevher & Değerli Taş', mode: 'air' },
  '92': { name: 'Müzik aletleri', sector: 'Diğer', mode: 'sea' },
  '93': { name: 'Silah ve mühimmat', sector: 'Savunma & Havacılık', mode: 'mixed' },
  '94': { name: 'Mobilya, aydınlatma, prefabrik yapılar', sector: 'Mobilya', mode: 'sea' },
  '95': { name: 'Oyuncaklar, spor malzemeleri', sector: 'Oyuncak & Kırtasiye', mode: 'sea' },
  '96': { name: 'Çeşitli mamul eşya', sector: 'Oyuncak & Kırtasiye', mode: 'sea' },
  '97': { name: 'Sanat eserleri, antikalar', sector: 'Diğer', mode: 'air' },
  '99': { name: 'Sınıflandırılmamış', sector: 'Diğer', mode: 'sea' },
}

export const MODE_HINT_LABEL: Record<ModeHint, string> = { sea: 'Deniz', air: 'Hava', mixed: 'Deniz / Hava' }

export const DEFAULT_LEAD_CONFIG: LeadConfig = {
  coverage: 80,
  max_sectors: 10,
  always_cities: ['Istanbul', 'Ankara', 'Izmir'],
  excluded_sectors: ['Enerji & Yenilenebilir', 'Diğer'],
}

// ------------------------------------------------------------ Veri çekme
const CACHE_DAYS = 30

/** Ülkenin ticaret verisini önbellekten veya Comtrade'den (Edge Function) getirir. */
export async function getTradeData(countryCode: string, force = false): Promise<TradeData> {
  const partner = COMTRADE_PARTNERS[countryCode]
  if (!partner) throw new Error('Bu ülke için Comtrade kodu bulunamadı.')
  if (!force) {
    const cached = await q<{ data: TradeData; fetched_at: string }[]>(
      supabase.from('trade_cache').select('data,fetched_at').eq('country_code', countryCode),
    )
    const c = cached[0]
    if (c && Date.now() - new Date(c.fetched_at).getTime() < CACHE_DAYS * 86_400_000) return { ...c.data, fetched_at: c.fetched_at }
  }
  const { data, error } = await supabase.functions.invoke<TradeData & { error?: string }>('trade-stats', { body: { partner } })
  if (error) {
    // Fonksiyonun döndürdüğü hata mesajını göster
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    if (body?.error) throw new Error(body.error)
    if (/not found|404/i.test(error.message)) throw new Error('“trade-stats” Edge Function bulunamadı. Supabase’e yüklendiğinden emin olun.')
    throw new Error(error.message)
  }
  if (!data || data.error) throw new Error(data?.error ?? 'Ticaret verisi alınamadı.')
  const fetched_at = new Date().toISOString()
  const trade: TradeData = { year: data.year, prevYear: data.prevYear, rows: data.rows }
  await q(supabase.from('trade_cache').upsert({ country_code: countryCode, data: trade, fetched_at }))
  return { ...trade, fetched_at }
}

// ------------------------------------------------------------ Analiz
export interface SectorStat extends SearchSector {
  /** Kurala göre otomatik seçildi mi */
  auto: boolean
}

/**
 * Bir yöndeki (X: ihracat, M: ithalat) fasılları sektörlere toplar, hacme göre sıralar.
 * Toplam hacmin coverage %'sini oluşturan ilk sektörler (en fazla max_sectors) otomatik seçilir.
 * Bölgeler: sektörün yoğunlaştığı ilk 5 il + her zaman dahil iller.
 */
export function analyzeFlow(
  trade: TradeData,
  flow: 'X' | 'M',
  cfg: LeadConfig,
  regions: Map<string, string[]>,
): { sectors: SectorStat[]; total: number } {
  const by = new Map<string, { value: number; prev: number; hs: string[]; modes: Record<ModeHint, number> }>()
  let total = 0
  for (const r of trade.rows) {
    if (r.flow !== flow) continue
    const ch = HS_CHAPTERS[r.hs]
    const sector = ch?.sector ?? 'Diğer'
    if (cfg.excluded_sectors.includes(sector)) continue
    const s = by.get(sector) ?? { value: 0, prev: 0, hs: [], modes: { sea: 0, air: 0, mixed: 0 } }
    s.value += r.value
    s.prev += r.prev
    if (r.value > 0) s.hs.push(r.hs)
    s.modes[ch?.mode ?? 'sea'] += r.value
    by.set(sector, s)
    total += r.value
  }
  const list = [...by.entries()]
    .filter(([, s]) => s.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
  let cum = 0
  return {
    total,
    sectors: list.map(([sector, s], i) => {
      const share = total ? s.value / total : 0
      // Eşiği geçiren sektör de dahil edilir (kapsam en az coverage % olur)
      const auto = cum < cfg.coverage / 100 && i < cfg.max_sectors
      cum += share
      const mode = (Object.entries(s.modes).sort((a, b) => b[1] - a[1])[0][0]) as ModeHint
      return {
        sector,
        value: s.value,
        prev_value: s.prev,
        share,
        mode,
        hs: s.hs.sort(),
        cities: uniqueCities([...(regions.get(sector) ?? []), ...cfg.always_cities]),
        auto,
      }
    }),
  }
}

export function uniqueCities(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))]
}

// ------------------------------------------------------------ Biçim
export function fmtUsd(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} Mr $`
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn $`
  if (v >= 1e3) return `${(v / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} B $`
  return `${v.toLocaleString('tr-TR')} $`
}

export function trendPct(value: number, prev: number): number | null {
  return prev > 0 ? (value - prev) / prev : null
}
