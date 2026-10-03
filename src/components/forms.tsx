import { useState, type FormEvent } from 'react'
import { supabase, q } from '../lib/supabase'
import type { Activity, Company, Contact, Opportunity } from '../lib/types'
import { ACTIVITY_TYPES, COMPANY_SOURCES, COMPANY_TYPES, CURRENCIES, MODES, STAGES } from '../lib/constants'
import { clean, numOrNull } from '../lib/format'
import { ErrorBox, Field, Modal, Select } from './ui'
import { CityPicker, CompanyCombo, CountryPicker, MultiTextInput, SectorPicker } from './pickers'

function useSave() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function Footer({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" className="btn-secondary" onClick={onClose}>Vazgeç</button>
      <button className="btn-primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
    </div>
  )
}

// ------------------------------------------------------------------ Firma
export function CompanyForm({ company, defaultType = 'prospect', initialName, onClose, onSaved }: {
  company?: Company | null
  defaultType?: string
  initialName?: string
  onClose: () => void
  onSaved: (c: Company) => void
}) {
  const [f, setF] = useState<Partial<Company>>(
    company ?? { name: initialName ?? '', type: defaultType, country: 'Türkiye', country_code: 'TR', sectors: [], phones: [''], emails: [''] },
  )
  const { busy, error, run } = useSave()
  const set = (k: keyof Company, v: unknown) => setF((p) => ({ ...p, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const emails = (f.emails ?? []).map((x) => x.trim()).filter(Boolean)
    const phones = (f.phones ?? []).map((x) => x.trim()).filter(Boolean)
    if (!f.country_code) return run(async () => { throw new Error('Ülke seçimi zorunlu.') })
    if (!emails.length) return run(async () => { throw new Error('En az bir e-posta adresi zorunlu.') })
    run(async () => {
      const payload = clean({
        name: f.name, type: f.type, sectors: f.sectors ?? [], country: f.country, country_code: f.country_code, city: f.city,
        address: f.address, phones, emails, website: f.website, tax_office: f.tax_office, tax_no: f.tax_no, eori: f.eori,
        source: f.source, notes: f.notes,
      })
      const saved = company
        ? await q<Company>(supabase.from('companies').update(payload).eq('id', company.id).select().single())
        : await q<Company>(supabase.from('companies').insert(payload).select().single())
      onSaved(saved)
    })
  }

  return (
    <Modal open title={company ? 'Firmayı düzenle' : 'Yeni firma'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Firma adı *" className="sm:col-span-2">
            <input className="input" required autoFocus value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Tip"><Select options={COMPANY_TYPES} value={f.type} onChange={(v) => set('type', v)} /></Field>
          <Field label="Kaynak"><Select options={COMPANY_SOURCES} placeholder="-" value={f.source} onChange={(v) => set('source', v)} /></Field>
          <div className="sm:col-span-2">
            <span className="label">Sektör / Ürün grubu</span>
            <SectorPicker value={f.sectors ?? []} onChange={(v) => set('sectors', v)} />
          </div>
          <div>
            <span className="label">Ülke *</span>
            <CountryPicker value={f.country_code ?? null} onChange={(code, c) => setF((p) => ({ ...p, country_code: code, country: c?.name ?? null, city: null }))} />
          </div>
          <div>
            <span className="label">Şehir</span>
            <CityPicker countryCode={f.country_code ?? null} value={f.city ?? null} onChange={(v) => set('city', v)} />
          </div>
          <Field label="Adres" className="sm:col-span-2"><textarea className="input" rows={2} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <div>
            <span className="label">E-posta *</span>
            <MultiTextInput type="email" requiredFirst values={f.emails ?? []} onChange={(v) => set('emails', v)} addLabel="E-posta ekle" />
          </div>
          <div>
            <span className="label">Telefon</span>
            <MultiTextInput type="tel" values={f.phones ?? []} onChange={(v) => set('phones', v)} addLabel="Telefon ekle" />
          </div>
          <Field label="Web sitesi"><input className="input" value={f.website ?? ''} onChange={(e) => set('website', e.target.value)} /></Field>
          <Field label="Vergi dairesi"><input className="input" value={f.tax_office ?? ''} onChange={(e) => set('tax_office', e.target.value)} /></Field>
          <Field label="Vergi no"><input className="input" value={f.tax_no ?? ''} onChange={(e) => set('tax_no', e.target.value)} /></Field>
          <Field label="EORI no"><input className="input" placeholder="ör. TR1234567890" value={f.eori ?? ''} onChange={(e) => set('eori', e.target.value.toUpperCase())} /></Field>
          <Field label="Notlar" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <Footer busy={busy} onClose={onClose} />
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ Kişi
export function ContactForm({ contact, companyId, onClose, onSaved }: {
  contact?: Contact | null
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<Partial<Contact>>(contact ?? { is_primary: false })
  const { busy, error, run } = useSave()
  const set = (k: keyof Contact, v: unknown) => setF((p) => ({ ...p, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      const payload = clean({
        company_id: companyId, full_name: f.full_name, title: f.title, email: f.email, phone: f.phone,
        mobile: f.mobile, is_primary: f.is_primary ?? false, notes: f.notes,
      })
      if (contact) await q(supabase.from('contacts').update(payload).eq('id', contact.id))
      else await q(supabase.from('contacts').insert(payload))
      onSaved()
    })
  }

  return (
    <Modal open title={contact ? 'Kişiyi düzenle' : 'Yeni kişi'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ad soyad *" className="sm:col-span-2"><input className="input" required autoFocus value={f.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} /></Field>
          <Field label="Ünvan / Departman" className="sm:col-span-2"><input className="input" value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="E-posta" className="sm:col-span-2"><input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Telefon"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Cep"><input className="input" value={f.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} /></Field>
          <Field label="Notlar" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.is_primary ?? false} onChange={(e) => set('is_primary', e.target.checked)} /> Ana irtibat kişisi
          </label>
        </div>
        <Footer busy={busy} onClose={onClose} />
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ Aktivite
export function ActivityForm({ companyId, opportunityId, contacts = [], onClose, onSaved }: {
  companyId: string | null
  opportunityId?: string | null
  contacts?: Contact[]
  onClose: () => void
  onSaved: () => void
}) {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const [f, setF] = useState<Partial<Activity>>({ type: 'call', activity_date: local })
  const { busy, error, run } = useSave()
  const set = (k: keyof Activity, v: unknown) => setF((p) => ({ ...p, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      await q(supabase.from('activities').insert(clean({
        company_id: companyId, opportunity_id: opportunityId ?? null, contact_id: f.contact_id,
        type: f.type, subject: f.subject, body: f.body,
        activity_date: f.activity_date ? new Date(f.activity_date).toISOString() : new Date().toISOString(),
      })))
      onSaved()
    })
  }

  return (
    <Modal open title="Aktivite ekle" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tip"><Select options={ACTIVITY_TYPES} value={f.type} onChange={(v) => set('type', v)} /></Field>
          <Field label="Tarih"><input className="input" type="datetime-local" value={f.activity_date ?? ''} onChange={(e) => set('activity_date', e.target.value)} /></Field>
          {contacts.length > 0 && (
            <Field label="Kişi" className="sm:col-span-2">
              <Select options={contacts.map((c) => ({ value: c.id, label: c.full_name }))} placeholder="-" value={f.contact_id} onChange={(v) => set('contact_id', v)} />
            </Field>
          )}
          <Field label="Konu *" className="sm:col-span-2"><input className="input" required autoFocus value={f.subject ?? ''} onChange={(e) => set('subject', e.target.value)} /></Field>
          <Field label="Detay" className="sm:col-span-2"><textarea className="input" rows={4} value={f.body ?? ''} onChange={(e) => set('body', e.target.value)} /></Field>
        </div>
        <Footer busy={busy} onClose={onClose} />
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ Fırsat
export function OpportunityForm({ opportunity, companyId, onClose, onSaved }: {
  opportunity?: Opportunity | null
  companyId?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<Partial<Opportunity>>(opportunity ?? { stage: 'lead', currency: 'USD', company_id: companyId ?? null, mode: 'sea_fcl' })
  const { busy, error, run } = useSave()
  const set = (k: keyof Opportunity, v: unknown) => setF((p) => ({ ...p, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.company_id) return
    run(async () => {
      const payload = clean({
        title: f.title, company_id: f.company_id, stage: f.stage, mode: f.mode, origin: f.origin,
        destination: f.destination, volume_note: f.volume_note, est_value: numOrNull(f.est_value),
        currency: f.currency, expected_close: f.expected_close, lost_reason: f.stage === 'lost' ? f.lost_reason : null,
        notes: f.notes,
      })
      if (opportunity) await q(supabase.from('opportunities').update(payload).eq('id', opportunity.id))
      else await q(supabase.from('opportunities').insert({ ...payload, sort: Date.now() }))
      onSaved()
    })
  }

  return (
    <Modal open title={opportunity ? 'Fırsatı düzenle' : 'Yeni fırsat'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Başlık *" className="sm:col-span-2">
            <input className="input" required autoFocus placeholder="ör. Mersin → Hamburg aylık 4x40HC" value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Firma *" className="sm:col-span-2">
            <CompanyCombo value={f.company_id ?? null} onChange={(id) => set('company_id', id)} defaultType="prospect" />
          </Field>
          <Field label="Aşama"><Select options={STAGES} value={f.stage} onChange={(v) => set('stage', v)} /></Field>
          <Field label="Taşıma modu"><Select options={MODES} placeholder="-" value={f.mode} onChange={(v) => set('mode', v || null)} /></Field>
          <Field label="Çıkış"><input className="input" value={f.origin ?? ''} onChange={(e) => set('origin', e.target.value)} /></Field>
          <Field label="Varış"><input className="input" value={f.destination ?? ''} onChange={(e) => set('destination', e.target.value)} /></Field>
          <Field label="Hacim / Sıklık" className="sm:col-span-2">
            <input className="input" placeholder="ör. Ayda 4 x 40HC, haftalık 500 kg" value={f.volume_note ?? ''} onChange={(e) => set('volume_note', e.target.value)} />
          </Field>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Field label="Tahmini değer"><input className="input" type="number" step="any" value={f.est_value ?? ''} onChange={(e) => set('est_value', e.target.value)} /></Field>
            <Field label="Döviz"><Select options={CURRENCIES} value={f.currency} onChange={(v) => set('currency', v)} /></Field>
          </div>
          <Field label="Tahmini kapanış"><input className="input" type="date" value={f.expected_close ?? ''} onChange={(e) => set('expected_close', e.target.value)} /></Field>
          {f.stage === 'lost' && (
            <Field label="Kaybedilme nedeni" className="sm:col-span-2"><input className="input" value={f.lost_reason ?? ''} onChange={(e) => set('lost_reason', e.target.value)} /></Field>
          )}
          <Field label="Notlar" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        {!f.company_id && <p className="mt-2 text-xs text-amber-700">Firma seçimi zorunlu.</p>}
        <Footer busy={busy} onClose={onClose} />
      </form>
    </Modal>
  )
}
