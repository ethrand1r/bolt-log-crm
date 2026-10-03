// Teklif PDF'i ve e-posta şablonu için ortak metinler / satırlar
import type { ChargeLine, ChargeTemplate, Quote } from './types'
import { CARGO_TYPES, CARGO_TYPE_EN, CHARGE_UNITS, DIRECTIONS, MODES, MODE_LABEL_EN, label } from './constants'
import { totalsByCurrency } from './format'

export type Lang = 'tr' | 'en'

export const T = {
  tr: {
    title: 'NAVLUN TEKLİFİ', no: 'Teklif No', date: 'Tarih', valid: 'Geçerlilik', to: 'Sayın', attn: 'İlgili',
    details: 'Sevkiyat Detayları', mode: 'Taşıma Şekli', direction: 'Yön', incoterm: 'Teslim Şekli', pol: 'Yükleme Limanı',
    pod: 'Varış Limanı', polAir: 'Kalkış Havalimanı', podAir: 'Varış Havalimanı', polRoad: 'Yükleme Yeri', podRoad: 'Teslim Yeri',
    pickup: 'Yükleme Adresi', delivery: 'Teslim Adresi',
    commodity: 'Emtia', cargoType: 'Yük Tipi', stack: 'İstifleme', stackYes: 'İstiflenebilir', stackNo: 'İstiflenemez',
    dims: 'Ölçüler', equipment: 'Ekipman', packages: 'Kap Adedi', gross: 'Brüt Ağırlık', volume: 'Hacim',
    chargeable: 'Ücretlendirilen Ağırlık', ldm: 'Yükleme Metresi (LDM)', wm: 'W/M', roadLoad: 'Yükleme Şekli', vehicle: 'Araç Tipi',
    carrier: 'Taşıyıcı', transit: 'Transit Süre', frequency: 'Sefer Sıklığı',
    charges: 'Ücretler', desc: 'Açıklama', unit: 'Birim', qty: 'Miktar', price: 'Birim Fiyat', cur: 'Döviz', total: 'Toplam',
    grand: 'TOPLAM', notes: 'Notlar', terms: 'Şartlar ve Koşullar', bank: 'Banka Bilgileri', page: 'Sayfa',
    thanks: 'Teklifimizi değerlendirmenizi rica eder, iyi çalışmalar dileriz.',
    // e-posta
    greeting: (n: string) => `Sayın ${n},`, greetingDefault: 'Sayın Yetkili,',
    intro: (route: string, mode: string) => `${route} güzergahı için ${mode} teklifimizi aşağıda bilgilerinize sunarız.`,
    validLine: (d: string) => `Teklifimiz ${d} tarihine kadar geçerlidir.`,
    closing: 'Sorularınız için her zaman ulaşabilirsiniz.', regards: 'Saygılarımızla,',
    subject: (no: string, route: string, mode: string) => `Navlun Teklifi ${no} - ${route} (${mode})`,
  },
  en: {
    title: 'FREIGHT QUOTATION', no: 'Quotation No', date: 'Date', valid: 'Valid Until', to: 'To', attn: 'Attn',
    details: 'Shipment Details', mode: 'Mode', direction: 'Direction', incoterm: 'Incoterms', pol: 'Port of Loading',
    pod: 'Port of Discharge', polAir: 'Airport of Departure', podAir: 'Airport of Destination', polRoad: 'Place of Loading', podRoad: 'Place of Delivery',
    pickup: 'Pick-up Address', delivery: 'Delivery Address',
    commodity: 'Commodity', cargoType: 'Cargo Type', stack: 'Stacking', stackYes: 'Stackable', stackNo: 'Non-stackable',
    dims: 'Dimensions', equipment: 'Equipment', packages: 'Packages', gross: 'Gross Weight', volume: 'Volume',
    chargeable: 'Chargeable Weight', ldm: 'Loading Meters (LDM)', wm: 'W/M', roadLoad: 'Load Type', vehicle: 'Vehicle Type',
    carrier: 'Carrier', transit: 'Transit Time', frequency: 'Frequency',
    charges: 'Charges', desc: 'Description', unit: 'Unit', qty: 'Qty', price: 'Unit Price', cur: 'Currency', total: 'Total',
    grand: 'TOTAL', notes: 'Notes', terms: 'Terms & Conditions', bank: 'Bank Details', page: 'Page',
    thanks: 'Thank you for the opportunity. We look forward to working with you.',
    greeting: (n: string) => `Dear ${n},`, greetingDefault: 'Dear Sir or Madam,',
    intro: (route: string, mode: string) => `Please find below our ${mode.toLowerCase()} quotation for ${route}.`,
    validLine: (d: string) => `This quotation is valid until ${d}.`,
    closing: 'Please do not hesitate to contact us should you have any questions.', regards: 'Best regards,',
    subject: (no: string, route: string, mode: string) => `Freight Quotation ${no} - ${route} (${mode})`,
  },
}

