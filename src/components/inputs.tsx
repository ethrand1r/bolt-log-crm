import { useEffect, useRef, useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { getChargeTemplates } from '../lib/refdata'
import type { CargoFields, ChargeLine, ChargeTemplate, ContainerLine, DimLine } from '../lib/types'
import { CARGO_TYPES, CHARGE_UNITS, CONTAINER_TYPES, CURRENCIES, DG_CLASSES, ROAD_LOADS, VEHICLE_TYPES, modeGroup } from '../lib/constants'
import { cbmFromDims, chargeableFor, fmtNum, ldmFromDims, numOrNull, totalsByCurrency } from '../lib/format'
import { Field, Select } from './ui'

/** Konteyner satırları. withNumbers=true ise konteyner no / mühür girilir (sevkiyat). */
export function ContainerEditor({ value, onChange, withNumbers }: {
  value: ContainerLine[]
  onChange: (v: ContainerLine[]) => void
  withNumbers?: boolean
}) {
  const set = (i: number, patch: Partial<ContainerLine>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <div className="space-y-2">
      {value.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select className="input w-28!" value={c.type} onChange={(e) => set(i, { type: e.target.value })}>
            {CONTAINER_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          {withNumbers ? (
            <>
              <input className="input w-44!" placeholder="Konteyner no" value={c.no ?? ''} onChange={(e) => set(i, { no: e.target.value.toUpperCase() })} />
              <input className="input w-36!" placeholder="Mühür no" value={c.seal ?? ''} onChange={(e) => set(i, { seal: e.target.value })} />
            </>
          ) : (
            <input className="input w-20!" type="number" min={1} value={c.qty ?? 1} onChange={(e) => set(i, { qty: Number(e.target.value) })} />
          )}
          <button type="button" className="btn-ghost p-1.5 text-red-500" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => onChange([...value, withNumbers ? { type: '40HC' } : { type: '40HC', qty: 1 }])}>
        <Plus className="h-4 w-4" /> Konteyner ekle
      </button>
    </div>
  )
}

/**
 * Yük bilgileri: emtia, yük tipi (GEN/PER/DG…), istif, ölçüler.
 * CBM ölçülerden, ücretlendirilebilir ağırlık (CW / W/M) CBM ve brüt ağırlıktan otomatik hesaplanır;
 * CW elle değiştirilirse otomatik hesap durur ("Otomatik" ile geri alınır).
 */
export function CargoEditor({ value, mode, onChange }: {
  value: Partial<CargoFields>
  mode: string
  onChange: (patch: Partial<CargoFields>) => void
}) {
  const dims = value.dimensions ?? []
  const dimsCbm = cbmFromDims(dims)
  const hasDims = dimsCbm !== null
  const group = modeGroup(mode)
  const dimsLdm = group === 'road' ? ldmFromDims(dims, value.stackable) : null
  const cwLabel = mode === 'air' ? 'Ücretlendirilen ağırlık (CW, kg)' : mode === 'road' ? 'Ücretlendirilen ağırlık (kg)' : mode === 'sea_lcl' ? 'W/M (revenue ton)' : null
  const computed = chargeableFor(mode, value.gross_weight ?? null, value.volume_cbm ?? null)
  const [manualCw, setManualCw] = useState(
    () => value.chargeable_weight != null && computed != null && Number(value.chargeable_weight) !== computed,
  )

  // Ölçülerden CBM, kap adedi ve (karayolunda) LDM
  useEffect(() => {
    if (!hasDims) return
    const pk = dims.reduce((s, d) => s + (Number(d.qty) || 0), 0)
    const patch: Partial<CargoFields> = {}
    if (dimsCbm !== value.volume_cbm) patch.volume_cbm = dimsCbm
    if (pk && pk !== value.packages) patch.packages = pk
    if (group === 'road' && dimsLdm !== (value.ldm ?? null)) patch.ldm = dimsLdm
    if (Object.keys(patch).length) onChange(patch)
  }, [dimsCbm, dimsLdm, hasDims, dims, group])

  // "Ölçü satırı ekle" sonrası yeni satırın adet kutusuna odaklan
  const dimTable = useRef<HTMLTableElement>(null)
  const [focusNewRow, setFocusNewRow] = useState(false)
  useEffect(() => {
    if (!focusNewRow) return
    const qty = dimTable.current?.querySelector<HTMLInputElement>('tbody tr:last-child input')
    qty?.focus()
    qty?.select()
    setFocusNewRow(false)
  }, [focusNewRow, dims.length])

  // CW otomatik
  useEffect(() => {
    if (manualCw || !cwLabel) return
    if (computed !== (value.chargeable_weight ?? null)) onChange({ chargeable_weight: computed })
  }, [computed, manualCw, cwLabel])

  const setDim = (i: number, patch: Partial<DimLine>) => onChange({ dimensions: dims.map((d, j) => (j === i ? { ...d, ...patch } : d)) })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Emtia" className="sm:col-span-2">
          <input className="input" value={value.commodity ?? ''} onChange={(e) => onChange({ commodity: e.target.value })} />
        </Field>
        <Field label="Yük tipi">
          <Select options={CARGO_TYPES} value={value.cargo_type ?? 'GEN'} onChange={(v) => onChange({ cargo_type: v })} />
        </Field>
        <Field label="İstifleme">
          <div className="flex rounded-md border border-slate-300 p-0.5 text-sm">
            {[{ v: true, l: 'Stackable' }, { v: false, l: 'Non-stackable' }].map((o) => (
              <button key={o.l} type="button"
                className={`flex-1 rounded px-2 py-1 ${(value.stackable ?? true) === o.v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => onChange({ stackable: o.v })}>{o.l}</button>
            ))}
          </div>
        </Field>
        {value.cargo_type === 'DG' && (
          <>
            <Field label="UN No"><input className="input" placeholder="ör. UN1263" value={value.dg_un_no ?? ''} onChange={(e) => onChange({ dg_un_no: e.target.value.toUpperCase() })} /></Field>
            <Field label="IMO / IATA sınıfı"><Select options={DG_CLASSES} placeholder="-" value={value.dg_class} onChange={(v) => onChange({ dg_class: v || null })} /></Field>
          </>
        )}
        {group === 'road' && (
          <>
            <Field label="Yükleme şekli"><Select options={ROAD_LOADS} placeholder="-" value={value.road_load} onChange={(v) => onChange({ road_load: v || null })} /></Field>
            <Field label="Araç tipi"><Select options={VEHICLE_TYPES} placeholder="-" value={value.vehicle_type} onChange={(v) => onChange({ vehicle_type: v || null })} /></Field>
          </>
        )}
      </div>

      <div>
        <span className="label">Ölçüler (cm)</span>
        {dims.length > 0 && (
          <div className="mb-2 overflow-x-auto">
            <table ref={dimTable} className="table-base max-w-xl">
              <thead><tr><th className="w-20">Adet</th><th>Boy</th><th>En</th><th>Yükseklik</th><th className="text-right!">CBM</th><th className="w-10"></th></tr></thead>
              <tbody>
                {dims.map((d, i) => (
                  <tr key={i}>
                    {(['qty', 'l', 'w', 'h'] as const).map((k) => (
                      <td key={k}><input className="input" type="number" min={0} step="any" value={d[k] || ''} onChange={(e) => setDim(i, { [k]: Number(e.target.value) })} /></td>
                    ))}
                    <td className="text-right text-slate-600">{fmtNum((d.qty * d.l * d.w * d.h) / 1_000_000, 3)}</td>
                    <td><button type="button" className="btn-ghost p-1.5 text-red-500" onClick={() => onChange({ dimensions: dims.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="btn-secondary" onClick={() => { onChange({ dimensions: [...dims, { qty: 1, l: 0, w: 0, h: 0 }] }); setFocusNewRow(true) }}>
          <Plus className="h-4 w-4" /> Ölçü satırı ekle
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Kap adedi">
          <input className="input" type="number" value={value.packages ?? ''} onChange={(e) => onChange({ packages: numOrNull(e.target.value) })} />
        </Field>
        <Field label="Brüt ağırlık (kg)">
          <input className="input" type="number" step="any" value={value.gross_weight ?? ''} onChange={(e) => onChange({ gross_weight: numOrNull(e.target.value) })} />
        </Field>
        <Field label={hasDims ? 'Hacim (CBM) - ölçülerden' : 'Hacim (CBM)'}>
          <input className="input" type="number" step="any" disabled={hasDims} value={value.volume_cbm ?? ''} onChange={(e) => onChange({ volume_cbm: numOrNull(e.target.value) })} />
        </Field>
        {cwLabel && (
          <Field label={cwLabel}>
            <div className="flex gap-1">
              <input className={`input ${manualCw ? 'border-amber-400!' : ''}`} type="number" step="any" value={value.chargeable_weight ?? ''}
                onChange={(e) => { setManualCw(true); onChange({ chargeable_weight: numOrNull(e.target.value) }) }} />
              {manualCw && (
                <button type="button" className="btn-ghost px-2" title={`Otomatik hesapla (${computed ?? '-'})`}
                  onClick={() => { setManualCw(false); onChange({ chargeable_weight: computed }) }}>
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
            <span className="mt-0.5 block text-[11px] text-slate-400">
              {manualCw ? `Elle girildi · hesaplanan: ${computed ?? '-'}` : mode === 'air' ? '1 CBM = 167 kg' : mode === 'road' ? '1 CBM = 333 kg' : '1 CBM = 1 ton'}
            </span>
          </Field>
        )}
        {group === 'road' && (
          <Field label={hasDims ? 'Yükleme metresi (LDM) - ölçülerden' : 'Yükleme metresi (LDM)'}>
            <input className="input" type="number" step="any" disabled={hasDims} value={value.ldm ?? ''} onChange={(e) => onChange({ ldm: numOrNull(e.target.value) })} />
            <span className="mt-0.5 block text-[11px] text-slate-400">
              Dorse 2,40 m geniş{value.stackable === false ? '' : ', istifte 2,70 m yükseklik'}
            </span>
          </Field>
        )}
      </div>
    </div>
  )
}

/** Masraf kalemleri tablosu (alış / satış / kâr) */
export function ChargeEditor({ lines, onChange, mode }: {
  lines: ChargeLine[]
  onChange: (l: ChargeLine[]) => void
  mode: string
}) {
  const [templates, setTemplates] = useState<ChargeTemplate[]>([])
  useEffect(() => {
    getChargeTemplates().then(setTemplates).catch(() => setTemplates([]))
  }, [])
  const group = modeGroup(mode)
  const relevant = templates.filter((t) => t.mode === 'all' || t.mode === group)

  const set = (i: number, patch: Partial<ChargeLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const add = (t?: ChargeTemplate) =>
    onChange([...lines, {
      description: t?.name ?? '',
      unit: t?.unit ?? 'shipment',
      qty: 1,
      buy_price: 0,
      sell_price: 0,
      currency: t?.currency ?? 'USD',
    }])
  const totals = totalsByCurrency(lines)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="table-base min-w-[760px]">
          <thead>
            <tr>
              <th>Açıklama</th>
              <th className="w-28">Birim</th>
              <th className="w-20">Miktar</th>
              <th className="w-28">Alış</th>
              <th className="w-28">Satış</th>
              <th className="w-24">Döviz</th>
              <th className="w-28 text-right!">Kâr</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const profit = (Number(l.qty) || 0) * ((Number(l.sell_price) || 0) - (Number(l.buy_price) || 0))
              return (
                <tr key={i}>
                  <td><input className="input" value={l.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
                  <td>
                    <select className="input" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })}>
                      {CHARGE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </td>
                  <td><input className="input" type="number" step="any" value={l.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} /></td>
                  <td><input className="input" type="number" step="any" value={l.buy_price} onChange={(e) => set(i, { buy_price: Number(e.target.value) })} /></td>
                  <td><input className="input" type="number" step="any" value={l.sell_price} onChange={(e) => set(i, { sell_price: Number(e.target.value) })} /></td>
                  <td>
                    <select className="input" value={l.currency} onChange={(e) => set(i, { currency: e.target.value })}>
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className={`text-right font-medium ${profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtNum(profit)}</td>
                  <td>
                    <button type="button" className="btn-ghost p-1.5 text-red-500" onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={() => add()}>
          <Plus className="h-4 w-4" /> Boş kalem
        </button>
        <select className="input w-64!" value="" onChange={(e) => { const t = relevant.find((x) => x.id === e.target.value); if (t) add(t) }}>
          <option value="">+ Şablondan kalem ekle…</option>
          {relevant.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {Object.keys(totals).length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(totals).map(([cur, t]) => (
            <div key={cur} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="mb-1 font-semibold text-slate-700">{cur}</div>
              <div className="flex justify-between"><span className="text-slate-500">Alış</span><span>{fmtNum(t.buy)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Satış</span><span>{fmtNum(t.sell)}</span></div>
              <div className={`flex justify-between font-semibold ${t.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                <span>Kâr</span><span>{fmtNum(t.profit)}{t.sell > 0 ? ` (%${fmtNum((t.profit / t.sell) * 100, 1)})` : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
