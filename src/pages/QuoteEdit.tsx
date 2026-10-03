import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Copy, Download, Eye, Mail, Save, Ship, Trash2 } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { CargoFields, ChargeLine, Company, Contact, Quote, Shipment } from '../lib/types'
import { DIRECTIONS, INCOTERMS, MODES, QUOTE_STATUSES, modeGroup } from '../lib/constants'
import { addDaysISO, clean, fmtDateTime } from '../lib/format'
import { getChargeTemplates, getSettings } from '../lib/refdata'
import { buildQuotePdf } from '../lib/quotePdf'
import { buildQuoteMail } from '../lib/quoteMail'
import { Badge, ErrorBox, Field, PageHeader, Section, Select, Spinner } from '../components/ui'
import { CargoEditor, ChargeEditor, ContainerEditor } from '../components/inputs'
import { CarrierPicker, CompanyCombo, PortPicker, RoadPlacePicker } from '../components/pickers'
import { MailTemplateModal } from '../components/MailTemplateModal'

type Form = Partial<Quote>

const QUOTE_FIELDS: (keyof Quote)[] = [
  'company_id', 'contact_id', 'opportunity_id', 'status', 'language', 'mode', 'direction', 'incoterm', 'pol', 'pod',
  'pickup_address', 'delivery_address', 'commodity', 'containers', 'packages', 'gross_weight', 'volume_cbm',
  'chargeable_weight', 'ldm', 'dimensions', 'cargo_type', 'dg_un_no', 'dg_class', 'stackable', 'road_load', 'vehicle_type',
  'carrier', 'transit_time', 'frequency', 'valid_until', 'notes', 'terms',
]

const itemRows = (quoteId: string, items: ChargeLine[]) => items.map((l, i) => ({
  quote_id: quoteId, description: l.description || '-', unit: l.unit, qty: l.qty || 0,
  buy_price: l.buy_price || 0, sell_price: l.sell_price || 0, currency: l.currency, sort: i,
}))

