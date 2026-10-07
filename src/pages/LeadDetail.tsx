import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRightLeft, Ban, CalendarClock, Check, ExternalLink, HelpCircle, Mail, Pencil, Phone, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { supabase, q } from '../lib/supabase'
import type { Lead, LeadActivity, LeadResearch, LeadResearchEvent } from '../lib/types'
import { BUSINESS_TYPES, LEAD_ACTIVITY_TYPES, LEAD_DIRECTIONS, LEAD_OUTCOMES, LEAD_STATUSES, MODES, label } from '../lib/constants'
import { fmtDate, fmtDateTime, todayISO } from '../lib/format'
import { getCountries } from '../lib/refdata'
import { getLeadSearches, mapsUrl, queueResearch } from '../lib/leads'
import { Badge, Empty, ErrorBox, PageHeader, Section, Spinner, useLoad } from '../components/ui'
import { ConvertLeadModal, LeadActivityForm, LeadForm } from '../components/leadForms'
import { ResearchTimeline } from '../components/ResearchBar'
import { ScorePill } from './LeadGeneration'

interface Detail {
  lead: Lead
  activities: LeadActivity[]
  countryNames: Map<string, string>
  countryTr: Map<string, string>
  searchName: string | null
}

const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [modal, setModal] = useState<null | 'edit' | 'activity' | 'convert'>(null)
  const [err, setErr] = useState<string | null>(null)

  const { data, loading, error, reload } = useLoad<Detail>(async () => {
    const [lead, activities, countries, searches] = await Promise.all([
      q<Lead>(supabase.from('leads').select('*').eq('id', id!).single()),
      q<LeadActivity[]>(supabase.from('lead_activities').select('*').eq('lead_id', id!).order('activity_date', { ascending: false })),
      getCountries().catch(() => []),
      getLeadSearches(),
    ])
    return {
      lead, activities, countryNames: new Map(countries.map((c) => [c.code, c.name])), countryTr: new Map(countries.map((c) => [c.code, c.tr])),
      searchName: searches.find((s) => s.id === lead.search_id)?.name ?? null,
    }
  }, [id])

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorBox error={error ?? 'Lead bulunamadı'} />
  const { lead: l, activities, countryNames, countryTr, searchName } = data
  const converted = l.status === 'converted'
  const due = !converted && l.next_action_date && l.next_action_date <= todayISO()
  const researched = l.research_status === 'done' && !!l.research
  const unscored = !researched && (l.research_status !== null || l.lead_type === 'agent')

  async function update(patch: Partial<Lead>) {
    setErr(null)
    try {
      await q(supabase.from('leads').update(patch).eq('id', l.id))
      reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function disqualify() {
    const reason = prompt('Uygun olmama nedeni (opsiyonel):', '')
    if (reason === null) return
    update({ status: 'disqualified', disqualify_reason: reason || null, next_action_date: null, next_action_note: null })
  }

  async function del(table: 'leads' | 'lead_activities', rowId: string, msg: string) {
    if (!confirm(msg)) return
    try {
      await q(supabase.from(table).delete().eq('id', rowId))
      if (table === 'leads') nav('/lead-generation')
      else reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const info: [string, React.ReactNode][] = [
    ['Pazar', l.market && <Link to={`/lead-generation?pazar=${l.market}`} className="text-brand-600 hover:underline">{countryTr.get(l.market) ?? l.market}</Link>],
    ['Arama', l.search_id && searchName && <Link to={`/lead-generation?arama=${l.search_id}`} className="text-brand-600 hover:underline">{searchName}</Link>],
    ['Web', l.website && <a href={href(l.website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">{l.website}<ExternalLink className="h-3 w-3" /></a>],
    ['Google', l.google_place_id && <a href={mapsUrl(l.google_place_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">Haritada gör<ExternalLink className="h-3 w-3" /></a>],
    ['LinkedIn', l.linkedin_url &&<a href={href(l.linkedin_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">Profil<ExternalLink className="h-3 w-3" /></a>],
    ['E-posta', (l.emails ?? []).filter(Boolean).map((e) => <a key={e} href={`mailto:${e}`} className="block hover:text-brand-600">{e}</a>)],
    ['Telefon', (l.phones ?? []).filter(Boolean).map((p) => <a key={p} href={`tel:${p}`} className="block hover:text-brand-600">{p}</a>)],
    ['Adres', l.address],
    ['Kaynak', [l.source, l.source_detail].filter(Boolean).join(' · ')],
    ['Yön', label(LEAD_DIRECTIONS, l.direction)],
    ['Mod', (l.modes ?? []).map((m) => label(MODES, m)).join(', ')],
    ['Ticaret ülkeleri', (l.target_markets ?? []).map((c) => countryNames.get(c) ?? c).join(', ')],
    ['Çalışan', l.employees],
    ['İhracat', l.exports === null ? null : l.exports ? 'Evet' : 'Hayır'],
    ['Hacim', l.est_volume],
  ]

  return (
    <>
      <Link to="/lead-generation" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Lead Generation
      </Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2"><ScorePill score={l.score} lead={l} className="text-sm" />{l.name} <Badge list={LEAD_STATUSES} value={l.status} /></span>}
        subtitle={[(l.sectors ?? []).join(', '), [l.city, l.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setModal('edit')}><Pencil className="h-4 w-4" /> Düzenle</button>
            {converted ? (
              l.company_id && <button className="btn-primary" onClick={() => nav(`/firmalar/${l.company_id}`)}><ArrowRightLeft className="h-4 w-4" /> Firmaya git</button>
            ) : (
              <>
                <button className="btn-secondary" onClick={() => setModal('activity')}><Plus className="h-4 w-4" /> Temas</button>
                {l.status === 'disqualified'
                  ? <button className="btn-secondary" onClick={() => update({ status: 'new', disqualify_reason: null })}><RotateCcw className="h-4 w-4" /> Yeniden aç</button>
                  : <button className="btn-secondary" onClick={disqualify}><Ban className="h-4 w-4" /> Uygun değil</button>}
                <button className="btn-primary" onClick={() => setModal('convert')}><ArrowRightLeft className="h-4 w-4" /> Firmaya dönüştür</button>
              </>
            )}
            <button className="btn-danger" onClick={() => del('leads', l.id, `"${l.name}" lead'i ve temas geçmişi silinecek. Emin misiniz?`)}><Trash2 className="h-4 w-4" /></button>
          </>
        }
      />
      <ErrorBox error={err} />
      {l.status === 'disqualified' && l.disqualify_reason && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Uygun değil: {l.disqualify_reason}</div>
      )}
      {converted && (
        <div className="mb-4 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-slate-700">
          {fmtDate(l.converted_at)} tarihinde firmaya dönüştürüldü.{!l.company_id && ' (Firma kaydı daha sonra silinmiş.)'}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Section title="Firma bilgileri">
            <dl className="space-y-2 text-sm">
              {info.filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[5rem_1fr] gap-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
              {l.notes && <div className="mt-3 rounded-md bg-amber-50 p-2 whitespace-pre-line text-slate-700">{l.notes}</div>}
            </dl>
          </Section>

          <Section title="İrtibat kişisi">
            {!l.contact_name && !l.contact_email && !l.contact_phone ? <Empty>Kişi bilgisi yok.</Empty> : (
              <div className="text-sm">
                <div className="font-medium">{l.contact_name}</div>
                {l.contact_title && <div className="text-xs text-slate-500">{l.contact_title}</div>}
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600">
                  {l.contact_email && <a href={`mailto:${l.contact_email}`} className="flex items-center gap-1 hover:text-brand-600"><Mail className="h-3 w-3" />{l.contact_email}</a>}
                  {l.contact_phone && <a href={`tel:${l.contact_phone}`} className="flex items-center gap-1 hover:text-brand-600"><Phone className="h-3 w-3" />{l.contact_phone}</a>}
                </div>
              </div>
            )}
          </Section>

          <Section title={researched ? `Puan: ${l.score} / 100 (araştırmaya göre)` : unscored ? 'Puan' : `Puan: ${l.score} / 100`}>
            {unscored ? <Empty>{l.lead_type === 'agent' && !l.research_status
                ? 'Acente / forwarder kayıtları müşteri kriterleriyle puanlanmaz; internetten araştırılınca puanlanır.'
                : 'Firma internetten araştırıldıktan sonra puanlanacak.'}</Empty>
              : !l.score_items?.length ? <Empty>Aktif puanlama kriteri yok.</Empty> : (
              <ul className="space-y-2 text-sm">
                {l.score_items.map((s) => (
                  <li key={s.key}>
                    <div className="flex items-center gap-2">
                      {s.ok === true ? <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        : s.ok === false ? <X className="h-4 w-4 shrink-0 text-red-500" />
                        : <HelpCircle className="h-4 w-4 shrink-0 text-slate-400" />}
                      <span className={s.ok ? 'text-slate-800' : 'text-slate-500'}>{s.label}</span>
                      <span className="ml-auto text-xs whitespace-nowrap text-slate-400 tabular-nums">{s.ok ? `+${s.weight}` : `0 / ${s.weight}`}</span>
                    </div>
                    {s.evidence && <p className="mt-0.5 ml-6 text-xs text-slate-500">{s.evidence}</p>}
                  </li>
                ))}
                {!researched && l.score_items.some((s) => s.ok === null) && (
                  <li className="pt-1 text-xs text-slate-400"><HelpCircle className="mr-1 inline h-3 w-3" />Bilgi girilmemiş. Lead’i düzenleyip tamamlarsanız puan güncellenir.</li>
                )}
              </ul>
            )}
            {!unscored && (
              <p className="mt-3 text-xs text-slate-400">
                {researched
                  ? 'Her kriter internette bulunan kanıta göre işaretlendi; bulunamayan bilgi (?) puan getirmez.'
                  : <>{l.search_id ? 'Sektör, bölge ve pazar hedefleri aramadan' : 'Aramaya bağlı olmadığı için sektör, bölge ve pazar kriterleri kullanılmıyor'}
                    ; ağırlıklar <Link to="/ayarlar" className="hover:underline">Ayarlar › Lead puanlama</Link>’dan gelir.</>}
              </p>
            )}
          </Section>

          <ResearchSection lead={l} onQueued={reload} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          {!converted && (
            <div className={`card flex flex-wrap items-center gap-3 px-4 py-3 ${due ? 'border-red-200 bg-red-50' : ''}`}>
              <CalendarClock className={`h-5 w-5 ${due ? 'text-red-600' : 'text-slate-400'}`} />
              {l.next_action_date || l.next_action_note ? (
                <div className="text-sm">
                  <div className={`font-medium ${due ? 'text-red-700' : 'text-slate-800'}`}>
                    Sonraki adım{l.next_action_date && `: ${fmtDate(l.next_action_date)}`}{due && ' (zamanı geldi)'}
                  </div>
                  {l.next_action_note && <div className="text-slate-600">{l.next_action_note}</div>}
                </div>
              ) : (
                <div className="text-sm text-slate-500">Planlanmış bir sonraki adım yok.</div>
              )}
              <button className="btn-secondary ml-auto" onClick={() => setModal('activity')}><Plus className="h-4 w-4" /> Temas kaydet</button>
            </div>
          )}

          <Section title={`Temas geçmişi (${activities.length})`}>
            {activities.length === 0 ? <Empty>Henüz temas yok. Arama, e-posta ve LinkedIn mesajlarını buraya kaydedin.</Empty> : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                {activities.map((a) => (
                  <li key={a.id} className="group relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-500" />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{label(LEAD_ACTIVITY_TYPES, a.type)}</span>
                        <Badge list={LEAD_OUTCOMES} value={a.outcome} />
                        <span className="text-xs text-slate-500">{fmtDateTime(a.activity_date)}</span>
                      </div>
                      <button className="btn-ghost p-1 text-red-500 opacity-0 group-hover:opacity-100" onClick={() => del('lead_activities', a.id, 'Temas kaydı silinsin mi?')}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {a.note && <p className="mt-0.5 whitespace-pre-line text-slate-600">{a.note}</p>}
                    {a.next_action_date && (
                      <p className="mt-0.5 text-xs text-slate-500">→ {fmtDate(a.next_action_date)}{a.next_action_note && `: ${a.next_action_note}`}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Section>
          <p className="text-xs text-slate-400">Eklendi {fmtDate(l.created_at)} · Güncellendi {fmtDate(l.updated_at)}</p>
        </div>
      </div>

      {modal === 'edit' && <LeadForm lead={l} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
      {modal === 'activity' && <LeadActivityForm lead={l} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
      {modal === 'convert' && <ConvertLeadModal lead={l} onClose={() => setModal(null)} onDone={(cid) => nav(`/firmalar/${cid}`)} />}
    </>
  )
}

/** İnternet araştırmasının sonucu ve "araştır / yeniden araştır" */
function ResearchSection({ lead: l, onQueued }: { lead: Lead; onQueued: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const r = l.research_status === 'done' ? l.research : null
  const converted = l.status === 'converted'
  const running = l.research_status === 'running'
  const [events, setEvents] = useState<LeadResearchEvent[]>([])

  // Son denemenin adımları. Araştırma sürerken birkaç saniyede bir yenilenir, bitince lead yeniden yüklenir.
  // Sıradaysa lead ara ara yeniden yüklenir ki araştırma başlayınca canlı görünüme geçsin.
  useEffect(() => {
    if (l.research_status === 'pending') {
      setEvents([])
      const t = setInterval(onQueued, 10_000)
      return () => clearInterval(t)
    }
    let stop = false
    const since = new Date(new Date(l.research_started_at ?? 0).getTime() - 5000).toISOString()
    const loadEvents = async () => {
      const rows = await q<LeadResearchEvent[]>(supabase.from('lead_research_events').select('*')
        .eq('lead_id', l.id).gte('created_at', since).order('id')).catch(() => [] as LeadResearchEvent[])
      if (stop) return
      setEvents(rows)
      const last = rows[rows.length - 1]
      if (running && last && (last.kind === 'done' || last.kind === 'error')) onQueued()
    }
    loadEvents()
    const t = running ? setInterval(loadEvents, 4000) : undefined
    return () => { stop = true; clearInterval(t) }
  }, [l.id, l.research_status, l.research_started_at])

  async function queue() {
    setBusy(true)
    setErr(null)
    try {
      await queueResearch([l.id])
      onQueued()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const button = !converted && !['pending', 'running', 'batched'].includes(l.research_status ?? '') && (
    <button className="btn-ghost text-xs" disabled={busy} onClick={queue}>
      <Sparkles className="h-3.5 w-3.5" /> {l.research_status ? 'Yeniden araştır' : 'İnternetten araştır'}
    </button>
  )
  const yn = (v: string | undefined) => (v === 'yes' ? 'Evet' : v === 'no' ? 'Hayır' : 'Bilinmiyor')

  return (
    <Section title="İnternet araştırması" actions={button || undefined}>
      <ErrorBox error={err} />
      {l.research_status === 'pending' && (
        <Empty>{l.research_priority ? 'Sırada. Birkaç dakika içinde araştırılacak.' : 'Sırada. Toplu (indirimli) araştırmaya gönderilecek.'}</Empty>
      )}
      {l.research_status === 'batched' && <Empty>Toplu (indirimli) araştırmada. Sonuç genelde bir saat içinde gelir.</Empty>}
      {l.research_status === 'running' && <ResearchTimeline events={events} live />}
      {l.research_status === 'failed' && (
        <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">Araştırma tamamlanamadı{l.research_error && `: ${l.research_error}`}</div>
      )}
      {!l.research_status && <Empty>Bu lead henüz araştırılmadı.</Empty>}
      {r && (
        <div className="space-y-2 text-sm">
          <p className="text-slate-700">{r.summary}</p>
          <dl className="space-y-1.5">
            {([
              ['Tür', label(BUSINESS_TYPES, r.business_type)],
              ['Ürünler', r.products],
              ['İhracat', yn(r.exports)],
              ['İthalat', yn(r.imports)],
              ['Pazarlar', (r.export_markets ?? []).join(', ')],
            ] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[5rem_1fr] gap-2">
                <dt className="text-slate-500">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {r.relevant === 'no' && r.not_relevant_reason && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">Uygun değil: {r.not_relevant_reason}</p>
          )}
          {(r.sources ?? []).length > 0 && (
            <div>
              <div className="text-xs text-slate-500">Kaynaklar</div>
              {r.sources.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-600 hover:underline">{u}</a>
              ))}
            </div>
          )}
          {l.research_prev && <ResearchCompare prev={l.research_prev} next={r} />}
          {events.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-800">Araştırma adımları ({events.length})</summary>
              <div className="mt-2"><ResearchTimeline events={events} /></div>
            </details>
          )}
          <p className="text-xs text-slate-400">
            {l.researched_at && fmtDateTime(l.researched_at)}
            {r.method === 'rules' ? ' · Kural ile değerlendirildi (Claude kullanılmadı, ücretsiz)' : typeof r.cost_usd === 'number' && ` · ${r.model ?? ''} · ~$${r.cost_usd.toFixed(4)}`}
            {' · '}Boş olan iletişim ve firma bilgileri araştırmadan dolduruldu.
          </p>
        </div>
      )}
    </Section>
  )
}

/** Önceki ve yeni araştırmanın puanı ve kriterleri yan yana (model / ayar değişikliğinin kaliteyi bozup bozmadığını görmek için) */
function ResearchCompare({ prev, next }: { prev: LeadResearch; next: LeadResearch }) {
  const mark = (ok: boolean | null | undefined) =>
    ok === true ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : ok === false ? <X className="h-3.5 w-3.5 text-red-500" /> : <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
  const prevItems = new Map((prev.score_items ?? []).map((i) => [i.key, i]))
  const shortModel = (m?: string) => (m ?? '').replace(/^claude-/, '') || 'önceki'
  const cost = (c?: number) => (typeof c === 'number' ? ` · $${c.toFixed(3)}` : '')
  return (
    <details className="rounded-md border border-slate-200 p-2 text-xs" open>
      <summary className="cursor-pointer font-medium text-slate-700">
        Önceki araştırmayla karşılaştırma: {prev.score} → {next.score}
      </summary>
      <table className="mt-2 w-full">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left font-normal">Kriter</th>
            <th className="font-normal">{shortModel(prev.model)}{cost(prev.cost_usd)}</th>
            <th className="font-normal">{shortModel(next.model)}{cost(next.cost_usd)}</th>
          </tr>
        </thead>
        <tbody>
          {(next.score_items ?? []).map((i) => {
            const old = prevItems.get(i.key)
            const changed = (old?.ok ?? null) !== i.ok
            return (
              <tr key={i.key} className={changed ? 'bg-amber-50' : ''}>
                <td className="py-0.5 pr-2 text-slate-600" title={[old?.evidence && `Önceki: ${old.evidence}`, i.evidence && `Yeni: ${i.evidence}`].filter(Boolean).join('\n')}>{i.label}</td>
                <td><span className="flex justify-center">{mark(old?.ok)}</span></td>
                <td><span className="flex justify-center">{mark(i.ok)}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-1 text-slate-400">Sarı satırlar farklı değerlendirilen kriterler; kanıtları görmek için satırın üzerine gelin.</p>
    </details>
  )
}
