import { Link } from 'react-router-dom'
import { BarChart3, Clock } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Activity, Opportunity, Quote, Shipment } from '../lib/types'
import { ACTIVE_SHIPMENT_STATUSES, ACTIVITY_TYPES, QUOTE_STATUSES, SHIPMENT_STATUSES, STAGES, label } from '../lib/constants'
import { addDaysISO, fmtDate, fmtDateTime, monthRange, todayISO } from '../lib/format'
import { Badge, Empty, ErrorBox, PageHeader, Section, Spinner, useLoad } from '../components/ui'
import { PeriodStats, loadPeriod, summarize } from '../components/PeriodStats'

type ActRow = Activity & { companies: { name: string } | null }

export default function Dashboard() {
  const now = new Date()
  const [start, end] = monthRange(now.getFullYear(), now.getMonth())
  const today = todayISO()

  const { data, loading, error } = useLoad(async () => {
    const [period, opps, quotes, ships, acts] = await Promise.all([
      loadPeriod(start, end),
      q<Pick<Opportunity, 'stage'>[]>(supabase.from('opportunities').select('stage')),
      q<Quote[]>(supabase.from('quotes').select('*, companies(name)').in('status', ['draft', 'sent']).lte('valid_until', addDaysISO(7)).order('valid_until')),
      q<Shipment[]>(supabase.from('shipments').select('*, companies!shipments_company_id_fkey(name)')
        .in('status', ACTIVE_SHIPMENT_STATUSES).is('ata', null).lte('eta', addDaysISO(14)).order('eta')),
      q<ActRow[]>(supabase.from('activities').select('*, companies(name)').order('activity_date', { ascending: false }).limit(8)),
    ])
    return { period, opps, quotes, ships, acts }
  }, [start])

  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox error={error} />
  const { period, opps, quotes, ships, acts } = data
  const summary = summarize(period, start, end)
  const monthName = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  const maxStage = Math.max(1, ...STAGES.map((x) => opps.filter((o) => o.stage === x.value).length))

  return (
    <>
      <PageHeader
        title={`Dashboard · ${monthName}`}
        subtitle="Bu ayın özeti. Geçmiş aylar ve yıllar için Raporlar sayfasını kullanın."
        actions={<Link to="/raporlar" className="btn-secondary"><BarChart3 className="h-4 w-4" /> Raporlar</Link>}
      />

      <PeriodStats s={summary} links />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Yaklaşan varışlar (14 gün)">
          {ships.length === 0 ? <Empty>Yaklaşan varış yok.</Empty> : (
            <table className="table-base">
              <tbody>
                {ships.map((s) => (
                  <tr key={s.id}>
                    <td><Link className="font-medium text-brand-600 hover:underline" to={`/sevkiyatlar/${s.id}`}>{s.job_no}</Link></td>
                    <td>{s.companies?.name}</td>
                    <td className="text-slate-500">{s.pod}</td>
                    <td className={s.eta! < today ? 'font-medium text-red-600' : ''}>{fmtDate(s.eta)}</td>
                    <td><Badge list={SHIPMENT_STATUSES} value={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Süresi dolan / dolmak üzere olan teklifler">
          {quotes.length === 0 ? <Empty>Süresi yaklaşan teklif yok.</Empty> : (
            <table className="table-base">
              <tbody>
                {quotes.map((x) => (
                  <tr key={x.id}>
                    <td><Link className="font-medium text-brand-600 hover:underline" to={`/teklifler/${x.id}`}>{x.quote_no}</Link></td>
                    <td>{x.companies?.name}</td>
                    <td className="text-slate-500">{x.pol} → {x.pod}</td>
                    <td className={x.valid_until! < today ? 'font-medium text-red-600' : 'text-amber-700'}>{fmtDate(x.valid_until)}</td>
                    <td><Badge list={QUOTE_STATUSES} value={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Satış hunisi (güncel)">
          <div className="space-y-2">
            {STAGES.map((s) => {
              const n = opps.filter((o) => o.stage === s.value).length
              return (
                <div key={s.value} className="flex items-center gap-3 text-sm">
                  <span className="w-28 text-slate-600">{s.label}</span>
                  <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                    <div className={`h-2.5 rounded-full ${s.color}`} style={{ width: `${(n / maxStage) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right font-medium">{n}</span>
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Son aktiviteler">
          {acts.length === 0 ? <Empty>Henüz aktivite yok.</Empty> : (
            <ul className="space-y-2 text-sm">
              {acts.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <div>
                    <span className="font-medium">{a.subject}</span>
                    {a.company_id && <> · <Link className="text-brand-600 hover:underline" to={`/firmalar/${a.company_id}`}>{a.companies?.name}</Link></>}
                    <div className="text-xs text-slate-500">{label(ACTIVITY_TYPES, a.type)} · {fmtDateTime(a.activity_date)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