export default function QuoteEdit() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'yeni'
  const [params] = useSearchParams()
  const nav = useNavigate()

  const [f, setF] = useState<Form | null>(null)
  const [items, setItems] = useState<ChargeLine[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [shipment, setShipment] = useState<Pick<Shipment, 'id' | 'job_no'> | null>(null)
  const [mail, setMail] = useState<ReturnType<typeof buildQuoteMail> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof Quote>(k: K, v: Quote[K] | null) => { setF((p) => ({ ...p, [k]: v })); setSaved(false) }
  const patch = (p: Partial<Quote> | Partial<CargoFields>) => { setF((x) => ({ ...x, ...p })); setSaved(false) }

  // Yükleme
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (isNew) {
          setF({
            status: 'draft', language: 'tr', mode: 'sea_fcl', direction: 'export', incoterm: 'FOB',
            containers: [{ type: '40HC', qty: 1 }], dimensions: [], cargo_type: 'GEN', stackable: true,
            valid_until: addDaysISO(14), company_id: params.get('company'), opportunity_id: params.get('opportunity'),
          })
          setItems([])
          setShipment(null)
        } else {
          const [quote, lines, ship] = await Promise.all([
            q<Quote>(supabase.from('quotes').select('*').eq('id', id!).single()),
            q<ChargeLine[]>(supabase.from('quote_items').select('*').eq('quote_id', id!).order('sort')),
            q<Pick<Shipment, 'id' | 'job_no'>[]>(supabase.from('shipments').select('id,job_no').eq('quote_id', id!).limit(1)),
          ])
          if (cancelled) return
          setF(quote)
          setItems(lines)
          setShipment(ship[0] ?? null)
        }
      } catch (e) {
        setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [id, isNew, params])

  // Firma değişince kişileri getir
  useEffect(() => {
    if (!f?.company_id) { setContacts([]); return }
    q<Contact[]>(supabase.from('contacts').select('*').eq('company_id', f.company_id).order('is_primary', { ascending: false }))
      .then(setContacts).catch(() => setContacts([]))
  }, [f?.company_id])

  if (!f) return error ? <ErrorBox error={error} /> : <Spinner />

  function changeMode(mode: Quote['mode']) {
    const sameGroup = modeGroup(mode) === modeGroup(f!.mode)
    // Mod grubu değişirse rota ve taşıyıcı sıfırlanır (deniz limanı ↔ havalimanı ↔ şehir)
    patch(sameGroup ? { mode } : { mode, pol: null, pod: null, carrier: null })
  }

  async function save(overrides: Partial<Quote> = {}): Promise<Quote | null> {
    const cur = { ...f!, ...overrides }
    if (!cur.company_id) { setError('Firma seçimi zorunlu.'); return null }
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const k of QUOTE_FIELDS) payload[k] = cur[k] ?? null
      const cleaned = clean(payload)
      const quote = isNew
        ? await q<Quote>(supabase.from('quotes').insert(cleaned).select().single())
        : await q<Quote>(supabase.from('quotes').update(cleaned).eq('id', id!).select().single())

      await q(supabase.from('quote_items').delete().eq('quote_id', quote.id))
      if (items.length) await q(supabase.from('quote_items').insert(itemRows(quote.id, items)))
      await syncOpportunity(quote)
      setF(quote)
      setSaved(true)
      if (isNew) nav(`/teklifler/${quote.id}`, { replace: true })
      return quote
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }

  /** Teklif durumuna göre bağlı fırsatın aşamasını ilerletir. */
  async function syncOpportunity(quote: Quote) {
    if (!quote.opportunity_id) return
    const stage = quote.status === 'accepted' ? 'won' : quote.status === 'sent' ? 'quoted' : null
    if (!stage) return
    const filter = stage === 'quoted' ? ['lead', 'contacted'] : ['lead', 'contacted', 'quoted', 'negotiation']
    await q(supabase.from('opportunities').update({ stage, sort: Date.now() }).eq('id', quote.opportunity_id).in('stage', filter))
  }

  async function pdf(open: boolean) {
    const quote = await save()
    if (!quote) return
    try {
      const [settings, templates, company] = await Promise.all([
        getSettings(),
        getChargeTemplates(),
        q<Company>(supabase.from('companies').select('*').eq('id', quote.company_id!).single()),
      ])
      const contact = contacts.find((c) => c.id === quote.contact_id) ?? null
      const doc = await buildQuotePdf({ quote, items, company, contact, settings, templates })
      if (open) doc.open()
      else doc.download(`${quote.quote_no}_${company.name.replace(/[^\p{L}\p{N}]+/gu, '_')}.pdf`)
    } catch (e) {
      setError('PDF oluşturulamadı: ' + (e as Error).message)
    }
  }

  async function openMail() {
    const quote = await save()
    if (!quote) return
    try {
      const [settings, templates] = await Promise.all([getSettings(), getChargeTemplates()])
      const contact = contacts.find((c) => c.id === quote.contact_id) ?? null
      setMail(buildQuoteMail({ quote, items, contact, settings, templates }))
    } catch (e) {
      setError('Şablon oluşturulamadı: ' + (e as Error).message)
    }
  }

  async function duplicate() {
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {}
      for (const k of QUOTE_FIELDS) payload[k] = f![k] ?? null
      const copy = await q<Quote>(supabase.from('quotes')
        .insert(clean({ ...payload, status: 'draft', valid_until: addDaysISO(14) })).select().single())
      if (items.length) await q(supabase.from('quote_items').insert(itemRows(copy.id, items)))
      nav(`/teklifler/${copy.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toShipment() {
    if (!confirm('Teklif "Kabul Edildi" olarak işaretlenip yeni bir sevkiyat dosyası açılacak. Devam edilsin mi?')) return
    const quote = await save({ status: 'accepted' })
    if (!quote) return
    setBusy(true)
    try {
      const ship = await q<Shipment>(supabase.from('shipments').insert(clean({
        quote_id: quote.id, company_id: quote.company_id, mode: quote.mode, direction: quote.direction,
        incoterm: quote.incoterm, pol: quote.pol, pod: quote.pod, pickup_address: quote.pickup_address,
        delivery_address: quote.delivery_address, carrier: quote.carrier, commodity: quote.commodity,
        packages: quote.packages, gross_weight: quote.gross_weight, volume_cbm: quote.volume_cbm,
        chargeable_weight: quote.chargeable_weight, ldm: quote.ldm, dimensions: quote.dimensions ?? [], cargo_type: quote.cargo_type,
        dg_un_no: quote.dg_un_no, dg_class: quote.dg_class, stackable: quote.stackable,
        road_load: quote.road_load, vehicle_type: quote.vehicle_type,
        containers: quote.mode === 'sea_fcl'
          ? (quote.containers ?? []).flatMap((c) => Array.from({ length: c.qty ?? 1 }, () => ({ type: c.type })))
          : [],
        // Müşteri ihracatta gönderici, ithalatta alıcıdır
        shipper_id: quote.direction === 'export' ? quote.company_id : null,
        consignee_id: quote.direction === 'import' ? quote.company_id : null,
      })).select().single())
      if (items.length) {
        await q(supabase.from('shipment_charges').insert(items.map((l, i) => ({
          shipment_id: ship.id, description: l.description, unit: l.unit, qty: l.qty, buy_price: l.buy_price,
          sell_price: l.sell_price, currency: l.currency, sort: i,
        }))))
      }
      nav(`/sevkiyatlar/${ship.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Teklif silinsin mi?')) return
    try {
      await q(supabase.from('quotes').delete().eq('id', id!))
      nav('/teklifler')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const group = modeGroup(f.mode)
  const routeLabels = group === 'air'
    ? ['Kalkış havalimanı', 'Varış havalimanı']
    : group === 'road' ? ['Yükleme yeri', 'Teslim yeri'] : ['Yükleme limanı (POL)', 'Varış limanı (POD)']

  return (
    <>
      <Link to="/teklifler" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Teklifler
      </Link>
      <PageHeader
        title={<span className="flex items-center gap-2">{isNew ? 'Yeni teklif' : f.quote_no} {!isNew && <Badge list={QUOTE_STATUSES} value={f.status} />}</span>}
        subtitle={!isNew && f.updated_at ? `Son güncelleme: ${fmtDateTime(f.updated_at)}` : undefined}
        actions={
          <>
            {saved && <span className="text-sm text-emerald-600">Kaydedildi ✓</span>}
            <button className="btn-primary" disabled={busy} onClick={() => save()}><Save className="h-4 w-4" /> Kaydet</button>
            {!isNew && (
              <>
                <button className="btn-secondary" disabled={busy} onClick={() => pdf(true)}><Eye className="h-4 w-4" /> Önizle</button>
                <button className="btn-secondary" disabled={busy} onClick={() => pdf(false)}><Download className="h-4 w-4" /> PDF</button>
                <button className="btn-secondary" disabled={busy} onClick={openMail}><Mail className="h-4 w-4" /> E-posta şablonu</button>
                {shipment ? (
                  <Link className="btn-secondary" to={`/sevkiyatlar/${shipment.id}`}><Ship className="h-4 w-4" /> {shipment.job_no}</Link>
                ) : (
                  <button className="btn-secondary" disabled={busy} onClick={toShipment}><Ship className="h-4 w-4" /> Sevkiyata dönüştür</button>
                )}
                <button className="btn-ghost" disabled={busy} onClick={duplicate} title="Kopyala"><Copy className="h-4 w-4" /></button>
                <button className="btn-danger" onClick={remove} title="Sil"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </>
        }
      />
      {isNew && <p className="-mt-3 mb-4 text-sm text-slate-500">Kaydettikten sonra önizleme, PDF ve e-posta şablonu kullanılabilir.</p>}
      <ErrorBox error={error} />

      <div className="space-y-4">
        <Section title="Genel">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Firma *" className="sm:col-span-2">
              <CompanyCombo value={f.company_id ?? null} defaultType="prospect"
                onChange={(v) => patch({ company_id: v, contact_id: null })} />
            </Field>
            <Field label="İlgili kişi">
              <Select options={contacts.map((c) => ({ value: c.id, label: c.full_name }))} placeholder="-" value={f.contact_id} onChange={(v) => set('contact_id', v || null)} />
            </Field>
            <Field label="Durum"><Select options={QUOTE_STATUSES} value={f.status} onChange={(v) => set('status', v)} /></Field>
            <Field label="Taşıma modu"><Select options={MODES} value={f.mode} onChange={(v) => changeMode(v as Quote['mode'])} /></Field>
            <Field label="Yön"><Select options={DIRECTIONS} value={f.direction} onChange={(v) => set('direction', v as Quote['direction'])} /></Field>
            <Field label="Incoterms"><Select options={INCOTERMS} placeholder="-" value={f.incoterm} onChange={(v) => set('incoterm', v)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Geçerlilik"><input className="input" type="date" value={f.valid_until ?? ''} onChange={(e) => set('valid_until', e.target.value)} /></Field>
              <Field label="PDF / e-posta dili">
                <Select options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]} value={f.language} onChange={(v) => set('language', v as 'tr' | 'en')} />
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Rota ve taşıyıcı">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={routeLabels[0]}>
              {group === 'road'
                ? <RoadPlacePicker value={f.pol ?? null} onChange={(v) => set('pol', v)} />
                : <PortPicker kind={group} value={f.pol ?? null} onChange={(v) => set('pol', v)} />}
            </Field>
            <Field label={routeLabels[1]}>
              {group === 'road'
                ? <RoadPlacePicker value={f.pod ?? null} onChange={(v) => set('pod', v)} />
                : <PortPicker kind={group} value={f.pod ?? null} onChange={(v) => set('pod', v)} />}
            </Field>
            <Field label="Yükleme adresi (opsiyonel)"><input className="input" value={f.pickup_address ?? ''} onChange={(e) => set('pickup_address', e.target.value)} /></Field>
            <Field label="Teslim adresi (opsiyonel)"><input className="input" value={f.delivery_address ?? ''} onChange={(e) => set('delivery_address', e.target.value)} /></Field>
            <Field label={group === 'air' ? 'Havayolu' : group === 'road' ? 'Nakliye firması' : 'Armatör'}>
              {group === 'road'
                ? <input className="input" value={f.carrier ?? ''} onChange={(e) => set('carrier', e.target.value)} />
                : <CarrierPicker kind={group} value={f.carrier ?? null} onChange={(v) => set('carrier', v)} />}
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Transit süre"><input className="input" placeholder="ör. 12-14 gün" value={f.transit_time ?? ''} onChange={(e) => set('transit_time', e.target.value)} /></Field>
              <Field label="Sıklık"><input className="input" placeholder="ör. Haftalık" value={f.frequency ?? ''} onChange={(e) => set('frequency', e.target.value)} /></Field>
            </div>
          </div>
        </Section>

        <Section title="Yük">
          {f.mode === 'sea_fcl' && (
            <div className="mb-4">
              <span className="label">Konteynerler</span>
              <ContainerEditor value={f.containers ?? []} onChange={(v) => set('containers', v)} />
            </div>
          )}
          <CargoEditor key={f.id ?? 'new'} value={f} mode={f.mode ?? 'sea_fcl'} onChange={patch} />
        </Section>

        <Section title="Ücretler">
          <ChargeEditor lines={items} onChange={(l) => { setItems(l); setSaved(false) }} mode={f.mode ?? 'sea_fcl'} />
          <p className="mt-2 text-xs text-slate-400">PDF'te ve e-postada sadece satış fiyatları görünür. Alış ve kâr bilgileri yalnızca sizin içindir.</p>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Notlar (PDF'te görünür)">
            <textarea className="input" rows={4} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </Section>
          <Section title="Şartlar (boş bırakılırsa Ayarlar'daki varsayılan kullanılır)">
            <textarea className="input" rows={4} value={f.terms ?? ''} onChange={(e) => set('terms', e.target.value)} />
          </Section>
        </div>
      </div>

      {mail && <MailTemplateModal {...mail} onClose={() => setMail(null)} />}
    </>
  )
}
