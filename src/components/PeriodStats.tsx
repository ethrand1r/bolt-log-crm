import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Kanban, Plane, Ship, TrendingUp, Truck } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { ChargeLine, Opportunity, Quote, Shipment } from '../lib/types'
import { modeGroup } from '../lib/constants'
import { fmtNum, totalsByCurrency, type CurrencyTotals } from '../lib/format'

export type ShipRow = Shipment & { shipment_charges: ChargeLine[]; companies: { name: string } | null }
export type QuoteRow = Pick<Quote, 'id' | 'status' | 'created_at' | 'mode'>
export type OppRow = Pick<Opportunity, 'id' | 'stage' | 'created_at' | 'updated_at' | 'est_value' | 'currency'>

export interface PeriodData {
  ships: ShipRow[]
  quotes: QuoteRow[]
  opps: OppRow[]
}

/** [start, end) aralığındaki verileri getirir (ISO tarih) */
export async function loadPeriod(start: string, end: string): Promise<PeriodData> {
  const [ships, quotes, opps] = await Promise.all([
    q<ShipRow[]>(supabase.from('shipments')
      .select('*, companies!shipments_company_id_fkey(name), shipment_charges(qty,buy_price,sell_price,currency)')
      .gte('created_at', start).lt('created_at', end).neq('status', 'cancelled')),
    q<QuoteRow[]>(supabase.from('quotes').select('id,status,created_at,mode').gte('created_at', start).lt('created_at', end)),
    q<OppRow[]>(supabase.from('opportunities').select('id,stage,created_at,updated_at,est_value,currency')
      .or(`and(created_at.gte.${start},created_at.lt.${end}),and(updated_at.gte.${start},updated_at.lt.${end})`)),
  ])
  return { ships, quotes, opps }
}

export interface Summary {
  files: number
  byGroup: Record<'sea' | 'air' | 'road', number>
  teu: number
  lclCbm: number
  airKg: number
  roadTrucks: number
  profit: CurrencyTotals
  quotes: number
  quotesAccepted: number
  newOpps: number
  won: number
  lost: number
  topCustomers: { name: string; files: number; profit: CurrencyTotals }[]
}

