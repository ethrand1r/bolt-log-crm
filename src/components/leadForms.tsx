import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Lead, LeadActivity, LeadSearch } from '../lib/types'
import { LEAD_ACTIVITY_TYPES, LEAD_DIRECTIONS, LEAD_OUTCOMES, LEAD_SOURCES, LEAD_STATUSES, MODES } from '../lib/constants'
import { clean, numOrNull } from '../lib/format'
import { findDup, getLeadSearches, loadDupIndex } from '../lib/leads'
import { ErrorBox, Field, Modal, Select } from './ui'
import { Footer, useSave } from './forms'
import { CityPicker, CompanyCombo, CountryMultiPicker, CountryPicker, MultiTextInput, SectorPicker } from './pickers'

const cleanList = (v: string[] | null | undefined) => (v ?? []).map((x) => x.trim()).filter(Boolean)

/** Çoklu seçim düğmeleri (taşıma modları vb.) */
export function ToggleChips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button key={o.value} type="button" className={on ? 'btn-primary px-2.5 py-1 text-xs' : 'btn-secondary px-2.5 py-1 text-xs'}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Lead araması seçimi. Arşivlenmiş aramalar sadece seçili değerse listelenir. */
export function SearchSelect({ value, onChange, placeholder = 'Aramaya bağlı değil' }: {
  value: string | null | undefined
  onChange: (id: string | null) => void
  placeholder?: string
}) {
  const [list, setList] = useState<LeadSearch[]>([])
  useEffect(() => { getLeadSearches().then(setList).catch(() => {}) }, [])
  const options = list.filter((s) => s.status === 'active' || s.id === value).map((s) => ({ value: s.id, label: s.name }))
  return <Select options={options} placeholder={placeholder} value={value} onChange={(v) => onChange(v || null)} />
}