const DIR_EN: Record<string, string> = { export: 'Export', import: 'Import', crosstrade: 'Cross Trade' }

export function num(n: number, lang: Lang, digits = 2) {
  return n.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
export function date(d: string | null, lang: Lang) {
  if (!d) return '-'
  return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB')
}
export function modeText(mode: string, lang: Lang) {
  return lang === 'en' ? MODE_LABEL_EN[mode] : label(MODES, mode)
}
export function routeText(quote: Pick<Quote, 'pol' | 'pod'>) {
  return [quote.pol, quote.pod].filter(Boolean).join(' → ')
}

/** Sevkiyat detay satırları [etiket, değer] (boş olanlar çıkarılır) */
export function detailRows(quote: Quote, lang: Lang): [string, string][] {
  const t = T[lang]
  const air = quote.mode === 'air'
  const road = quote.mode === 'road'
  const rows: [string, string][] = [
    [t.mode, modeText(quote.mode, lang)],
    [t.direction, lang === 'en' ? DIR_EN[quote.direction] : label(DIRECTIONS, quote.direction)],
    [t.incoterm, quote.incoterm ?? ''],
    [air ? t.polAir : road ? t.polRoad : t.pol, quote.pol ?? ''],
    [air ? t.podAir : road ? t.podRoad : t.pod, quote.pod ?? ''],
    [t.pickup, quote.pickup_address ?? ''],
    [t.delivery, quote.delivery_address ?? ''],
    [t.commodity, quote.commodity ?? ''],
  ]
  if (quote.cargo_type && quote.cargo_type !== 'GEN') {
    const ct = lang === 'en' ? `${quote.cargo_type} - ${CARGO_TYPE_EN[quote.cargo_type]}` : label(CARGO_TYPES, quote.cargo_type)
    const dg = quote.cargo_type === 'DG' ? [quote.dg_un_no, quote.dg_class && `Class ${quote.dg_class}`].filter(Boolean).join(', ') : ''
    rows.push([t.cargoType, dg ? `${ct} (${dg})` : ct])
  }
  if (quote.stackable === false) rows.push([t.stack, t.stackNo])
  if (road) {
    if (quote.road_load) rows.push([t.roadLoad, quote.road_load])
    if (quote.vehicle_type) rows.push([t.vehicle, quote.vehicle_type])
  }
  if (quote.mode === 'sea_fcl') {
    rows.push([t.equipment, (quote.containers ?? []).map((c) => `${c.qty ?? 1} x ${c.type}`).join(', ')])
  }
  const dims = (quote.dimensions ?? []).filter((d) => d.qty && d.l && d.w && d.h)
  if (dims.length) rows.push([t.dims, dims.map((d) => `${d.qty} x ${d.l}×${d.w}×${d.h} cm`).join('; ')])
  if (quote.packages) rows.push([t.packages, String(quote.packages)])
  if (quote.gross_weight) rows.push([t.gross, `${num(Number(quote.gross_weight), lang)} kg`])
  if (quote.volume_cbm) rows.push([t.volume, `${num(Number(quote.volume_cbm), lang, 3)} m³`])
  if (quote.chargeable_weight && (air || road)) rows.push([t.chargeable, `${num(Number(quote.chargeable_weight), lang, Number(quote.chargeable_weight) % 1 ? 2 : 0)} kg`])
  if (quote.ldm && road) rows.push([t.ldm, num(Number(quote.ldm), lang)])
  if (quote.chargeable_weight && quote.mode === 'sea_lcl') rows.push([t.wm, num(Number(quote.chargeable_weight), lang, 3)])
  rows.push([t.carrier, quote.carrier ?? ''], [t.transit, quote.transit_time ?? ''], [t.frequency, quote.frequency ?? ''])
  return rows.filter(([, v]) => v)
}

export interface ChargeRow { desc: string; unit: string; qty: string; price: string; total: string }

/** Ücret satırları (sadece satış fiyatları) ve döviz bazında toplamlar */
export function chargeRows(items: ChargeLine[], templates: ChargeTemplate[], lang: Lang) {
  const rows: ChargeRow[] = items.map((l) => {
    const u = CHARGE_UNITS.find((c) => c.value === l.unit)
    const qty = Number(l.qty)
    return {
      desc: lang === 'en' ? templates.find((x) => x.name === l.description)?.name_en ?? l.description : l.description,
      unit: u ? (lang === 'en' ? u.en : u.label) : l.unit,
      qty: num(qty, lang, qty % 1 ? 2 : 0),
      price: `${num(Number(l.sell_price), lang)} ${l.currency}`,
      total: `${num(qty * Number(l.sell_price), lang)} ${l.currency}`,
    }
  })
  const totals = Object.entries(totalsByCurrency(items)).map(([cur, v]) => `${num(v.sell, lang)} ${cur}`)
  return { rows, totals }
}
