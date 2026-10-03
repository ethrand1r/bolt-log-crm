import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react'

export interface ComboOption {
  value: string
  label: string
  sub?: string
  /** Aramada ek olarak eşleşecek metin (kod, ülke vb.) */
  keywords?: string
}

/** Türkçe karakter ve büyük/küçük harf duyarsız arama için normalize eder */
export function norm(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const MAX_RESULTS = 80

interface BaseProps {
  options: ComboOption[]
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  /** Sonuç yoksa / tam eşleşme yoksa gösterilecek "ekle" eylemi */
  onCreate?: (query: string) => void
  createLabel?: (query: string) => ReactNode
  /** Listede olmayan değeri serbest metin olarak kabul et */
  allowFree?: boolean
  className?: string
}

type SingleProps = BaseProps & { multiple?: false; value: string | null; onChange: (v: string | null, opt?: ComboOption) => void }
type MultiProps = BaseProps & { multiple: true; value: string[]; onChange: (v: string[]) => void }

export function Combobox(props: SingleProps | MultiProps) {
  const { options, placeholder = 'Seçin…', loading, disabled, onCreate, createLabel, allowFree, className = '' } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected: string[] = props.multiple ? props.value : props.value ? [props.value] : []
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
  const labelOf = (v: string) => byValue.get(v)?.label ?? v

  // Arama için normalize edilmiş metinleri bir kez hazırla (binlerce liman/havalimanı için)
  const index = useMemo(
    () => options.map((o) => ({ o, l: norm(o.label), k: norm(`${o.keywords ?? ''} ${o.sub ?? ''}`) })),
    [options],
  )

  const results = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return options.slice(0, MAX_RESULTS)
    // Sıralama: tam kelime eşleşmesi ("Mersin" → "Mersin (TRMER)", "Mersing" değil) > ile başlayan > içeren
    const exact: ComboOption[] = []
    const starts: ComboOption[] = []
    const contains: ComboOption[] = []
    for (const { o, l, k } of index) {
      if (l === q || l.startsWith(q + ' ') || k.split(' ').includes(q)) exact.push(o)
      else if (l.startsWith(q) || k.split(' ').some((w) => w.startsWith(q))) { if (starts.length < MAX_RESULTS) starts.push(o) }
      else if (contains.length < MAX_RESULTS && (l.includes(q) || k.includes(q))) contains.push(o)
      if (exact.length >= MAX_RESULTS) break
    }
    return [...exact, ...starts, ...contains].slice(0, MAX_RESULTS)
  }, [index, options, query])

  const trimmed = query.trim()
  const exact = trimmed && options.some((o) => norm(o.label) === norm(trimmed))
  const showCreate = Boolean(trimmed && !exact && (onCreate || allowFree))
  const total = results.length + (showCreate ? 1 : 0)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  })

  useEffect(() => { setActive(0) }, [query, open])

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function pick(o: ComboOption) {
    if (props.multiple) {
      const has = props.value.includes(o.value)
      props.onChange(has ? props.value.filter((v) => v !== o.value) : [...props.value, o.value])
      setQuery('')
      input.current?.focus()
    } else {
      props.onChange(o.value, o)
      close()
    }
  }

  function create() {
    if (onCreate) onCreate(trimmed)
    else if (allowFree) pick({ value: trimmed, label: trimmed })
    if (!props.multiple) close()
    else setQuery('')
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, total - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      if (!open) return
      e.preventDefault()
      if (active < results.length) pick(results[active])
      else if (showCreate) create()
    } else if (e.key === 'Escape') close()
    else if (e.key === 'Backspace' && props.multiple && !query && props.value.length) {
      props.onChange(props.value.slice(0, -1))
    } else if (e.key === 'Tab') close()
  }

  const singleText = !props.multiple && props.value ? labelOf(props.value) : ''

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <div
        className={`input flex min-h-[34px] flex-wrap items-center gap-1 py-1! pr-14! ${disabled ? 'pointer-events-none bg-slate-100' : 'cursor-text'}`}
        onClick={() => { if (!disabled) { setOpen(true); input.current?.focus() } }}
      >
        {props.multiple && props.value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-brand-100 px-1.5 py-0.5 text-xs text-brand-700">
            {labelOf(v)}
            <button type="button" className="hover:text-red-600" onClick={(e) => { e.stopPropagation(); props.onChange(props.value.filter((x) => x !== v)) }}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          className="min-w-[4rem] flex-1 bg-transparent outline-none placeholder:text-slate-400"
          value={open ? query : props.multiple ? '' : singleText}
          placeholder={props.multiple ? (props.value.length ? '' : placeholder) : singleText ? '' : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          disabled={disabled}
        />
      </div>
      <div className="absolute top-0 right-2 flex h-[34px] items-center gap-1 text-slate-400">
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {!props.multiple && props.value && !disabled && (
          <button type="button" tabIndex={-1} className="hover:text-slate-700" onClick={() => props.onChange(null)} title="Temizle">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className="pointer-events-none h-4 w-4" />
      </div>

      {open && !disabled && (
        <ul ref={listRef} className="card absolute z-50 mt-1 max-h-64 w-full min-w-[16rem] overflow-y-auto py-1 text-sm shadow-lg">
          {results.map((o, i) => {
            const isSel = selected.includes(o.value)
            return (
              <li
                key={o.value}
                data-i={i}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${i === active ? 'bg-brand-50' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(o) }}
              >
                <span className="w-4 shrink-0">{isSel && <Check className="h-4 w-4 text-brand-600" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.sub && <span className="block truncate text-xs text-slate-500">{o.sub}</span>}
                </span>
              </li>
            )
          })}
          {showCreate && (
            <li
              data-i={results.length}
              className={`flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-1.5 font-medium text-brand-600 ${active === results.length ? 'bg-brand-50' : ''}`}
              onMouseEnter={() => setActive(results.length)}
              onMouseDown={(e) => { e.preventDefault(); create() }}
            >
              <Plus className="h-4 w-4" />
              {createLabel ? createLabel(trimmed) : <>“{trimmed}” ekle</>}
            </li>
          )}
          {results.length === 0 && !showCreate && (
            <li className="px-3 py-2 text-slate-400">{loading ? 'Yükleniyor…' : 'Sonuç bulunamadı'}</li>
          )}
          {results.length === MAX_RESULTS && <li className="px-3 py-1 text-xs text-slate-400">Daha fazla sonuç için yazmaya devam edin…</li>}
        </ul>
      )}
    </div>
  )
}
