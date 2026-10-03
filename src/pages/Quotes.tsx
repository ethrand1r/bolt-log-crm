import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { ChargeLine, Quote } from '../lib/types'
import { MODES, QUOTE_STATUSES } from '../lib/constants'
import { fmtDate, fmtNum, todayISO, totalsByCurrency } from '../lib/format'
import { Badge, Empty, ErrorBox, PageHeader, Spinner, useLoad } from '../components/ui'

type Row = Quote & { quote_items: ChargeLine[] }

export default function Quotes() {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const { data, loading, error } = useLoad(
    () => q<Row[]>(supabase.from('quotes').select('*, companies(name), quote_items(qty,buy_price,sell_price,currency)').order('created_at', { ascending: false })),
  )
  const today = todayISO()

  const rows = useMemo(() => {
    const s = search.toLocaleLowerCase('tr')
    return (data ?? []).filter((x) =>
      (!status || x.status === status) &&
      (!s || [x.quote_no, x.companies?.name, x.pol, x.pod, x.commodity].some((v) => v?.toLocaleLowerCase('tr').includes(s))))
  }, [data, search, status])

  return (
    <>
      <PageHeader
        title="Teklifler"
        actions={<Link className="btn-primary" to="/teklifler/yeni"><Plus className="h-4 w-4" /> Yeni teklif</Link>}
      />
      <ErrorBox error={error} />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-2 left-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-8!" placeholder="No, firma, liman ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          <button className={status === '' ? 'btn-primary' : 'btn-secondary'} onClick={() => setStatus('')}>Tümü</button>
          {QUOTE_STATUSES.map((t) => (
            <button key={t.value} className={status === t.value ? 'btn-primary' : 'btn-secondary'} onClick={() => setStatus(t.value)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <Empty>Teklif bulunamadı.</Empty> : (
          <table className="table-base">
            <thead>
              <tr><th>No</th><th>Firma</th><th>Mod</th><th>Rota</th><th>Satış</th><th>Kâr</th><th>Geçerlilik</th><th>Durum</th></tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const totals = Object.entries(totalsByCurrency(x.quote_items))
                const expired = x.valid_until && x.valid_until < today && ['draft', 'sent'].includes(x.status)
                return (
                  <tr key={x.id} className="cursor-pointer" onClick={() => nav(`/teklifler/${x.id}`)}>
                    <td className="font-medium text-slate-900">{x.quote_no}</td>
                    <td>{x.companies?.name}</td>
                    <td><Badge list={MODES} value={x.mode} /></td>
                    <td className="text-slate-600">{x.pol} → {x.pod}</td>
                    <td className="whitespace-nowrap">{totals.map(([c, t]) => <div key={c}>{fmtNum(t.sell)} {c}</div>)}</td>
                    <td className="whitespace-nowrap text-emerald-700">{totals.map(([c, t]) => <div key={c}>{fmtNum(t.profit)} {c}</div>)}</td>
                    <td className={expired ? 'font-medium text-red-600' : 'text-slate-600'}>{fmtDate(x.valid_until)}</td>
                    <td><Badge list={QUOTE_STATUSES} value={x.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
