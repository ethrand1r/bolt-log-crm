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
