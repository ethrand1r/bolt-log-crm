import { useMemo, useState } from 'react'
import { CheckCircle2, FileUp } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import { LEAD_SOURCES } from '../lib/constants'
import { getCountries, getSectors } from '../lib/refdata'
import { findDup, loadDupIndex, nameKey, domainOf, parseBool, parseCsv, readTextFile, splitList, type DupIndex } from '../lib/leads'
import { norm } from './Combobox'
import { ErrorBox, Field, Modal, Select } from './ui'

/** İçe aktarılabilen alanlar ve başlık eşleştirmesi için anahtar kelimeler */
const FIELDS: { key: string; label: string; hints: string[] }[] = [
  { key: 'name', label: 'Firma adı *', hints: ['firma', 'unvan', 'sirket', 'company', 'name', 'firma adi', 'exhibitor'] },
  { key: 'website', label: 'Web sitesi', hints: ['web', 'website', 'site', 'url', 'internet'] },
  { key: 'emails', label: 'Firma e-posta', hints: ['e-posta', 'eposta', 'email', 'e-mail', 'mail'] },
  { key: 'phones', label: 'Firma telefon', hints: ['telefon', 'tel', 'phone', 'gsm'] },
  { key: 'city', label: 'Şehir', hints: ['sehir', 'il', 'city', 'province'] },
  { key: 'country', label: 'Ülke', hints: ['ulke', 'country'] },
  { key: 'address', label: 'Adres', hints: ['adres', 'address'] },
  { key: 'sectors', label: 'Sektör', hints: ['sektor', 'sector', 'industry', 'urun grubu', 'faaliyet'] },
  { key: 'contact_name', label: 'İrtibat kişisi', hints: ['yetkili', 'kisi', 'ad soyad', 'contact', 'contact name', 'irtibat'] },
  { key: 'contact_title', label: 'Kişi ünvanı', hints: ['gorev', 'unvani', 'pozisyon', 'title', 'position'] },
  { key: 'contact_email', label: 'Kişi e-posta', hints: ['yetkili e-posta', 'kisi e-posta', 'contact email'] },
  { key: 'contact_phone', label: 'Kişi telefon', hints: ['yetkili telefon', 'cep', 'mobile', 'contact phone'] },
  { key: 'linkedin_url', label: 'LinkedIn', hints: ['linkedin'] },
  { key: 'employees', label: 'Çalışan sayısı', hints: ['calisan', 'personel', 'employees', 'employee'] },
  { key: 'exports', label: 'İhracat yapıyor (evet/hayır)', hints: ['ihracat', 'export'] },
  { key: 'est_volume', label: 'Tahmini hacim', hints: ['hacim', 'volume'] },
  { key: 'notes', label: 'Notlar', hints: ['not', 'notes', 'aciklama', 'urunler', 'products'] },
]

type Mapping = Record<string, number>

function guessMapping(headers: string[]): Mapping {
  const h = headers.map((x) => norm(x).trim())
  const used = new Set<number>()
  const m: Mapping = {}
  for (const f of FIELDS) {
    // Önce tam eşleşme, sonra içeren
    let i = h.findIndex((x, j) => !used.has(j) && f.hints.includes(x))
    if (i < 0) i = h.findIndex((x, j) => !used.has(j) && f.hints.some((k) => k.length > 3 && x.includes(k)))
    m[f.key] = i
    if (i >= 0) used.add(i)
  }
  return m
}

interface Prepared {
  row: Record<string, unknown>
  dup: string | null
}

