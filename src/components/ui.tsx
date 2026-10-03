import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { opt, type Option } from '../lib/constants'

export function Badge({ list, value, className = '' }: { list: Option[]; value: string | null | undefined; className?: string }) {
  const o = opt(list, value)
  if (!value) return null
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${o?.color ?? 'bg-slate-100 text-slate-700'} ${className}`}>
      {o?.label ?? value}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

export function Section({ title, children, actions, className = '' }: { title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-10 text-slate-400 ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-400">{children}</div>
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null
  return <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
}

export function Modal({ open, onClose, title, children, wide, actions }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
  actions?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    // İç içe modallarda Esc sadece en üsttekini kapatır
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const all = document.querySelectorAll('[data-modal]')
      if (all[all.length - 1] === ref.current) onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  // Portal: modal formları sayfadaki diğer formların içine gömülmez.
  // submit olayı React ağacında üst forma taşmasın diye durdurulur.
  return createPortal(
    <div ref={ref} data-modal className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16" onMouseDown={onClose}
      onSubmit={(e) => e.stopPropagation()}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <div className="ml-auto flex items-center gap-2">{actions}</div>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function Select({ options, value, onChange, placeholder, className = '' }: {
  options: Option[] | string[]
  value: string | null | undefined
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const opts: Option[] = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <select className={`input ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

/** Basit veri yükleme hook'u */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(fn, deps)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await run())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [run])
  useEffect(() => {
    reload()
  }, [reload])
  return { data, loading, error, reload, setData }
}
