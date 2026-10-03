import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fmtNum, monthRange } from '../lib/format'
import { ErrorBox, PageHeader, Spinner, useLoad } from '../components/ui'
import { PeriodStats, loadPeriod, money, summarize } from '../components/PeriodStats'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const FIRST_YEAR = 2026

export default function Reports() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  // -1 = tüm yıl
  const [month, setMonth] = useState(now.getMonth() === 0 ? -1 : now.getMonth() - 1)

  const [yStart, yEnd] = [new Date(year, 0, 1).toISOString(), new Date(year + 1, 0, 1).toISOString()]
  const { data, loading, error } = useLoad(() => loadPeriod(yStart, yEnd), [year])

  const [start, end] = month === -1 ? [yStart, yEnd] : monthRange(year, month)
  const years = Array.from({ length: Math.max(1, now.getFullYear() - FIRST_YEAR + 1) }, (_, i) => now.getFullYear() - i)
  const title = month === -1 ? `${year} yılı` : `${MONTHS[month]} ${year}`

  function shiftMonth(d: number) {
    if (month === -1) return
    const m = month + d
    if (m < 0) { setYear(year - 1); setMonth(11) }
    else if (m > 11) { setYear(year + 1); setMonth(0) }
    else setMonth(m)
  }

  return (
    <>
      <PageHeader
        title="Raporlar"
        subtitle={`${title} özeti`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-ghost p-1.5" disabled={month === -1} onClick={() => shiftMonth(-1)} title="Önceki ay"><ChevronLeft className="h-4 w-4" /></button>
            <select className="input w-36!" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              <option value={-1}>Tüm yıl</option>
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select className="input w-24!" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
            <button className="btn-ghost p-1.5" disabled={month === -1 || (year === now.getFullYear() && month >= now.getMonth())} onClick={() => shiftMonth(1)} title="Sonraki ay"><ChevronRight className="h-4 w-4" /></button>
          </div>
        }
      />
      <ErrorBox error={error} />
      {loading || !data ? <Spinner /> : (
        <>
          <PeriodStats s={summarize(data, start, end)} />

          {month === -1 && (
            <div className="card mt-4 overflow-x-auto">
              <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">Aylık döküm - {year}</div>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Ay</th><th className="text-right!">Dosya</th><th className="text-right!">TEU</th><th className="text-right!">LCL CBM</th>
                    <th className="text-right!">Hava kg</th><th className="text-right!">Karayolu</th><th className="text-right!">Teklif</th>
                    <th className="text-right!">Kazanılan</th><th className="text-right!">Kâr</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((m, i) => {
                    const [s, e] = monthRange(year, i)
                    const r = summarize(data, s, e)
                    const empty = r.files === 0 && r.quotes === 0 && r.newOpps === 0 && r.won === 0
                    return (
                      <tr key={m} className={`cursor-pointer ${empty ? 'text-slate-400' : ''}`} onClick={() => setMonth(i)}>
                        <td className="font-medium">{m}</td>
                        <td className="text-right">{r.files}</td>
                        <td className="text-right">{r.teu}</td>
                        <td className="text-right">{fmtNum(r.lclCbm, 1)}</td>
                        <td className="text-right">{fmtNum(r.airKg, 0)}</td>
                        <td className="text-right">{r.roadTrucks}</td>
                        <td className="text-right">{r.quotes}</td>
                        <td className="text-right">{r.won}</td>
                        <td className="text-right whitespace-nowrap text-emerald-700">{empty ? '-' : money(r.profit)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