export function summarize(d: PeriodData, start: string, end: string): Summary {
  const inRange = (s: string) => s >= start && s < end
  const ships = d.ships.filter((s) => inRange(s.created_at))
  const byGroup = { sea: 0, air: 0, road: 0 }
  ships.forEach((s) => byGroup[modeGroup(s.mode)]++)

  const customers = new Map<string, { name: string; files: number; lines: ChargeLine[] }>()
  ships.forEach((s) => {
    const key = s.company_id ?? '-'
    const c = customers.get(key) ?? { name: s.companies?.name ?? '-', files: 0, lines: [] }
    c.files++
    c.lines.push(...s.shipment_charges)
    customers.set(key, c)
  })

  const quotes = d.quotes.filter((x) => inRange(x.created_at))
  return {
    files: ships.length,
    byGroup,
    teu: ships.filter((s) => s.mode === 'sea_fcl').reduce((a, s) => a + (s.containers ?? []).reduce((t, c) => t + (c.type.startsWith('20') ? 1 : 2), 0), 0),
    lclCbm: ships.filter((s) => s.mode === 'sea_lcl').reduce((a, s) => a + (Number(s.volume_cbm) || 0), 0),
    airKg: ships.filter((s) => s.mode === 'air').reduce((a, s) => a + (Number(s.chargeable_weight) || 0), 0),
    roadTrucks: ships.filter((s) => s.mode === 'road').length,
    profit: totalsByCurrency(ships.flatMap((s) => s.shipment_charges)),
    quotes: quotes.length,
    quotesAccepted: quotes.filter((x) => x.status === 'accepted').length,
    newOpps: d.opps.filter((o) => inRange(o.created_at)).length,
    won: d.opps.filter((o) => o.stage === 'won' && inRange(o.updated_at)).length,
    lost: d.opps.filter((o) => o.stage === 'lost' && inRange(o.updated_at)).length,
    topCustomers: [...customers.values()]
      .map((c) => ({ name: c.name, files: c.files, profit: totalsByCurrency(c.lines) }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 5),
  }
}

export const money = (t: CurrencyTotals, k: 'profit' | 'sell' = 'profit') =>
  Object.entries(t).map(([c, v]) => `${fmtNum(v[k], 0)} ${c}`).join(' · ') || '0'

function Kpi({ icon, title, value, sub, to }: { icon: ReactNode; title: string; value: ReactNode; sub?: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="rounded-md bg-brand-50 p-2 text-brand-600">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{title}</div>
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        {sub && <div className="truncate text-xs text-slate-500" title={typeof sub === 'string' ? sub : undefined}>{sub}</div>}
      </div>
    </>
  )
  return to
    ? <Link to={to} className="card flex items-start gap-3 p-4 transition hover:border-brand-500">{body}</Link>
    : <div className="card flex items-start gap-3 p-4">{body}</div>
}

/** Dönem KPI kartları + müşteri / mod dağılımı */
export function PeriodStats({ s, links }: { s: Summary; links?: boolean }) {
  const conv = s.won + s.lost > 0 ? `Kazanma oranı %${fmtNum((s.won / (s.won + s.lost)) * 100, 0)}` : 'Kazanılan / kaybedilen yok'
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi to={links ? '/sevkiyatlar' : undefined} icon={<Ship className="h-5 w-5" />} title="Açılan sevkiyat dosyası" value={s.files}
          sub={`Deniz ${s.byGroup.sea} · Hava ${s.byGroup.air} · Karayolu ${s.byGroup.road}`} />
        <Kpi icon={<TrendingUp className="h-5 w-5" />} title="Brüt kâr" value={<span className="text-lg">{money(s.profit)}</span>}
          sub={`Ciro: ${money(s.profit, 'sell')}`} />
        <Kpi to={links ? '/teklifler' : undefined} icon={<FileText className="h-5 w-5" />} title="Verilen teklif" value={s.quotes}
          sub={`${s.quotesAccepted} kabul edildi${s.quotes ? ` (%${fmtNum((s.quotesAccepted / s.quotes) * 100, 0)})` : ''}`} />
        <Kpi to={links ? '/huni' : undefined} icon={<Kanban className="h-5 w-5" />} title="Yeni fırsat" value={s.newOpps}
          sub={`${s.won} kazanıldı · ${s.lost} kaybedildi · ${conv}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card flex items-center gap-3 p-4"><Ship className="h-5 w-5 text-blue-600" /><div><div className="text-xs text-slate-500">Deniz FCL</div><div className="font-semibold">{s.teu} TEU</div></div></div>
        <div className="card flex items-center gap-3 p-4"><Ship className="h-5 w-5 text-teal-600" /><div><div className="text-xs text-slate-500">Deniz LCL</div><div className="font-semibold">{fmtNum(s.lclCbm, 1)} CBM</div></div></div>
        <div className="card flex items-center gap-3 p-4"><Plane className="h-5 w-5 text-fuchsia-600" /><div><div className="text-xs text-slate-500">Hava (CW)</div><div className="font-semibold">{fmtNum(s.airKg, 0)} kg</div></div></div>
        <div className="card flex items-center gap-3 p-4"><Truck className="h-5 w-5 text-orange-600" /><div><div className="text-xs text-slate-500">Karayolu</div><div className="font-semibold">{s.roadTrucks} sefer</div></div></div>
      </div>

      {s.topCustomers.length > 0 && (
        <div className="card">
          <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">En çok sevkiyat yapılan müşteriler</div>
          <table className="table-base">
            <thead><tr><th>Müşteri</th><th className="text-right!">Dosya</th><th className="text-right!">Kâr</th></tr></thead>
            <tbody>
              {s.topCustomers.map((c) => (
                <tr key={c.name}><td>{c.name}</td><td className="text-right">{c.files}</td><td className="text-right text-emerald-700">{money(c.profit)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
