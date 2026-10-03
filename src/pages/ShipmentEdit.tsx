import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Ban, Check, CheckCircle2, FileText, Paperclip, Plane, Save, Ship, Trash2, Truck, Upload } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { CargoFields, ChargeLine, Shipment, ShipmentDocument } from '../lib/types'
import { DIRECTIONS, INCOTERMS, MODES, SHIPMENT_FLOW, SHIPMENT_STATUSES, label, modeGroup } from '../lib/constants'
import { clean, fmtDate, fmtDateTime } from '../lib/format'
import { Badge, ErrorBox, Field, PageHeader, Section, Select, Spinner } from '../components/ui'
import { CargoEditor, ChargeEditor, ContainerEditor } from '../components/inputs'
import { CarrierPicker, CompanyCombo, PortPicker, RoadPlacePicker } from '../components/pickers'

const FIELDS: (keyof Shipment)[] = [
  'quote_id', 'company_id', 'status', 'mode', 'direction', 'incoterm', 'shipper_id', 'consignee_id', 'notify_id',
  'agent_id', 'carrier', 'booking_no', 'mbl_no', 'hbl_no', 'mawb_no', 'hawb_no', 'vessel', 'voyage', 'flight_no',
  'pol', 'pod', 'pickup_address', 'delivery_address', 'etd', 'eta', 'atd', 'ata', 'commodity', 'packages',
  'gross_weight', 'volume_cbm', 'chargeable_weight', 'dimensions', 'cargo_type', 'dg_un_no', 'dg_class', 'stackable',
  'road_load', 'vehicle_type', 'containers', 'cmr_no', 'truck_plate', 'trailer_plate', 'driver_name', 'driver_phone',
  'border_gate', 'notes',
]
const FLOW = SHIPMENT_STATUSES.filter((s) => SHIPMENT_FLOW.includes(s.value))
const GROUP_ICON = { sea: Ship, air: Plane, road: Truck }
const GROUP_LABEL = { sea: 'Deniz', air: 'Hava', road: 'Karayolu' }