export function LeadImport({ onClose, onDone }: { onClose: () => void; onDone: (count: number) => void }) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [source, setSource] = useState('İhracatçı listesi')
  const [sourceDetail, setSourceDetail] = useState('')
  const [dupIdx, setDupIdx] = useState<DupIndex | null>(null)
  const [refs, setRefs] = useState<{ sectors: string[]; countries: { code: string; name: string; tr: string }[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const headers = rows[0] ?? []
  const body = useMemo(() => rows.slice(1), [rows])

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (/\.xlsx?$/i.test(file.name)) {
      setError('Excel dosyasını önce CSV olarak kaydedin: Dosya > Farklı Kaydet > “CSV UTF-8 (virgülle ayrılmış)”.')
      return
    }
    try {
      const parsed = parseCsv(await readTextFile(file))
      if (parsed.length < 2) throw new Error('Dosyada başlık satırı ve en az bir kayıt olmalı.')
      setFileName(file.name)
      setSourceDetail((s) => s || file.name.replace(/\.[^.]+$/, ''))
      setRows(parsed)
      setMapping(guessMapping(parsed[0]))
      const [idx, sectors, countries] = await Promise.all([loadDupIndex(), getSectors(), getCountries()])
      setDupIdx(idx)
      setRefs({ sectors: sectors.map((s) => s.name), countries })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const prepared: Prepared[] = useMemo(() => {
    if (!dupIdx || !refs) return []
    const sectorByNorm = new Map(refs.sectors.map((s) => [norm(s), s]))
    const findCountry = (v: string) => {
      const n = norm(v).trim()
      return refs.countries.find((c) => c.code.toLowerCase() === n || norm(c.name) === n || norm(c.tr) === n)
    }
    const seenNames = new Set<string>()
    const seenDomains = new Set<string>()
    return body.map((r) => {
      const get = (k: string) => (mapping[k] >= 0 ? (r[mapping[k]] ?? '').trim() : '')
      const name = get('name')
      const website = get('website') || null
      const country = get('country') ? findCountry(get('country')) : refs.countries.find((c) => c.code === 'TR')
      const employees = parseInt(get('employees').replace(/\D/g, ''), 10)
      const row = {
        name, website, address: get('address') || null,
        emails: splitList(get('emails'), /[;,\s]+/), phones: splitList(get('phones'), /[;|/\n]+/),
        city: get('city') || null,
        country: country?.name ?? (get('country') || null), country_code: country?.code ?? null,
        sectors: splitList(get('sectors')).map((s) => sectorByNorm.get(norm(s)) ?? s),
        contact_name: get('contact_name') || null, contact_title: get('contact_title') || null,
        contact_email: get('contact_email') || null, contact_phone: get('contact_phone') || null,
        linkedin_url: get('linkedin_url') || null,
        employees: Number.isNaN(employees) ? null : employees,
        exports: parseBool(get('exports')),
        est_volume: get('est_volume') || null, notes: get('notes') || null,
        source: source || null, source_detail: sourceDetail || null,
      }
      // Dosyanın kendi içindeki tekrarlar da atlanır
      const k = nameKey(name)
      const d = domainOf(website)
      let dup = name ? findDup(dupIdx, name, website) : 'Firma adı boş'
      if (!dup && ((k && seenNames.has(k)) || (d && seenDomains.has(d)))) dup = 'Dosyada tekrar ediyor'
      if (k) seenNames.add(k)
      if (d) seenDomains.add(d)
      return { row, dup }
    })
  }, [body, mapping, dupIdx, refs, source, sourceDetail])

  const toImport = prepared.filter((p) => !p.dup)

  async function importRows() {
    if (mapping.name < 0) return setError('“Firma adı” sütununu eşleştirin.')
    setBusy(true)
    setError(null)
    try {
      for (let i = 0; i < toImport.length; i += 200) {
        setProgress(`${i} / ${toImport.length}`)
        await q(supabase.from('leads').insert(toImport.slice(i, i + 200).map((p) => p.row)))
      }
      onDone(toImport.length)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      setProgress(null)
    }
  }

  const colOptions = headers.map((h, i) => ({ value: String(i), label: h || `Sütun ${i + 1}` }))

  return (
    <Modal open title="Lead listesi içe aktar (CSV)" onClose={onClose} wide>
      <ErrorBox error={error} />
      {!rows.length ? (
        <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-brand-500">
          <FileUp className="mb-2 h-8 w-8 text-slate-400" />
          <span className="font-medium text-slate-700">CSV dosyası seçin</span>
          <span className="mt-1 max-w-md text-xs text-slate-500">
            İlk satır başlık olmalı. Excel listelerini “CSV UTF-8” olarak kaydedin. Noktalı virgül ve virgül ayraçları otomatik tanınır.
          </span>
          <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-slate-600"><b>{fileName}</b> · {body.length} satır</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kaynak (tüm kayıtlar)"><Select options={LEAD_SOURCES} value={source} onChange={setSource} /></Field>
            <Field label="Kaynak detayı"><input className="input" value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} /></Field>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Sütun eşleştirme</h4>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="grid grid-cols-[9.5rem_1fr] items-center gap-2 text-sm">
                  <span className="text-slate-600">{f.label}</span>
                  <Select options={colOptions} placeholder="— yok —" value={mapping[f.key] >= 0 ? String(mapping[f.key]) : ''}
                    onChange={(v) => setMapping({ ...mapping, [f.key]: v === '' ? -1 : Number(v) })} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Ülke sütunu yoksa tüm kayıtlar Türkiye kabul edilir. Birden fazla e-posta/telefon “;” ile ayrılabilir.</p>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Önizleme</h4>
            <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
              <table className="table-base">
                <thead><tr><th>Firma</th><th>Şehir</th><th>Web</th><th>E-posta</th><th>Durum</th></tr></thead>
                <tbody>
                  {prepared.slice(0, 100).map((p, i) => (
                    <tr key={i} className={p.dup ? 'opacity-50' : ''}>
                      <td className="font-medium">{String(p.row.name || '-')}</td>
                      <td>{String(p.row.city ?? '')}</td>
                      <td className="max-w-40 truncate">{String(p.row.website ?? '')}</td>
                      <td className="max-w-48 truncate">{(p.row.emails as string[]).join(', ')}</td>
                      <td className="text-xs">{p.dup ? <span className="text-amber-700">Atlanacak: {p.dup}</span> : <span className="text-emerald-700">Eklenecek</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {prepared.length > 100 && <p className="mt-1 text-xs text-slate-400">İlk 100 satır gösteriliyor.</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <b>{toImport.length}</b> yeni lead eklenecek, <b>{prepared.length - toImport.length}</b> kayıt atlanacak
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={onClose}>Vazgeç</button>
              <button className="btn-primary" disabled={busy || !toImport.length} onClick={importRows}>
                {busy ? `Aktarılıyor… ${progress ?? ''}` : 'İçe aktar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
