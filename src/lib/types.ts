export type Mode = 'sea_fcl' | 'sea_lcl' | 'air' | 'road'
export type Direction = 'export' | 'import' | 'crosstrade'
export type Currency = 'USD' | 'EUR' | 'TRY' | 'GBP'

export interface Company {
  id: string
  name: string
  type: string
  sectors: string[] | null
  country: string | null
  country_code: string | null
  city: string | null
  address: string | null
  phones: string[] | null
  emails: string[] | null
  website: string | null
  tax_office: string | null
  tax_no: string | null
  eori: string | null
  source: string | null
  tags: string[] | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  company_id: string | null
  full_name: string
  title: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
}

export interface Opportunity {
  id: string
  title: string
  company_id: string | null
  contact_id: string | null
  stage: string
  mode: Mode | null
  origin: string | null
  destination: string | null
  volume_note: string | null
  est_value: number | null
  currency: string | null
  expected_close: string | null
  lost_reason: string | null
  notes: string | null
  sort: number
  created_at: string
  updated_at: string
  companies?: { name: string } | null
}

export interface DimLine {
  qty: number
  l: number
  w: number
  h: number
}

/** Teklif ve sevkiyatta ortak yük alanları */
export interface CargoFields {
  commodity: string | null
  packages: number | null
  gross_weight: number | null
  volume_cbm: number | null
  chargeable_weight: number | null
  /** Karayolu yükleme metresi */
  ldm: number | null
  dimensions: DimLine[]
  cargo_type: string | null
  dg_un_no: string | null
  dg_class: string | null
  stackable: boolean | null
  road_load: string | null
  vehicle_type: string | null
}

export interface ContainerLine {
  type: string
  qty?: number
  no?: string
  seal?: string
}

export interface ChargeLine {
  id?: string
  description: string
  unit: string
  qty: number
  buy_price: number
  sell_price: number
  currency: string
  sort?: number
}

export interface Quote extends CargoFields {
  id: string
  quote_no: string
  company_id: string | null
  contact_id: string | null
  opportunity_id: string | null
  status: string
  language: 'tr' | 'en'
  mode: Mode
  direction: Direction
  incoterm: string | null
  pol: string | null
  pod: string | null
  pickup_address: string | null
  delivery_address: string | null
  containers: ContainerLine[]
  carrier: string | null
  transit_time: string | null
  frequency: string | null
  valid_until: string | null
  notes: string | null
  terms: string | null
  created_at: string
  updated_at: string
  companies?: { name: string } | null
}

export interface Shipment extends CargoFields {
  id: string
  job_no: string
  quote_id: string | null
  company_id: string | null
  status: string
  mode: Mode
  direction: Direction
  incoterm: string | null
  shipper_id: string | null
  consignee_id: string | null
  notify_id: string | null
  agent_id: string | null
  carrier: string | null
  booking_no: string | null
  mbl_no: string | null
  hbl_no: string | null
  mawb_no: string | null
  hawb_no: string | null
  vessel: string | null
  voyage: string | null
  flight_no: string | null
  pol: string | null
  pod: string | null
  /** Hava: aktarma havalimanları (sırayla) */
  transits: string[]
  pickup_address: string | null
  delivery_address: string | null
  etd: string | null
  eta: string | null
  atd: string | null
  ata: string | null
  containers: ContainerLine[]
  cmr_no: string | null
  truck_plate: string | null
  trailer_plate: string | null
  driver_name: string | null
  driver_phone: string | null
  border_gate: string | null
  notes: string | null
  created_at: string
  updated_at: string
  companies?: { name: string } | null
}

export interface ShipmentDocument {
  id: string
  shipment_id: string
  name: string
  path: string
  size: number | null
  created_at: string
}

export interface Activity {
  id: string
  company_id: string | null
  contact_id: string | null
  opportunity_id: string | null
  type: string
  subject: string
  body: string | null
  activity_date: string
  created_at: string
}

export interface ScoreItem {
  key: string
  label: string
  weight: number
  /** null: bilgi yok */
  ok: boolean | null
  /** İnternet araştırmasında bulunan kanıt */
  evidence?: string
}

/** Claude'un internet araştırması sonucu (leads.research) */
export interface LeadResearch {
  kind: 'customer' | 'agent'
  summary: string
  business_type: string
  relevant: 'yes' | 'no' | 'unclear'
  not_relevant_reason: string
  products: string
  exports: 'yes' | 'no' | 'unknown'
  imports: 'yes' | 'no' | 'unknown'
  export_markets: string[]
  sources: string[]
  score: number
  score_items: ScoreItem[]
  target_country: string | null
  cost_usd: number
  /** Araştırmayı yapan model */
  model?: string
}

/** İnternet araştırmasının bir adımı (lead-research Edge Function yazar) */
export interface LeadResearchEvent {
  id: number
  lead_id: string
  created_at: string
  kind: 'start' | 'search' | 'search_result' | 'fetch' | 'fetch_result' | 'fetch_error' | 'writing' | 'continue' | 'done' | 'error'
  message: string
}

export interface ResearchStats {
  pending: number
  running: number
  done: number
  failed: number
  month_leads: number
  month_cost_cents: number
  /** Zamanlayıcı kurulu mu */
  configured: boolean
}

