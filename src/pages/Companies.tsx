import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Company } from '../lib/types'
import { COMPANY_TYPES } from '../lib/constants'
import { fmtDate } from '../lib/format'
import { Badge, Empty, ErrorBox, PageHeader, Spinner, useLoad } from '../components/ui'
import { CompanyForm } from '../components/forms'

type Row = Company & { contacts: { full_name: string; is_primary: boolean }[] }

export default function Companies() {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [creating, setCreating] = useState(false)
  const { data, loading, error } = useLoad(
    () => q<Row[]>(supabase.from('companies').select('*, contacts(full_name,is_primary)').order('name')),
  )

  const rows = useMemo(() => {
    const s = search.toLocaleLowerCase('tr')
    return (data ?? []).filter(
      (c) =>
        (!type || c.type === type) &&
        (!s || [c.name, c.city, c.country, ...(c.sectors ?? []), ...(c.emails ?? []), ...c.contacts.map((x) => x.full_name)]
          .some((v) => v?.toLocaleLowerCase('tr').includes(s))),
    )
  }, [data, search, type])

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
      </div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <Empty>Kayıt bulunamadı.</Empty>
        ) : (
          <table className="table-base">
            <thead>
              <tr><th>Firma</th><th>Tip</th><th>Sektör</th><th>Konum</th><th>Ana kişi</th><th>İletişim</th><th>Eklendi</th></tr>
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
