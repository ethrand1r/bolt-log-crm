export type Option = { value: string; label: string; color?: string }

export const COMPANY_TYPES: Option[] = [
  { value: 'prospect', label: 'Potansiyel Müşteri', color: 'bg-amber-100 text-amber-800' },
  { value: 'customer', label: 'Müşteri', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'exporter_importer', label: 'İhracatçı / İthalatçı', color: 'bg-blue-100 text-blue-800' },
  { value: 'agent', label: 'Acente', color: 'bg-violet-100 text-violet-800' },
  { value: 'carrier', label: 'Armatör', color: 'bg-sky-100 text-sky-800' },
  { value: 'airline', label: 'Havayolu', color: 'bg-cyan-100 text-cyan-800' },
  { value: 'customs_broker', label: 'Gümrük Müşaviri', color: 'bg-slate-200 text-slate-700' },
  { value: 'trucker', label: 'Kara Nakliyeci', color: 'bg-orange-100 text-orange-800' },
  { value: 'other', label: 'Diğer', color: 'bg-slate-100 text-slate-600' },
]

export const STAGES: Option[] = [
  { value: 'lead', label: 'Lead', color: 'bg-slate-400' },
  { value: 'contacted', label: 'Görüşüldü', color: 'bg-sky-500' },
  { value: 'quoted', label: 'Teklif Verildi', color: 'bg-indigo-500' },
  { value: 'negotiation', label: 'Pazarlık', color: 'bg-amber-500' },
  { value: 'won', label: 'Kazanıldı', color: 'bg-emerald-500' },
  { value: 'lost', label: 'Kaybedildi', color: 'bg-red-500' },
]

export const MODES: Option[] = [
  { value: 'sea_fcl', label: 'Deniz FCL', color: 'bg-blue-100 text-blue-800' },
  { value: 'sea_lcl', label: 'Deniz LCL', color: 'bg-teal-100 text-teal-800' },
  { value: 'air', label: 'Hava', color: 'bg-fuchsia-100 text-fuchsia-800' },
  { value: 'road', label: 'Karayolu', color: 'bg-orange-100 text-orange-800' },
]

export type ModeGroup = 'sea' | 'air' | 'road'
export function modeGroup(mode: string | null | undefined): ModeGroup {
  return mode === 'air' ? 'air' : mode === 'road' ? 'road' : 'sea'
}
export const MODE_GROUPS: Option[] = [
  { value: 'sea', label: 'Deniz' },
  { value: 'air', label: 'Hava' },
  { value: 'road', label: 'Karayolu' },
]

export const MODE_LABEL_EN: Record<string, string> = {
  sea_fcl: 'Sea Freight FCL',
  sea_lcl: 'Sea Freight LCL',
  air: 'Air Freight',
  road: 'Road Freight',
}

export const DIRECTIONS: Option[] = [
  { value: 'export', label: 'İhracat' },
  { value: 'import', label: 'İthalat' },
  { value: 'crosstrade', label: 'Transit / Crosstrade' },
]

export const QUOTE_STATUSES: Option[] = [
  { value: 'draft', label: 'Taslak', color: 'bg-slate-100 text-slate-700' },
  { value: 'sent', label: 'Gönderildi', color: 'bg-sky-100 text-sky-800' },
  { value: 'accepted', label: 'Kabul Edildi', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'rejected', label: 'Reddedildi', color: 'bg-red-100 text-red-700' },
  { value: 'expired', label: 'Süresi Doldu', color: 'bg-amber-100 text-amber-800' },
]

export const SHIPMENT_STATUSES: Option[] = [
  { value: 'booking', label: 'Booking', color: 'bg-slate-100 text-slate-700' },
  { value: 'departed', label: 'Yüklendi / Kalktı', color: 'bg-sky-100 text-sky-800' },
  { value: 'in_transit', label: 'Yolda', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'arrived', label: 'Vardı', color: 'bg-violet-100 text-violet-800' },
  { value: 'delivered', label: 'Teslim Edildi', color: 'bg-teal-100 text-teal-800' },
  { value: 'invoice_pending', label: 'Fatura Bekliyor', color: 'bg-amber-100 text-amber-800' },
  { value: 'invoiced', label: 'Fatura Kesildi', color: 'bg-lime-100 text-lime-800' },
  { value: 'closed', label: 'Kapandı', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'cancelled', label: 'İptal', color: 'bg-red-100 text-red-700' },
]
/** Sevkiyat akış adımları (Kapandı ve İptal ayrı butonlardır) */
export const SHIPMENT_FLOW = ['booking', 'departed', 'in_transit', 'arrived', 'delivered', 'invoice_pending', 'invoiced']
/** Tamamlanmış sayılan durumlar (firma silinemez) */
export const COMPLETED_SHIPMENT_STATUSES = ['delivered', 'invoice_pending', 'invoiced', 'closed']
/** Aktif (kapanmamış) sevkiyat durumları */
export const ACTIVE_SHIPMENT_STATUSES = ['booking', 'departed', 'in_transit', 'arrived']

export const ACTIVITY_TYPES: Option[] = [
  { value: 'call', label: 'Telefon' },
  { value: 'email', label: 'E-posta' },
  { value: 'meeting', label: 'Toplantı / Ziyaret' },
  { value: 'note', label: 'Not' },
]

