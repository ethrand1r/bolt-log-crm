import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Company } from '../lib/types'
import { COMPANY_TYPES } from '../lib/constants'
import { fmtDate } from '../lib/format'
import { Badge, Empty, ErrorBox, PageHeader, Select, Spinner, useLoad } from '../components/ui'
import { CompanyForm } from '../components/forms'
import { getCountries } from '../lib/refdata'

type Row = Company & { contacts: { full_name: string; is_primary: boolean }[] }

export default function Companies() {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [market, setMarket] = useState('')
  const [creating, setCreating] = useState(false)
  const { data: loaded, loading, error } = useLoad(async () => {
    const [companies, countries] = await Promise.all([
      q<Row[]>(supabase.from('companies').select('*, contacts(full_name,is_primary)').order('name')),
      getCountries().catch(() => []),
    ])
    return { companies, countryName: new Map(countries.map((c) => [c.code, c.tr])) }
  })
  const data = loaded?.companies
  const marketName = (code: string) => loaded?.countryName.get(code) ?? code

  // Pazar filtresi: firması olan pazarlar, firma sayısıyla
  const marketOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of data ?? []) if (c.market) counts.set(c.market, (counts.get(c.market) ?? 0) + 1)
    const none = (data ?? []).filter((c) => !c.market).length
    return [
      ...[...counts].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ value: code, label: `${marketName(code)} (${n})` })),
      ...(none ? [{ value: 'none', label: `Pazarı belli değil (${none})` }] : []),
    ]
  }, [loaded])

  const rows = useMemo(() => {
    const s = search.toLocaleLowerCase('tr')
    return (data ?? []).filter(
      (c) =>
        (!type || c.type === type) &&
        (!market || (market === 'none' ? !c.market : c.market === market)) &&
        (!s || [c.name, c.city, c.country, ...(c.sectors ?? []), ...(c.emails ?? []), ...c.contacts.map((x) => x.full_name)]
          .some((v) => v?.toLocaleLowerCase('tr').includes(s))),
    )
  }, [data, search, type, market])

  return (
    <>
      <PageHeader
        title="Firmalar & Kişiler"
        subtitle={data ? `${data.length} firma` : undefined}
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Yeni firma</button>}
      />
      <ErrorBox error={error} />

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-2 left-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-8!" placeholder="Firma, kişi, şehir ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          <button className={type === '' ? 'btn-primary' : 'btn-secondary'} onClick={() => setType('')}>Tümü</button>
          {COMPANY_TYPES.map((t) => (
            <button key={t.value} className={type === t.value ? 'btn-primary' : 'btn-secondary'} onClick={() => setType(t.value)}>{t.label}</button>
          ))}
        </div>
        <Select className="w-auto!" options={marketOptions} placeholder="Tüm pazarlar" value={market} onChange={setMarket} />
      </div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <Empty>Kayıt bulunamadı.</Empty>
        ) : (
          <table className="table-base">
            <thead>
              <tr><th>Firma</th><th>Tip</th><th>Sektör</th><th>Konum</th><th>Pazar</th><th>Ana kişi</th><th>İletişim</th><th>Eklendi</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const primary = c.contacts.find((x) => x.is_primary) ?? c.contacts[0]
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/firmalar/${c.id}`)}>
                    <td className="font-medium text-slate-900"><Link to={`/firmalar/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.name}</Link></td>
                    <td><Badge list={COMPANY_TYPES} value={c.type} /></td>
                    <td className="max-w-56 truncate text-slate-600" title={(c.sectors ?? []).join(', ')}>{(c.sectors ?? []).join(', ')}</td>
                    <td className="text-slate-600">{[c.city, c.country].filter(Boolean).join(', ')}</td>
                    <td className="text-slate-600">{c.market ? marketName(c.market) : <span className="text-slate-400">-</span>}</td>
                    <td className="text-slate-600">{primary?.full_name}</td>
                    <td className="text-slate-600">{c.emails?.[0] ?? c.phones?.[0]}</td>
                    <td className="text-slate-500">{fmtDate(c.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {creating && <CompanyForm onClose={() => setCreating(false)} onSaved={(c) => nav(`/firmalar/${c.id}`)} />}
    </>
  )
}