// ------------------------------------------------------------------ Lead
export function LeadForm({ lead, defaultSearchId, onClose, onSaved }: {
  lead?: Lead | null
  defaultSearchId?: string | null
  onClose: () => void
  onSaved: (l: Lead) => void
}) {
  const [f, setF] = useState<Partial<Lead>>(
    lead ?? {
      country: 'Türkiye', country_code: 'TR', sectors: [], modes: [], target_markets: [], phones: [''], emails: [''], status: 'new',
      search_id: defaultSearchId ?? null,
    },
  )
  const [dup, setDup] = useState<string | null>(null)
  const { busy, error, run } = useSave()
  const set = (k: keyof Lead, v: unknown) => setF((p) => ({ ...p, [k]: v }))

  // Yeni kayıtta ad / web sitesi girilince mükerrer uyarısı
  const [dupIdx, setDupIdx] = useState<Awaited<ReturnType<typeof loadDupIndex>> | null>(null)
  useEffect(() => { if (!lead) loadDupIndex().then(setDupIdx).catch(() => {}) }, [lead])
  useEffect(() => {
    if (!dupIdx || !f.name?.trim()) return setDup(null)
    setDup(findDup(dupIdx, f.name, f.website))
  }, [dupIdx, f.name, f.website])

  function submit(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      const payload = clean({
        name: f.name?.trim(), sectors: f.sectors ?? [], country: f.country, country_code: f.country_code, city: f.city,
        address: f.address, website: f.website?.trim(), linkedin_url: f.linkedin_url?.trim(),
        phones: cleanList(f.phones), emails: cleanList(f.emails),
        contact_name: f.contact_name, contact_title: f.contact_title, contact_email: f.contact_email, contact_phone: f.contact_phone,
        source: f.source, source_detail: f.source_detail, exports: f.exports ?? null, employees: numOrNull(f.employees),
        modes: f.modes ?? [], direction: f.direction, target_markets: f.target_markets ?? [], est_volume: f.est_volume,
        status: f.status, disqualify_reason: f.status === 'disqualified' ? f.disqualify_reason : null,
        next_action_date: f.next_action_date, next_action_note: f.next_action_note, notes: f.notes, search_id: f.search_id ?? null,
      })
      const saved = lead
        ? await q<Lead>(supabase.from('leads').update(payload).eq('id', lead.id).select().single())
        : await q<Lead>(supabase.from('leads').insert(payload).select().single())
      onSaved(saved)
    })
  }

  const boolVal = f.exports === true ? 'yes' : f.exports === false ? 'no' : ''
  const statusOptions = LEAD_STATUSES.filter((s) => s.value !== 'converted' || lead?.status === 'converted')

  return (
    <Modal open title={lead ? 'Lead’i düzenle' : 'Yeni lead'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        {dup && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Benzer kayıt var. {dup}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Firma adı *" className="sm:col-span-2">
            <input className="input" required autoFocus value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Lead araması" className="sm:col-span-2">
            <SearchSelect value={f.search_id} onChange={(v) => set('search_id', v)} />
          </Field>
          <Field label="Kaynak"><Select options={LEAD_SOURCES} placeholder="-" value={f.source} onChange={(v) => set('source', v)} /></Field>
          <Field label="Kaynak detayı">
            <input className="input" placeholder="ör. Texworld 2026, İTKİB üye listesi" value={f.source_detail ?? ''} onChange={(e) => set('source_detail', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <span className="label">Sektör / Ürün grubu</span>
            <SectorPicker value={f.sectors ?? []} onChange={(v) => set('sectors', v)} />
          </div>
          <div>
            <span className="label">Ülke</span>
            <CountryPicker value={f.country_code ?? null} onChange={(code, c) => setF((p) => ({ ...p, country_code: code, country: c?.name ?? null, city: null }))} />
          </div>
          <div>
            <span className="label">Şehir</span>
            <CityPicker countryCode={f.country_code ?? null} value={f.city ?? null} onChange={(v) => set('city', v)} />
          </div>
          <Field label="Web sitesi"><input className="input" placeholder="www.firma.com.tr" value={f.website ?? ''} onChange={(e) => set('website', e.target.value)} /></Field>
          <Field label="LinkedIn"><input className="input" placeholder="https://linkedin.com/company/…" value={f.linkedin_url ?? ''} onChange={(e) => set('linkedin_url', e.target.value)} /></Field>
          <div>
            <span className="label">Firma e-posta</span>
            <MultiTextInput type="email" values={f.emails ?? []} onChange={(v) => set('emails', v)} addLabel="E-posta ekle" />
          </div>
          <div>
            <span className="label">Firma telefon</span>
            <MultiTextInput type="tel" values={f.phones ?? []} onChange={(v) => set('phones', v)} addLabel="Telefon ekle" />
          </div>

          <h4 className="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase sm:col-span-2">İrtibat kişisi</h4>
          <Field label="Ad soyad"><input className="input" value={f.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} /></Field>
          <Field label="Ünvan"><input className="input" placeholder="ör. Lojistik Müdürü" value={f.contact_title ?? ''} onChange={(e) => set('contact_title', e.target.value)} /></Field>
          <Field label="E-posta"><input className="input" type="email" value={f.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} /></Field>
          <Field label="Telefon"><input className="input" value={f.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} /></Field>

          <h4 className="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase sm:col-span-2">Nitelik (puanlamada kullanılır)</h4>
          <Field label="İhracat yapıyor mu?">
            <Select options={[{ value: 'yes', label: 'Evet' }, { value: 'no', label: 'Hayır' }]} placeholder="Bilinmiyor" value={boolVal}
              onChange={(v) => set('exports', v === 'yes' ? true : v === 'no' ? false : null)} />
          </Field>
          <Field label="Çalışan sayısı"><input className="input" type="number" min={0} value={f.employees ?? ''} onChange={(e) => set('employees', e.target.value)} /></Field>
          <Field label="Yön"><Select options={LEAD_DIRECTIONS} placeholder="-" value={f.direction} onChange={(v) => set('direction', v)} /></Field>
          <div>
            <span className="label">Muhtemel taşıma modu</span>
            <ToggleChips options={MODES} value={f.modes ?? []} onChange={(v) => set('modes', v)} />
          </div>
          <div className="sm:col-span-2">
            <span className="label">Satış yaptığı / aldığı ülkeler</span>
            <CountryMultiPicker value={f.target_markets ?? []} onChange={(v) => set('target_markets', v)} />
          </div>
          <Field label="Tahmini hacim" className="sm:col-span-2">
            <input className="input" placeholder="ör. Ayda 4-5 x 40HC Hamburg, haftalık 300 kg hava" value={f.est_volume ?? ''} onChange={(e) => set('est_volume', e.target.value)} />
          </Field>

          <h4 className="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase sm:col-span-2">Takip</h4>
          <Field label="Durum"><Select options={statusOptions} value={f.status} onChange={(v) => set('status', v)} /></Field>
          <Field label="Sonraki adım tarihi"><input className="input" type="date" value={f.next_action_date ?? ''} onChange={(e) => set('next_action_date', e.target.value)} /></Field>
          {f.status === 'disqualified' && (
            <Field label="Uygun olmama nedeni" className="sm:col-span-2"><input className="input" value={f.disqualify_reason ?? ''} onChange={(e) => set('disqualify_reason', e.target.value)} /></Field>
          )}
          <Field label="Sonraki adım" className="sm:col-span-2">
            <input className="input" placeholder="ör. Lojistik müdürünü ara, LCL tarifesi gönder" value={f.next_action_note ?? ''} onChange={(e) => set('next_action_note', e.target.value)} />
          </Field>
          <Field label="Notlar" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <Footer busy={busy} onClose={onClose} />
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ Temas
export function LeadActivityForm({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: () => void }) {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const [f, setF] = useState<Partial<LeadActivity>>({ type: 'call', activity_date: local })
  const { busy, error, run } = useSave()
  const set = (k: keyof LeadActivity, v: unknown) => setF((p) => ({ ...p, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      await q(supabase.from('lead_activities').insert(clean({
        lead_id: lead.id, type: f.type, outcome: f.type === 'note' ? null : f.outcome, note: f.note,
        activity_date: f.activity_date ? new Date(f.activity_date).toISOString() : new Date().toISOString(),
        next_action_date: f.next_action_date, next_action_note: f.next_action_note,
      })))
      onSaved()
    })
  }

  return (
    <Modal open title={`Temas kaydı · ${lead.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tip"><Select options={LEAD_ACTIVITY_TYPES} value={f.type} onChange={(v) => set('type', v)} /></Field>
          <Field label="Tarih"><input className="input" type="datetime-local" value={f.activity_date ?? ''} onChange={(e) => set('activity_date', e.target.value)} /></Field>
          {f.type !== 'note' && (
            <div className="sm:col-span-2">
              <span className="label">Sonuç</span>
              <div className="flex flex-wrap gap-1">
                {LEAD_OUTCOMES.map((o) => (
                  <button key={o.value} type="button" className={f.outcome === o.value ? 'btn-primary px-2.5 py-1 text-xs' : 'btn-secondary px-2.5 py-1 text-xs'}
                    onClick={() => set('outcome', f.outcome === o.value ? null : o.value)}>{o.label}</button>
                ))}
              </div>
            </div>
          )}
          <Field label="Not" className="sm:col-span-2"><textarea className="input" rows={3} autoFocus value={f.note ?? ''} onChange={(e) => set('note', e.target.value)} /></Field>
          <Field label="Sonraki adım tarihi"><input className="input" type="date" value={f.next_action_date ?? ''} onChange={(e) => set('next_action_date', e.target.value)} /></Field>
          <Field label="Sonraki adım"><input className="input" placeholder="ör. Teklif için tekrar ara" value={f.next_action_note ?? ''} onChange={(e) => set('next_action_note', e.target.value)} /></Field>
        </div>
        {f.type !== 'note' && !f.next_action_date && lead.next_action_date && (
          <p className="mt-2 text-xs text-slate-500">Sonraki adım tarihi boş bırakılırsa mevcut hatırlatma kaldırılır.</p>
        )}
        <Footer busy={busy} onClose={onClose} />
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ Firmaya dönüştür
export function ConvertLeadModal({ lead, onClose, onDone }: { lead: Lead; onClose: () => void; onDone: (companyId: string) => void }) {
  const firstMode = (lead.modes ?? []).find((m) => MODES.some((x) => x.value === m)) ?? 'sea_fcl'
  const [existing, setExisting] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [withOpp, setWithOpp] = useState(true)
  const [title, setTitle] = useState(lead.est_volume ? `${lead.name} – ${lead.est_volume}` : lead.name)
  const [mode, setMode] = useState(firstMode)
  const [dup, setDup] = useState<string | null>(null)
  const { busy, error, run } = useSave()
  const hasEmail = cleanList(lead.emails).length > 0

  useEffect(() => {
    loadDupIndex().then((idx) => {
      const d = findDup(idx, lead.name, lead.website)
      setDup(d?.startsWith('Firmalarda') ? d : null)
    }).catch(() => {})
  }, [lead])

  function submit(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      if (!existing && !hasEmail) {
        if (!email.trim()) throw new Error('Firma kaydı için en az bir e-posta adresi gerekli.')
        await q(supabase.from('leads').update({ emails: [email.trim()] }).eq('id', lead.id))
      }
      const cid = await q<string>(supabase.rpc('convert_lead', {
        p_lead: lead.id, p_company: existing, p_opp_title: withOpp ? title.trim() : null, p_opp_mode: withOpp ? mode : null,
      }))
      onDone(cid)
    })
  }

  return (
    <Modal open title="Firmaya dönüştür" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <p className="mb-3 text-sm text-slate-600">
          Firma <b>Müşteri</b> (cari) olarak açılır ve satış hunisinde <b>Kazanıldı</b> aşamasına düşer. İrtibat kişisi ve temas geçmişi de firmaya aktarılır.
        </p>
        {dup && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {dup}. Aynı firmaysa aşağıdan seçip ona bağlayın.
          </div>
        )}
        <div className="space-y-3">
          <Field label="Mevcut bir firmaya bağla (opsiyonel)">
            <CompanyCombo value={existing} onChange={(id) => setExisting(id)} allowCreate={false} placeholder="Boş bırakılırsa yeni firma açılır" />
          </Field>
          {!existing && !hasEmail && (
            <Field label="Firma e-postası *">
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withOpp} onChange={(e) => setWithOpp(e.target.checked)} /> Satış hunisinde kazanılmış fırsat oluştur
          </label>
          {withOpp && (
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
              <Field label="Fırsat başlığı"><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Mod"><Select options={MODES} value={mode} onChange={setMode} /></Field>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Dönüştürülüyor…' : 'Dönüştür'}</button>
        </div>
      </form>
    </Modal>
  )
}