export const CHARGE_UNITS: { value: string; label: string; en: string }[] = [
  { value: 'shipment', label: 'Sevkiyat', en: 'Per Shipment' },
  { value: 'container', label: 'Konteyner', en: 'Per Container' },
  { value: 'kg', label: 'Kg', en: 'Per Kg' },
  { value: 'cbm', label: 'CBM', en: 'Per CBM' },
  { value: 'wm', label: 'W/M', en: 'Per W/M' },
  { value: 'bl', label: 'B/L', en: 'Per B/L' },
  { value: 'awb', label: 'AWB', en: 'Per AWB' },
]

export const CURRENCIES = ['USD', 'EUR', 'TRY', 'GBP']

export const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']

export const CONTAINER_TYPES = ['20DC', '40DC', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR']

export const CARGO_TYPES: Option[] = [
  { value: 'GEN', label: 'GEN - Genel kargo' },
  { value: 'PER', label: 'PER - Bozulabilir' },
  { value: 'DG', label: 'DG - Tehlikeli madde' },
  { value: 'PHA', label: 'PHA - İlaç / Pharma' },
  { value: 'VAL', label: 'VAL - Değerli kargo' },
  { value: 'AVI', label: 'AVI - Canlı hayvan' },
  { value: 'HEA', label: 'HEA - Ağır kargo' },
  { value: 'OOG', label: 'OOG - Gabari dışı' },
]
export const CARGO_TYPE_EN: Record<string, string> = {
  GEN: 'General Cargo', PER: 'Perishable', DG: 'Dangerous Goods', PHA: 'Pharmaceuticals',
  VAL: 'Valuable Cargo', AVI: 'Live Animals', HEA: 'Heavy Cargo', OOG: 'Out of Gauge',
}
export const DG_CLASSES = ['1', '2.1', '2.2', '2.3', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '6.2', '7', '8', '9']

export const ROAD_LOADS: Option[] = [
  { value: 'FTL', label: 'FTL - Komple' },
  { value: 'LTL', label: 'LTL - Parsiyel' },
]
export const VEHICLE_TYPES = ['Tenteli', 'Mega', 'Frigo', 'Kapalı kasa', 'Açık kasa', 'Lowbed', 'Konteyner taşıyıcı', 'Kamyon', 'Kamyonet / Panelvan']

export const COMPANY_SOURCES = ['Lead Scraping', 'Referans', 'Web sitesi', 'LinkedIn', 'Soğuk arama', 'Fuar', 'İhracatçı listesi', 'Google Maps', 'E-posta kampanyası', 'Mevcut müşteri', 'Diğer']

// ------------------------------------------------------------ Lead Generation
export const LEAD_STATUSES: Option[] = [
  { value: 'new', label: 'Yeni', color: 'bg-slate-100 text-slate-700' },
  { value: 'contacted', label: 'Ulaşıldı', color: 'bg-sky-100 text-sky-800' },
  { value: 'interested', label: 'İlgileniyor', color: 'bg-amber-100 text-amber-800' },
  { value: 'qualified', label: 'Nitelikli', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'disqualified', label: 'Uygun değil', color: 'bg-red-100 text-red-700' },
  { value: 'converted', label: 'Firmaya dönüştü', color: 'bg-violet-100 text-violet-800' },
]
/** Üzerinde çalışılan (kapanmamış) lead durumları */
export const OPEN_LEAD_STATUSES = ['new', 'contacted', 'interested', 'qualified']

export const LEAD_SOURCES = ['Lead Scraping', 'Fuar', 'İhracatçı listesi', 'LinkedIn', 'Google Maps', 'Web sitesi', 'Referans', 'Soğuk arama', 'Diğer']

export const LEAD_ACTIVITY_TYPES: Option[] = [
  { value: 'call', label: 'Telefon' },
  { value: 'email', label: 'E-posta' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'meeting', label: 'Toplantı / Ziyaret' },
  { value: 'note', label: 'Not' },
]

export const LEAD_OUTCOMES: Option[] = [
  { value: 'no_answer', label: 'Ulaşılamadı', color: 'bg-slate-100 text-slate-700' },
  { value: 'reached', label: 'Görüşüldü', color: 'bg-sky-100 text-sky-800' },
  { value: 'interested', label: 'İlgileniyor', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'not_interested', label: 'İlgilenmiyor', color: 'bg-red-100 text-red-700' },
  { value: 'callback', label: 'Tekrar aranacak', color: 'bg-amber-100 text-amber-800' },
  { value: 'wrong_info', label: 'Bilgi hatalı', color: 'bg-slate-100 text-slate-700' },
]

export const LEAD_DIRECTIONS: Option[] = [
  { value: 'export', label: 'İhracat' },
  { value: 'import', label: 'İthalat' },
  { value: 'both', label: 'İhracat + İthalat' },
]

export function opt(list: Option[], value: string | null | undefined): Option | undefined {
  return list.find((o) => o.value === value)
}
export function label(list: Option[], value: string | null | undefined): string {
  return opt(list, value)?.label ?? value ?? ''
}
