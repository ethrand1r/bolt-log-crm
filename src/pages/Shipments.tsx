import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plane, Plus, Search, Ship, Truck } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Shipment } from '../lib/types'
import { MODES, SHIPMENT_STATUSES, modeGroup, type ModeGroup } from '../lib/constants'
import { fmtDate, fmtNum } from '../lib/format'
import { Badge, Empty, ErrorBox, Modal, PageHeader, Spinner, useLoad } from '../components/ui'

const TABS: { value: ModeGroup; label: string; icon: typeof Ship }[] = [
  { value: 'sea', label: 'Deniz', icon: Ship },
  { value: 'air', label: 'Hava', icon: Plane },
  { value: 'road', label: 'Karayolu', icon: Truck },
]

const FILTERS = [
  { value: 'active', label: 'Açık dosyalar' },
  { value: 'all', label: 'Tümü' },
  ...SHIPMENT_STATUSES,
]

/** Kapanmamış / iptal edilmemiş dosyalar */
const isOpen = (status: string) => !['closed', 'cancelled'].includes(status)

type Row = Shipment & { companies: { name: string } | null }

export default function Shipments() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tur') as ModeGroup) || 'sea'
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('active')
  const [choosing, setChoosing] = useState(false)
  const { data, loading, error } = useLoad(
    () => q<Row[]>(supabase.from('shipments').select('*, companies!shipments_company_id_fkey(name)').order('created_at', { ascending: false })),
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { sea: 0, air: 0, road: 0 }
    ;(data ?? []).forEach((x) => { if (isOpen(x.status)) c[modeGroup(x.mode)]++ })
    return c
  }, [data])

  // Seçili sekmedeki dosyaların filtre bazında sayısı: "Booking (3)"
  const filterCounts = useMemo(() => {
    const c: Record<string, number> = { active: 0, all: 0 }
    ;(data ?? []).forEach((x) => {
      if (modeGroup(x.mode) !== tab) return
      c.all++
      if (isOpen(x.status)) c.active++
      c[x.status] = (c[x.status] ?? 0) + 1
    })
    return c
  }, [data, tab])

  const rows = useMemo(() => {
    const s = search.toLocaleLowerCase('tr')
    return (data ?? []).filter((x) =>
      modeGroup(x.mode) === tab &&
      (filter === 'all' || (filter === 'active' ? isOpen(x.status) : x.status === filter)) &&
      (!s || [x.job_no, x.companies?.name, x.booking_no, x.mbl_no, x.hbl_no, x.mawb_no, x.hawb_no, x.cmr_no, x.truck_plate,
        x.pol, x.pod, x.carrier, ...(x.containers ?? []).map((c) => c.no)].some((v) => v?.toLocaleLowerCase('tr').includes(s))))
  }, [data, search, filter, tab])

  function newFile(mode: string) {
    setChoosing(false)
    nav(`/sevkiyatlar/yeni?mode=${mode}`)
  }

  return (
    <>
      <PageHeader
        title="Sevkiyat Dosyaları"
        actions={<button className="btn-primary" onClick={() => (tab === 'sea' ? setChoosing(true) : newFile(tab))}><Plus className="h-4 w-4" /> Yeni {TABS.find((t) => t.value === tab)?.label.toLocaleLowerCase('tr')} dosyası</button>}
      />
      <ErrorBox error={error} />

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.value}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${tab === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setParams({ tur: t.value })}>
            <t.icon className="h-4 w-4" /> {t.label}
            {counts[t.value] > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{counts[t.value]}</span>}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-2 left-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-8!" placeholder={tab === 'road' ? 'Dosya, CMR, plaka ara…' : tab === 'air' ? 'Dosya, AWB ara…' : 'Dosya, BL, konteyner ara…'}
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((t) => (
            <button key={t.value} className={filter === t.value ? 'btn-primary' : 'btn-secondary'} onClick={() => setFilter(t.value)}>{t.label} ({filterCounts[t.value] ?? 0})</button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <Empty>Sevkiyat bulunamadı.</Empty> : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Dosya No</th><th>Müşteri</th>{tab === 'sea' && <th>Mod</th>}<th>Rota</th>
                {tab === 'sea' && <><th>BL</th><th>Ekipman</th></>}
                {tab === 'air' && <><th>AWB</th><th>CW</th></>}
                {tab === 'road' && <><th>Plaka</th><th>CMR</th></>}
                {tab === 'air' ? <th>Flight date</th> : <><th>{tab === 'road' ? 'Yükleme' : 'ETD'}</th><th>{tab === 'road' ? 'Varış' : 'ETA'}</th></>}
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="cursor-pointer" onClick={() => nav(`/sevkiyatlar/${x.id}`)}>
                  <td className="font-medium text-slate-900">{x.job_no}</td>
                  <td>{x.companies?.name}</td>
                  {tab === 'sea' && <td><Badge list={MODES} value={x.mode} /></td>}
                  <td className="text-slate-600">{[x.pol, ...(x.transits ?? []), x.pod].filter(Boolean).join(' → ')}</td>
                  {tab === 'sea' && (
                    <>
                      <td className="text-slate-600">{x.mbl_no ?? x.hbl_no ?? x.booking_no}</td>
                      <td className="text-slate-600">
                        {x.mode === 'sea_fcl'
                          ? Object.entries((x.containers ?? []).reduce<Record<string, number>>((a, c) => ({ ...a, [c.type]: (a[c.type] ?? 0) + 1 }), {})).map(([k, n]) => `${n}x${k}`).join(', ')
                          : x.volume_cbm ? `${fmtNum(x.volume_cbm, 2)} CBM` : ''}
                      </td>
                    </>
                  )}
                  {tab === 'air' && (
                    <>
                      <td className="text-slate-600">{x.mawb_no ?? x.hawb_no}</td>
                      <td className="text-slate-600">{x.chargeable_weight ? `${fmtNum(x.chargeable_weight, 0)} kg` : ''}</td>
                    </>
                  )}
                  {tab === 'road' && (
                    <>
                      <td className="text-slate-600">{[x.truck_plate, x.trailer_plate].filter(Boolean).join(' / ')}</td>
                      <td className="text-slate-600">{x.cmr_no}</td>
                    </>
                  )}
                  {tab === 'air' ? <td>{fmtDate(x.etd)}</td> : (
                    <>
                      <td>{fmtDate(x.atd ?? x.etd)}</td>
                      <td>{fmtDate(x.ata ?? x.eta)}</td>
                    </>
                  )}
                  <td><Badge list={SHIPMENT_STATUSES} value={x.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={choosing} title="Yeni deniz dosyası" onClose={() => setChoosing(false)}>
        <div className="grid grid-cols-2 gap-3">
          <button className="card flex flex-col items-center gap-2 p-5 hover:border-brand-500" onClick={() => newFile('sea_fcl')}>
            <Ship className="h-7 w-7 text-brand-600" /><span className="font-semibold">FCL</span><span className="text-xs text-slate-500">Komple konteyner</span>
          </button>
          <button className="card flex flex-col items-center gap-2 p-5 hover:border-brand-500" onClick={() => newFile('sea_lcl')}>
            <Ship className="h-7 w-7 text-teal-600" /><span className="font-semibold">LCL</span><span className="text-xs text-slate-500">Parsiyel</span>
          </button>
        </div>
      </Modal>
    </>
  )
}
