import { useEffect, useState } from 'react'
import { Moon, Plus, Save, Sun, Trash2 } from 'lucide-react'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { supabase, q } from '../lib/supabase'
import type { ChargeTemplate, Location, Settings } from '../lib/types'
import { CHARGE_UNITS, CURRENCIES } from '../lib/constants'
import { clean } from '../lib/format'
import { getSettings, invalidateRefData } from '../lib/refdata'
import { ErrorBox, Field, PageHeader, Section, Select, Spinner, useLoad } from '../components/ui'

function CompanySettings() {
  const [f, setF] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { getSettings().then(setF).catch((e) => setError(e.message)) }, [])
  if (!f) return error ? <ErrorBox error={error} /> : <Spinner />
  const set = (k: keyof Settings, v: string | null) => { setF({ ...f, [k]: v }); setMsg(null) }

  function onLogo(file: File | undefined) {
    if (!file) return
    if (file.size > 500_000) return setError('Logo 500 KB’den küçük olmalı.')
    const r = new FileReader()
    r.onload = () => set('logo_data_url', r.result as string)
    r.readAsDataURL(file)
  }

  async function save() {
    setError(null)
    try {
      const { id: _id, ...rest } = f!
      await q(supabase.from('settings').update(clean(rest)).eq('id', 1))
      setMsg('Kaydedildi ✓')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Section title="Şirket bilgileri (teklif PDF'inde görünür)" actions={
      <div className="flex items-center gap-2">
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
        <button className="btn-primary" onClick={save}><Save className="h-4 w-4" /> Kaydet</button>
      </div>
    }>
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Şirket ünvanı"><input className="input" value={f.company_name ?? ''} onChange={(e) => set('company_name', e.target.value)} /></Field>
        <Field label="Web sitesi"><input className="input" value={f.website ?? ''} onChange={(e) => set('website', e.target.value)} /></Field>
        <Field label="Adres" className="sm:col-span-2"><textarea className="input" rows={2} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Telefon"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="E-posta"><input className="input" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Vergi dairesi"><input className="input" value={f.tax_office ?? ''} onChange={(e) => set('tax_office', e.target.value)} /></Field>
        <Field label="Vergi no"><input className="input" value={f.tax_no ?? ''} onChange={(e) => set('tax_no', e.target.value)} /></Field>
        <Field label="Banka bilgileri (IBAN vb.)" className="sm:col-span-2">
          <textarea className="input font-mono" rows={4} value={f.bank_info ?? ''} onChange={(e) => set('bank_info', e.target.value)} />
        </Field>
        <Field label="Varsayılan teklif şartları (TR)"><textarea className="input" rows={4} value={f.quote_terms_tr ?? ''} onChange={(e) => set('quote_terms_tr', e.target.value)} /></Field>
        <Field label="Default quotation terms (EN)"><textarea className="input" rows={4} value={f.quote_terms_en ?? ''} onChange={(e) => set('quote_terms_en', e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <span className="label">Logo (PNG/JPG, max 500 KB)</span>
          <div className="flex items-center gap-4">
            {f.logo_data_url && <img src={f.logo_data_url} alt="Logo" className="h-14 rounded border border-slate-200 bg-surface p-1" />}
            <input type="file" accept="image/png,image/jpeg" className="text-sm" onChange={(e) => onLogo(e.target.files?.[0])} />
            {f.logo_data_url && <button className="btn-ghost text-red-500" onClick={() => set('logo_data_url', null)}>Kaldır</button>}
          </div>
        </div>
      </div>
    </Section>
  )
}

function Locations() {
  const { data, error, reload } = useLoad(() => q<Location[]>(supabase.from('locations').select('*').order('kind').order('code')))
  const [n, setN] = useState({ kind: 'sea', code: '', name: '', country: '' })
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    if (!n.code || !n.name) return
    try {
      await q(supabase.from('locations').insert(clean({ ...n, code: n.code.toUpperCase() })))
      setN({ ...n, code: '', name: '', country: '' })
      invalidateRefData()
      reload()
    } catch (e) { setErr((e as Error).message) }
  }
  async function del(id: string) {
    await q(supabase.from('locations').delete().eq('id', id))
    invalidateRefData()
    reload()
  }

  return (
    <Section title="Limanlar ve havalimanları">
      <ErrorBox error={error ?? err} />
      <div className="mb-3 grid grid-cols-[6rem_6rem_1fr_4rem_auto] gap-2">
        <Select options={[{ value: 'sea', label: 'Liman' }, { value: 'air', label: 'Havalimanı' }]} value={n.kind} onChange={(v) => setN({ ...n, kind: v })} />
        <input className="input" placeholder="Kod" value={n.code} onChange={(e) => setN({ ...n, code: e.target.value })} />
        <input className="input" placeholder="Ad" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <input className="input" placeholder="Ülke" value={n.country} onChange={(e) => setN({ ...n, country: e.target.value })} />
        <button className="btn-secondary" onClick={add}><Plus className="h-4 w-4" /></button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="table-base">
          <tbody>
            {(data ?? []).map((l) => (
              <tr key={l.id} className="group">
                <td className="w-20 text-xs text-slate-500">{l.kind === 'sea' ? 'Liman' : 'Havalimanı'}</td>
                <td className="w-20 font-mono text-xs">{l.code}</td>
                <td>{l.name}</td>
                <td className="text-slate-500">{l.country}</td>
                <td className="w-8"><button className="btn-ghost p-1 text-red-500 opacity-0 group-hover:opacity-100" onClick={() => del(l.id)}><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Templates() {
  const { data, error, reload } = useLoad(() => q<ChargeTemplate[]>(supabase.from('charge_templates').select('*').order('sort')))
  const [n, setN] = useState({ name: '', name_en: '', mode: 'all', unit: 'shipment', currency: 'USD' })
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    if (!n.name) return
    try {
      await q(supabase.from('charge_templates').insert(clean({ ...n, sort: (data?.length ?? 0) + 1 })))
      setN({ ...n, name: '', name_en: '' })
      invalidateRefData()
      reload()
    } catch (e) { setErr((e as Error).message) }
  }
  async function del(id: string) {
    await q(supabase.from('charge_templates').delete().eq('id', id))
    invalidateRefData()
    reload()
  }
  const modeLabel = (m: string) => (m === 'sea' ? 'Deniz' : m === 'air' ? 'Hava' : m === 'road' ? 'Karayolu' : 'Tümü')

  return (
    <Section title="Masraf kalemi şablonları">
      <ErrorBox error={error ?? err} />
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_5.5rem_7rem_5.5rem_auto]">
        <input className="input" placeholder="Ad (TR)" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <input className="input" placeholder="Name (EN)" value={n.name_en} onChange={(e) => setN({ ...n, name_en: e.target.value })} />
        <Select options={[{ value: 'all', label: 'Tümü' }, { value: 'sea', label: 'Deniz' }, { value: 'air', label: 'Hava' }, { value: 'road', label: 'Karayolu' }]} value={n.mode} onChange={(v) => setN({ ...n, mode: v })} />
        <Select options={CHARGE_UNITS} value={n.unit} onChange={(v) => setN({ ...n, unit: v })} />
        <Select options={CURRENCIES} value={n.currency} onChange={(v) => setN({ ...n, currency: v })} />
        <button className="btn-secondary" onClick={add}><Plus className="h-4 w-4" /></button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="table-base">
          <tbody>
            {(data ?? []).map((t) => (
              <tr key={t.id} className="group">
                <td>{t.name}</td>
                <td className="text-slate-500">{t.name_en}</td>
                <td className="text-xs text-slate-500">{modeLabel(t.mode)}</td>
                <td className="text-xs text-slate-500">{CHARGE_UNITS.find((u) => u.value === t.unit)?.label}</td>
                <td className="text-xs">{t.currency}</td>
                <td className="w-8"><button className="btn-ghost p-1 text-red-500 opacity-0 group-hover:opacity-100" onClick={() => del(t.id)}><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Appearance() {
  const [theme, setT] = useState<Theme>(getTheme)
  const choose = (t: Theme) => { setTheme(t); setT(t) }
  return (
    <Section title="Görünüm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-800">Karanlık mod</div>
          <div className="text-xs text-slate-500">Bu tarayıcıda hatırlanır.</div>
        </div>
        <div className="flex rounded-md border border-slate-300 p-0.5 text-sm">
          <button className={`flex items-center gap-1.5 rounded px-3 py-1 ${theme === 'light' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => choose('light')}>
            <Sun className="h-4 w-4" /> Açık
          </button>
          <button className={`flex items-center gap-1.5 rounded px-3 py-1 ${theme === 'dark' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => choose('dark')}>
            <Moon className="h-4 w-4" /> Koyu
          </button>
        </div>
      </div>
    </Section>
  )
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Ayarlar" />
      <div className="space-y-4">
        <Appearance />
        <CompanySettings />
        <div className="grid gap-4 xl:grid-cols-2">
          <Templates />
          <Locations />
        </div>
      </div>
    </>
  )
}
