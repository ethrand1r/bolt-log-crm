import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Mail, Pencil, Phone, Plus, Ship, Star, Trash2 } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Activity, Company, Contact, Opportunity, Quote, Shipment } from '../lib/types'
import { ACTIVITY_TYPES, COMPANY_TYPES, COMPLETED_SHIPMENT_STATUSES, MODES, QUOTE_STATUSES, SHIPMENT_STATUSES, STAGES, label } from '../lib/constants'
import { fmtDate, fmtDateTime, fmtMoney } from '../lib/format'
import { Badge, Empty, ErrorBox, PageHeader, Section, Spinner, useLoad } from '../components/ui'
import { ActivityForm, CompanyForm, ContactForm, OpportunityForm } from '../components/forms'
import { getCountries } from '../lib/refdata'

interface Detail {
  company: Company
  contacts: Contact[]
  activities: Activity[]
  opportunities: Opportunity[]
  quotes: Quote[]
  shipments: Shipment[]
  marketName: string | null
}

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [modal, setModal] = useState<null | 'company' | 'contact' | 'activity' | 'opportunity'>(null)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [editOpp, setEditOpp] = useState<Opportunity | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const { data, loading, error, reload } = useLoad<Detail>(async () => {
    const [company, contacts, activities, opportunities, quotes, shipments, countries] = await Promise.all([
      q<Company>(supabase.from('companies').select('*').eq('id', id!).single()),
      q<Contact[]>(supabase.from('contacts').select('*').eq('company_id', id!).order('is_primary', { ascending: false }).order('full_name')),
      q<Activity[]>(supabase.from('activities').select('*').eq('company_id', id!).order('activity_date', { ascending: false })),
      q<Opportunity[]>(supabase.from('opportunities').select('*').eq('company_id', id!).order('created_at', { ascending: false })),
      q<Quote[]>(supabase.from('quotes').select('*').eq('company_id', id!).order('created_at', { ascending: false })),
      q<Shipment[]>(supabase.from('shipments').select('*').eq('company_id', id!).order('created_at', { ascending: false })),
      getCountries().catch(() => []),
    ])
    const marketName = company.market ? countries.find((x) => x.code === company.market)?.tr ?? company.market : null
    return { company, contacts, activities, opportunities, quotes, shipments, marketName }
  }, [id])

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorBox error={error ?? 'Firma bulunamadı'} />
  const { company: c, contacts, activities, opportunities, quotes, shipments, marketName } = data

  async function del(table: string, rowId: string, msg: string) {
    if (!confirm(msg)) return
    try {
      await q(supabase.from(table).delete().eq('id', rowId))
      reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function deleteCompany() {
    setErr(null)
    try {
      // Müşteri, shipper, consignee, notify veya acente olarak yer aldığı tamamlanmış sevkiyat var mı?
      const done = await q<{ job_no: string }[]>(supabase.from('shipments').select('job_no')
        .in('status', COMPLETED_SHIPMENT_STATUSES)
        .or(`company_id.eq.${c.id},shipper_id.eq.${c.id},consignee_id.eq.${c.id},notify_id.eq.${c.id},agent_id.eq.${c.id}`))
      if (done.length) {
        setErr(`Bu firma silinemez: tamamlanmış sevkiyatları var (${done.map((d) => d.job_no).join(', ')}).`)
        return
      }
      const extra = [
        quotes.length && `${quotes.length} teklif`,
        shipments.length && `${shipments.length} sevkiyat dosyası`,
      ].filter(Boolean).join(' ve ')
      if (!confirm(`"${c.name}" firması, kişileri, aktiviteleri ve fırsatları${extra ? ` ile birlikte ${extra}` : ''} silinecek. Emin misiniz?`)) return
      await q(supabase.from('companies').delete().eq('id', c.id))
      nav('/firmalar')
    } catch (e) {
      setErr('Silinemedi: ' + (e as Error).message)
    }
  }

  const contactName = (cid: string | null) => contacts.find((x) => x.id === cid)?.full_name

  return (
    <>
      <Link to="/firmalar" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Firmalar
      </Link>
      <PageHeader
        title={<span className="flex items-center gap-2">{c.name} <Badge list={COMPANY_TYPES} value={c.type} /></span>}
        subtitle={[(c.sectors ?? []).join(', '), [c.city, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setModal('company')}><Pencil className="h-4 w-4" /> Düzenle</button>
            <button className="btn-secondary" onClick={() => nav(`/teklifler/yeni?company=${c.id}`)}><FileText className="h-4 w-4" /> Teklif</button>
            <button className="btn-danger" onClick={deleteCompany}><Trash2 className="h-4 w-4" /></button>
          </>
        }
      />
      <ErrorBox error={err} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Section title="Firma bilgileri">
            <dl className="space-y-2 text-sm">
              {([
                ['Pazar', marketName], ['E-posta', (c.emails ?? []).join('\n')], ['Telefon', (c.phones ?? []).join('\n')], ['Web', c.website], ['Adres', c.address],
                ['Vergi', [c.tax_office, c.tax_no].filter(Boolean).join(' / ')], ['EORI', c.eori], ['Kaynak', c.source],
              ] as const).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[5rem_1fr] gap-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="break-words whitespace-pre-line">{v}</dd>
                </div>
              ))}
              {c.notes && <div className="mt-3 rounded-md bg-amber-50 p-2 whitespace-pre-line text-slate-700">{c.notes}</div>}
            </dl>
          </Section>

          <Section title={`Kişiler (${contacts.length})`} actions={
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditContact(null); setModal('contact') }}><Plus className="h-3.5 w-3.5" /> Ekle</button>
          }>
            {contacts.length === 0 ? <Empty>Henüz kişi yok.</Empty> : (
              <ul className="divide-y divide-slate-100">
                {contacts.map((p) => (
                  <li key={p.id} className="group py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 font-medium">
                        {p.is_primary && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}{p.full_name}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <button className="btn-ghost p-1" onClick={() => { setEditContact(p); setModal('contact') }}><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="btn-ghost p-1 text-red-500" onClick={() => del('contacts', p.id, `${p.full_name} silinsin mi?`)}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    {p.title && <div className="text-xs text-slate-500">{p.title}</div>}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600">
                      {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-1 hover:text-brand-600"><Mail className="h-3 w-3" />{p.email}</a>}
                      {(p.mobile || p.phone) && <a href={`tel:${p.mobile || p.phone}`} className="flex items-center gap-1 hover:text-brand-600"><Phone className="h-3 w-3" />{p.mobile || p.phone}</a>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Section title={`Fırsatlar (${opportunities.length})`} actions={
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditOpp(null); setModal('opportunity') }}><Plus className="h-3.5 w-3.5" /> Ekle</button>
          }>
            {opportunities.length === 0 ? <Empty>Fırsat yok.</Empty> : (
              <table className="table-base">
                <tbody>
                  {opportunities.map((o) => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => { setEditOpp(o); setModal('opportunity') }}>
                      <td className="font-medium">{o.title}</td>
                      <td>{label(MODES, o.mode)}</td>
                      <td className="text-slate-600">{[o.origin, o.destination].filter(Boolean).join(' → ')}</td>
                      <td>{o.est_value ? fmtMoney(o.est_value, o.currency ?? 'USD') : ''}</td>
                      <td className="text-right"><span className="text-xs font-medium text-slate-600">{label(STAGES, o.stage)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Section title={`Teklifler (${quotes.length})`}>
              {quotes.length === 0 ? <Empty>Teklif yok.</Empty> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {quotes.map((x) => (
                    <li key={x.id}>
                      <Link to={`/teklifler/${x.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-brand-600">
                        <span><b>{x.quote_no}</b> <span className="text-slate-500">{label(MODES, x.mode)} · {x.pol} → {x.pod}</span></span>
                        <Badge list={QUOTE_STATUSES} value={x.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title={`Sevkiyatlar (${shipments.length})`}>
              {shipments.length === 0 ? <Empty>Sevkiyat yok.</Empty> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {shipments.map((x) => (
                    <li key={x.id}>
                      <Link to={`/sevkiyatlar/${x.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-brand-600">
                        <span className="flex items-center gap-1"><Ship className="h-3.5 w-3.5 text-slate-400" /><b>{x.job_no}</b> <span className="text-slate-500">{x.pol} → {x.pod}</span></span>
                        <Badge list={SHIPMENT_STATUSES} value={x.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="Aktivite geçmişi" actions={
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setModal('activity')}><Plus className="h-3.5 w-3.5" /> Ekle</button>
          }>
            {activities.length === 0 ? <Empty>Henüz aktivite yok. Telefon, e-posta ve toplantıları buraya kaydedin.</Empty> : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                {activities.map((a) => (
                  <li key={a.id} className="group relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-500" />
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{a.subject}</span>
                        <span className="ml-2 text-xs text-slate-500">{label(ACTIVITY_TYPES, a.type)} · {fmtDateTime(a.activity_date)}{a.contact_id ? ` · ${contactName(a.contact_id) ?? ''}` : ''}</span>
                      </div>
                      <button className="btn-ghost p-1 text-red-500 opacity-0 group-hover:opacity-100" onClick={() => del('activities', a.id, 'Aktivite silinsin mi?')}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {a.body && <p className="mt-0.5 whitespace-pre-line text-slate-600">{a.body}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Section>
          <p className="text-xs text-slate-400">Oluşturuldu {fmtDate(c.created_at)} · Güncellendi {fmtDate(c.updated_at)}</p>
        </div>
      </div>

      {modal === 'company' && <CompanyForm company={c} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
      {modal === 'contact' && <ContactForm contact={editContact} companyId={c.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
      {modal === 'activity' && <ActivityForm companyId={c.id} contacts={contacts} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
      {modal === 'opportunity' && <OpportunityForm opportunity={editOpp} companyId={c.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
    </>
  )
}