export default function ShipmentEdit() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'yeni'
  const [params] = useSearchParams()
  const newMode = params.get('mode')
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [f, setF] = useState<Partial<Shipment> | null>(null)
  const [charges, setCharges] = useState<ChargeLine[]>([])
  const [docs, setDocs] = useState<ShipmentDocument[]>([])
  const [quoteNo, setQuoteNo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof Shipment>(k: K, v: Shipment[K] | null) => { setF((p) => ({ ...p, [k]: v })); setSaved(false) }
  const patch = (p: Partial<Shipment> | Partial<CargoFields>) => { setF((x) => ({ ...x, ...p })); setSaved(false) }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (isNew) {
          setF({ status: 'booking', mode: (newMode ?? 'sea_fcl') as Shipment['mode'], direction: 'export', containers: [], dimensions: [], cargo_type: 'GEN', stackable: true })
          setCharges([])
          setDocs([])
          return
        }
        const [s, c, d] = await Promise.all([
          q<Shipment & { quotes: { quote_no: string } | null }>(supabase.from('shipments').select('*, quotes(quote_no)').eq('id', id!).single()),
          q<ChargeLine[]>(supabase.from('shipment_charges').select('*').eq('shipment_id', id!).order('sort')),
          q<ShipmentDocument[]>(supabase.from('shipment_documents').select('*').eq('shipment_id', id!).order('created_at')),
        ])
        if (cancelled) return
        const { quotes, ...rest } = s
        setQuoteNo(quotes?.quote_no ?? null)
        setF(rest)
        setCharges(c)
        setDocs(d)
      } catch (e) {
        setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [id, isNew, newMode])

  if (isNew && !newMode) return <Navigate to="/sevkiyatlar" replace />
  if (!f) return error ? <ErrorBox error={error} /> : <Spinner />

  async function save(overrides: Partial<Shipment> = {}) {
    const cur = { ...f!, ...overrides }
    if (!cur.company_id) { setError('Müşteri seçimi zorunlu.'); return }
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const k of FIELDS) payload[k] = cur[k] ?? null
      const cleaned = clean(payload)
      const s = isNew
        ? await q<Shipment>(supabase.from('shipments').insert(cleaned).select().single())
        : await q<Shipment>(supabase.from('shipments').update(cleaned).eq('id', id!).select().single())
      await q(supabase.from('shipment_charges').delete().eq('shipment_id', s.id))
      if (charges.length) {
        await q(supabase.from('shipment_charges').insert(charges.map((l, i) => ({
          shipment_id: s.id, description: l.description || '-', unit: l.unit, qty: l.qty || 0,
          buy_price: l.buy_price || 0, sell_price: l.sell_price || 0, currency: l.currency, sort: i,
        }))))
      }
      setF(s)
      setSaved(true)
      if (isNew) nav(`/sevkiyatlar/${s.id}`, { replace: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function setStatus(status: string) {
    if (status === 'cancelled' && !confirm('Dosya iptal edilsin mi?')) return
    set('status', status)
    if (!isNew) save({ status })
  }

  async function upload(files: FileList | null) {
    if (!files?.length || isNew) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        const safe = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_')
        const path = `${id}/${Date.now()}_${safe}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
        if (upErr) throw new Error(upErr.message)
        const doc = await q<ShipmentDocument>(supabase.from('shipment_documents')
          .insert({ shipment_id: id, name: file.name, path, size: file.size }).select().single())
        setDocs((d) => [...d, doc])
      }
    } catch (e) {
      setError('Yükleme hatası: ' + (e as Error).message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function openDoc(d: ShipmentDocument) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(d.path, 60)
    if (error) return setError(error.message)
    window.open(data.signedUrl, '_blank')
  }

  async function deleteDoc(d: ShipmentDocument) {
    if (!confirm(`${d.name} silinsin mi?`)) return
    await supabase.storage.from('documents').remove([d.path])
    await q(supabase.from('shipment_documents').delete().eq('id', d.id))
    setDocs((x) => x.filter((y) => y.id !== d.id))
  }

  async function remove() {
    if (!confirm('Sevkiyat dosyası silinsin mi? Ekli dokümanlar da silinir.')) return
    try {
      if (docs.length) await supabase.storage.from('documents').remove(docs.map((d) => d.path))
      await q(supabase.from('shipments').delete().eq('id', id!))
      nav(`/sevkiyatlar?tur=${group}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const group = modeGroup(f.mode)
  const GroupIcon = GROUP_ICON[group]
  const stepIdx = f.status === 'closed' ? FLOW.length : FLOW.findIndex((s) => s.value === f.status)
  const cancelled = f.status === 'cancelled'

  const text = (k: keyof Shipment, lbl: string, placeholder?: string) => (
    <Field label={lbl}>
      <input className="input" placeholder={placeholder} value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  )
  const dateField = (k: 'etd' | 'eta' | 'atd' | 'ata', lbl: string) => (
    <Field label={lbl}><input className="input" type="date" value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></Field>
  )

  return (
    <>
      <Link to={`/sevkiyatlar?tur=${group}`} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {GROUP_LABEL[group]} dosyaları
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GroupIcon className="h-5 w-5 text-brand-600" />
            {isNew ? `Yeni ${GROUP_LABEL[group].toLocaleLowerCase('tr')} dosyası` : f.job_no}
            {!isNew && <Badge list={SHIPMENT_STATUSES} value={f.status} />}
          </span>
        }
        subtitle={!isNew ? (
          <>
            {quoteNo && <>Teklif: <Link className="text-brand-600 hover:underline" to={`/teklifler/${f.quote_id}`}>{quoteNo}</Link> · </>}
            Son güncelleme: {fmtDateTime(f.updated_at)}
          </>
        ) : undefined}
        actions={
          <>
            {saved && <span className="text-sm text-emerald-600">Kaydedildi ✓</span>}
            <button className="btn-primary" disabled={busy} onClick={() => save()}><Save className="h-4 w-4" /> Kaydet</button>
            {!isNew && <button className="btn-danger" onClick={remove} title="Sil"><Trash2 className="h-4 w-4" /></button>}
          </>
        }
      />
      <ErrorBox error={error} />

      {/* Durum adımları + Kapandı / İptal */}
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className={`flex min-w-[720px] items-center ${cancelled ? 'opacity-40' : ''}`}>
            {FLOW.map((s, i) => {
              const done = !cancelled && i <= stepIdx
              return (
                <div key={s.value} className="flex flex-1 items-center">
                  <button className="flex flex-col items-center gap-1 text-xs" title="Bu duruma getir" onClick={() => setStatus(s.value)} disabled={busy}>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${done ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-surface text-slate-400'}`}>
                      {done ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className={`whitespace-nowrap ${done ? 'font-medium text-slate-800' : 'text-slate-500'}`}>{s.label}</span>
                  </button>
                  {i < FLOW.length - 1 && <div className={`mx-1 h-0.5 flex-1 ${!cancelled && i < stepIdx ? 'bg-brand-600' : 'bg-slate-200'}`} />}
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => setStatus('closed')}
            className={`btn ${f.status === 'closed' ? 'bg-emerald-600 text-white ring-2 ring-emerald-300' : 'bg-emerald-600/90 text-white hover:bg-emerald-700'}`}>
            <CheckCircle2 className="h-4 w-4" /> Kapandı
          </button>
          <button disabled={busy} onClick={() => setStatus('cancelled')}
            className={`btn ${cancelled ? 'bg-red-600 text-white ring-2 ring-red-300' : 'bg-red-600/90 text-white hover:bg-red-700'}`}>
            <Ban className="h-4 w-4" /> İptal
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <Section title="Genel">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Müşteri *" className="sm:col-span-2"><CompanyCombo value={f.company_id ?? null} defaultType="customer" onChange={(v) => set('company_id', v)} /></Field>
            <Field label="Taşıma modu">
              {group === 'sea'
                ? <Select options={MODES.filter((m) => modeGroup(m.value) === 'sea')} value={f.mode} onChange={(v) => set('mode', v as Shipment['mode'])} />
                : <input className="input" disabled value={label(MODES, f.mode)} />}
            </Field>
            <Field label="Yön"><Select options={DIRECTIONS} value={f.direction} onChange={(v) => set('direction', v as Shipment['direction'])} /></Field>
            <Field label="Incoterms"><Select options={INCOTERMS} placeholder="-" value={f.incoterm} onChange={(v) => set('incoterm', v)} /></Field>
            <Field label={group === 'air' ? 'Havayolu' : group === 'road' ? 'Nakliye firması' : 'Armatör'}>
              {group === 'road'
                ? <input className="input" value={f.carrier ?? ''} onChange={(e) => set('carrier', e.target.value)} />
                : <CarrierPicker kind={group} value={f.carrier ?? null} onChange={(v) => set('carrier', v)} />}
            </Field>
            <Field label="Yurt dışı acente" className="sm:col-span-2">
              <CompanyCombo types={['agent']} defaultType="agent" placeholder="Acente ara…" value={f.agent_id ?? null} onChange={(v) => set('agent_id', v)} />
            </Field>
          </div>
        </Section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="Taraflar">
            <div className="space-y-3">
              <Field label="Shipper (Gönderici)"><CompanyCombo value={f.shipper_id ?? null} defaultType="customer" onChange={(v) => set('shipper_id', v)} /></Field>
              <Field label="Consignee (Alıcı)"><CompanyCombo value={f.consignee_id ?? null} defaultType="customer" onChange={(v) => set('consignee_id', v)} /></Field>
              <Field label="Notify party"><CompanyCombo value={f.notify_id ?? null} defaultType="customer" onChange={(v) => set('notify_id', v)} /></Field>
            </div>
          </Section>

          <Section title="Taşıma bilgileri" className="lg:col-span-2">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group === 'sea' && (
                  <>
                    {text('booking_no', 'Booking no')}
                    {text('mbl_no', 'MBL no')}
                    {text('hbl_no', 'HBL no')}
                    {text('vessel', 'Gemi')}
                    {text('voyage', 'Sefer (Voyage)')}
                  </>
                )}
                {group === 'air' && (
                  <>
                    {text('booking_no', 'Booking no')}
                    {text('mawb_no', 'MAWB no', 'ör. 235-12345678')}
                    {text('hawb_no', 'HAWB no')}
                    {text('flight_no', 'Uçuş no', 'ör. TK6543')}
                  </>
                )}
                {group === 'road' && (
                  <>
                    {text('cmr_no', 'CMR no')}
                    {text('truck_plate', 'Çekici plakası')}
                    {text('trailer_plate', 'Dorse plakası')}
                    {text('driver_name', 'Şoför adı')}
                    {text('driver_phone', 'Şoför telefonu')}
                    {text('border_gate', 'Gümrük / sınır kapısı', 'ör. Kapıkule')}
                  </>
                )}
              </div>

              <div className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
                <Field label={group === 'air' ? 'Kalkış havalimanı' : group === 'road' ? 'Yükleme yeri (ülke / şehir)' : 'Yükleme limanı (POL)'}>
                  {group === 'road'
                    ? <RoadPlacePicker value={f.pol ?? null} onChange={(v) => set('pol', v)} />
                    : <PortPicker kind={group} value={f.pol ?? null} onChange={(v) => set('pol', v)} />}
                </Field>
                <Field label={group === 'air' ? 'Varış havalimanı' : group === 'road' ? 'Teslim yeri (ülke / şehir)' : 'Varış limanı (POD)'}>
                  {group === 'road'
                    ? <RoadPlacePicker value={f.pod ?? null} onChange={(v) => set('pod', v)} />
                    : <PortPicker kind={group} value={f.pod ?? null} onChange={(v) => set('pod', v)} />}
                </Field>
                {text('pickup_address', 'Yükleme adresi')}
                {text('delivery_address', 'Teslim adresi')}
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 lg:grid-cols-4">
                {dateField('etd', group === 'road' ? 'Planlanan yükleme' : 'ETD (tahmini kalkış)')}
                {dateField('eta', group === 'road' ? 'Tahmini varış' : 'ETA (tahmini varış)')}
                {dateField('atd', group === 'road' ? 'Gerçek yükleme' : 'ATD (gerçek kalkış)')}
                {dateField('ata', group === 'road' ? 'Gerçek varış' : 'ATA (gerçek varış)')}
              </div>
            </div>
          </Section>
        </div>

        <Section title="Yük">
          {f.mode === 'sea_fcl' && (
            <div className="mb-4">
              <span className="label">Konteynerler</span>
              <ContainerEditor withNumbers value={f.containers ?? []} onChange={(v) => set('containers', v)} />
            </div>
          )}
          <CargoEditor key={f.id ?? 'new'} value={f} mode={f.mode ?? 'sea_fcl'} onChange={patch} />
        </Section>

        <Section title="Masraflar ve karlılık">
          <ChargeEditor lines={charges} onChange={(l) => { setCharges(l); setSaved(false) }} mode={f.mode ?? 'sea_fcl'} />
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Dokümanlar" actions={!isNew && (
            <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Yükle
            </button>
          )}>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
            {isNew ? <p className="text-sm text-slate-400">Doküman yüklemek için önce dosyayı kaydedin.</p>
              : docs.length === 0 ? <p className="text-sm text-slate-400">{group === 'air' ? 'AWB' : group === 'road' ? 'CMR' : 'BL'}, fatura, çeki listesi vb. ekleyin.</p>
              : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {docs.map((d) => (
                    <li key={d.id} className="group flex items-center justify-between py-2">
                      <button className="flex items-center gap-2 text-left hover:text-brand-600" onClick={() => openDoc(d)}>
                        <FileText className="h-4 w-4 text-slate-400" /> {d.name}
                        <span className="text-xs text-slate-400">{fmtDate(d.created_at)}{d.size ? ` · ${Math.ceil(d.size / 1024)} KB` : ''}</span>
                      </button>
                      <button className="btn-ghost p-1 text-red-500 opacity-0 group-hover:opacity-100" onClick={() => deleteDoc(d)}><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            {!isNew && (
              <div
                className="mt-3 flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-200 p-4 text-xs text-slate-400"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files) }}
              >
                <Paperclip className="h-4 w-4" /> Dosyaları buraya sürükleyin
              </div>
            )}
          </Section>
          <Section title="Notlar">
            <textarea className="input" rows={6} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </Section>
        </div>
      </div>
    </>
  )
}