export interface Lead {
  id: string
  name: string
  sectors: string[] | null
  country: string | null
  country_code: string | null
  city: string | null
  address: string | null
  website: string | null
  /** Web sitesinden türetilir (mükerrer kontrolü), salt okunur */
  domain: string | null
  linkedin_url: string | null
  phones: string[] | null
  emails: string[] | null
  contact_name: string | null
  contact_title: string | null
  contact_email: string | null
  contact_phone: string | null
  source: string | null
  source_detail: string | null
  exports: boolean | null
  employees: number | null
  modes: string[] | null
  direction: string | null
  target_markets: string[] | null
  est_volume: string | null
  status: string
  disqualify_reason: string | null
  score: number
  score_items: ScoreItem[] | null
  next_action_date: string | null
  next_action_note: string | null
  last_contact_at: string | null
  company_id: string | null
  converted_at: string | null
  search_id: string | null
  /** Google Places taramasıyla bulunduysa */
  google_place_id: string | null
  /** customer: müşteri adayı, agent: yurt dışı acente / forwarder (puanlanmaz) */
  lead_type: 'customer' | 'agent'
  /** pending: sırada, running: araştırılıyor, done, failed. null: araştırma istenmedi (eski kurallarla puanlanır) */
  research_status: 'pending' | 'running' | 'done' | 'failed' | null
  research: LeadResearch | null
  /** Yeniden araştırılınca bir önceki sonuç (karşılaştırma için) */
  research_prev: LeadResearch | null
  research_started_at: string | null
  research_attempts: number
  researched_at: string | null
  research_error: string | null
  notes: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

/** Comtrade: Türkiye ↔ ülke ticareti, HS fasılları bazında (USD) */
export interface TradeData {
  year: number
  prevYear: number
  rows: { flow: 'X' | 'M'; hs: string; value: number; prev: number }[]
  fetched_at?: string
}

/** Aramada seçilmiş bir sektör (ihracat veya ithalat yönünde) */
export interface SearchSector {
  sector: string
  value: number
  prev_value: number
  /** Yöndeki toplam içindeki pay (0-1) */
  share: number
  mode: 'sea' | 'air' | 'mixed'
  hs: string[]
  /** Hedef bölgeler (il) */
  cities: string[]
}

export interface SearchCriteria {
  year: number
  prev_year: number
  export: SearchSector[]
  import: SearchSector[]
  /** Hedef ülkede acente / forwarder araması: "<anahtar kelime> <şehir>" */
  agents?: { cities: string[]; keywords: string[] }
}

/**
 * Lead araması: ülke girilir, ticaret verisinden ihracat ve ithalat için hedef sektör + bölgeler çıkarılır.
 * Bu aramaya bağlı lead'ler bu hedeflere göre puanlanır, yönleri (ihracatçı / ithalatçı) otomatik belirlenir.
 */
export interface LeadSearch {
  id: string
  name: string
  country_code: string
  country: string | null
  criteria: SearchCriteria
  notes: string | null
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

/** Ayarlar > Lead araması */
export interface LeadConfig {
  /** Toplam hacmin yüzde kaçını oluşturan sektörler seçilsin */
  coverage: number
  max_sectors: number
  /** Her sektöre eklenen iller */
  always_cities: string[]
  /** Analize hiç alınmayan sektörler (ör. boru hattı / dökme enerji) */
  excluded_sectors: string[]
  /** Google taramasında sorgu başına sayfa (1 sayfa = en fazla 20 firma, 1 istek) */
  places_pages: number
  /** Aylık Google isteği sınırı; aşılınca tarama durur */
  places_monthly_limit: number
  /** Otomatik internet araştırması duraklatıldı mı */
  research_paused: boolean
  /** Ayda en fazla kaç lead araştırılır */
  research_monthly_limit: number
}

/** Bir aramanın tarama planındaki tek Google sorgusu: "<anahtar kelime> <il>" */
export interface LeadSearchQuery {
  id: string
  search_id: string
  direction: 'export' | 'import' | 'agent'
  /** Sorgunun çalıştığı ülke: müşteri sorguları TR, acente sorguları hedef ülke */
  country_code: string
  sector: string
  city: string
  keyword: string
  query: string
  status: 'pending' | 'done' | 'error'
  found: number
  inserted: number
  requests: number
  error: string | null
  ran_at: string | null
  created_at: string
}

/** places-search Edge Function'ın bir parti sonucu */
export interface PlacesBatchResult {
  processed: number
  found: number
  inserted: number
  requests: number
  remaining: number
  usage: number
  limit: number
  stopped: string | null
}

export interface LeadActivity {
  id: string
  lead_id: string
  type: string
  outcome: string | null
  note: string | null
  activity_date: string
  next_action_date: string | null
  next_action_note: string | null
  created_at: string
}

/**
 * Ayarlar > Lead puanlama. Ağırlığı 0 olan kriter hesaba katılmaz.
 * Sektör / bölge / pazar hedefleri her lead aramasında ayrıca belirlenir (LeadSearch).
 */
export interface LeadScoring {
  w_sector: number
  w_city: number
  w_market: number
  w_exports: number
  target_modes: string[]
  w_mode: number
  min_employees: number
  w_size: number
  w_contact: number
  w_person: number
  w_website: number
}

export interface Settings {
  id: number
  company_name: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  tax_office: string | null
  tax_no: string | null
  bank_info: string | null
  quote_terms_tr: string | null
  quote_terms_en: string | null
  logo_data_url: string | null
  lead_scoring: LeadScoring | null
  lead_config: LeadConfig | null
}

export interface Carrier {
  id: string
  kind: 'sea' | 'air'
  name: string
  code: string | null
}

export interface Location {
  id: string
  kind: 'sea' | 'air'
  code: string
  name: string
  country: string | null
}

export interface ChargeTemplate {
  id: string
  name: string
  name_en: string | null
  mode: 'all' | 'sea' | 'air' | 'road'
  unit: string
  currency: string
  sort: number
}
