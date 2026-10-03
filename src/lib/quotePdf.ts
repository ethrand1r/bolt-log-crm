import type { TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { ChargeLine, ChargeTemplate, Company, Contact, Quote, Settings } from './types'
import { T, chargeRows, date, detailRows } from './quoteText'

const BRAND = '#1e3a8a'

export async function buildQuotePdf(args: {
  quote: Quote
  items: ChargeLine[]
  company: Company | null
  contact: Contact | null
  settings: Settings
  templates: ChargeTemplate[]
}) {
  const { quote, items, company, contact, settings, templates } = args
  const lang = quote.language
  const t = T[lang]

  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  ;(pdfMake as unknown as { addVirtualFileSystem: (v: unknown) => void }).addVirtualFileSystem(vfs)

  // --- Sevkiyat detayları (iki sütunlu)
  const detail = detailRows(quote, lang)
  const half = Math.ceil(detail.length / 2)
  const detailBody = Array.from({ length: half }, (_, i) => {
    const a = detail[i]
    const b = detail[i + half]
    return [
      { text: a[0], style: 'k' }, { text: a[1], style: 'v' },
      { text: b?.[0] ?? '', style: 'k' }, { text: b?.[1] ?? '', style: 'v' },
    ]
  })

  // --- Ücretler (sadece satış fiyatı)
  const { rows, totals } = chargeRows(items, templates, lang)
  const chargeBody: TableCell[][] = [
    [t.desc, t.unit, t.qty, t.price, t.total].map((h, i) => ({ text: h, style: 'th', alignment: i >= 2 ? 'right' : 'left' }) as TableCell),
    ...rows.map((r) => [
      { text: r.desc },
      { text: r.unit, color: '#475569' },
      { text: r.qty, alignment: 'right' },
      { text: r.price, alignment: 'right' },
      { text: r.total, alignment: 'right', bold: true },
    ] as TableCell[]),
    ...totals.map((tot) => [
      { text: t.grand, colSpan: 4, alignment: 'right', bold: true, fillColor: '#eff6ff' }, {}, {}, {},
      { text: tot, alignment: 'right', bold: true, fillColor: '#eff6ff', color: BRAND },
    ] as TableCell[]),
  ]

  const terms = quote.terms || (lang === 'tr' ? settings.quote_terms_tr : settings.quote_terms_en)
  const companyInfo = [
    settings.address, [settings.phone, settings.email].filter(Boolean).join('  |  '), settings.website,
    settings.tax_office || settings.tax_no ? `${settings.tax_office ?? ''} ${settings.tax_no ?? ''}`.trim() : null,
  ].filter(Boolean).join('\n')

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: { title: `${quote.quote_no} - ${company?.name ?? ''}` },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1e293b', lineHeight: 1.2 },
    styles: {
      h: { fontSize: 10, bold: true, color: BRAND, margin: [0, 14, 0, 6] },
      th: { bold: true, color: '#ffffff', fillColor: BRAND, fontSize: 8.5 },
      k: { color: '#64748b', fontSize: 8.5 },
      v: { bold: true },
    },
    footer: (page, pages) => ({
      columns: [
        { text: settings.company_name ?? '', color: '#94a3b8', fontSize: 7.5 },
        { text: `${t.page} ${page} / ${pages}`, alignment: 'right', color: '#94a3b8', fontSize: 7.5 },
      ],
      margin: [40, 15, 40, 0],
    }),
    content: [
      {
        columns: [
          settings.logo_data_url
            ? { image: settings.logo_data_url, fit: [150, 60] }
            : { text: settings.company_name ?? 'BOLT LOG', fontSize: 20, bold: true, color: BRAND },
          {
            stack: [
              settings.logo_data_url ? { text: settings.company_name ?? '', bold: true, fontSize: 10 } : '',
              { text: companyInfo, color: '#475569', fontSize: 8 },
            ],
            alignment: 'right',
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: BRAND }], margin: [0, 10, 0, 10] },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: t.to, style: 'k' },
              { text: company?.name ?? '', bold: true, fontSize: 11 },
              company?.address ? { text: company.address, color: '#475569' } : '',
              contact ? { text: `${t.attn}: ${contact.full_name}${contact.email ? ' - ' + contact.email : ''}`, margin: [0, 3, 0, 0] } : '',
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: t.title, fontSize: 14, bold: true, color: BRAND, alignment: 'right' },
              {
                table: {
                  body: [
                    [{ text: t.no, style: 'k' }, { text: quote.quote_no, bold: true }],
                    [{ text: t.date, style: 'k' }, date(quote.created_at, lang)],
                    [{ text: t.valid, style: 'k' }, { text: date(quote.valid_until, lang), bold: true }],
                  ],
                },
                layout: 'noBorders',
                margin: [0, 4, 0, 0],
              },
            ],
          },
        ],
      },

      { text: t.details, style: 'h' },
      {
        table: { widths: [85, '*', 85, '*'], body: detailBody },
        layout: {
          hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#e2e8f0',
          paddingTop: () => 4, paddingBottom: () => 4,
        },
      },

      { text: t.charges, style: 'h' },
      {
        table: { headerRows: 1, widths: ['*', 70, 40, 85, 90], body: chargeBody },
        layout: {
          hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#e2e8f0',
          paddingTop: () => 5, paddingBottom: () => 5,
        },
      },

      quote.notes ? [{ text: t.notes, style: 'h' }, { text: quote.notes }] : '',
      terms ? [{ text: t.terms, style: 'h' }, { text: terms, fontSize: 8, color: '#475569' }] : '',
      settings.bank_info ? [{ text: t.bank, style: 'h' }, { text: settings.bank_info, fontSize: 8 }] : '',
      { text: t.thanks, margin: [0, 18, 0, 0], italics: true, color: '#475569' },
    ],
  }

  return pdfMake.createPdf(doc)
}
