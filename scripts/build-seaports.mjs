// UN/LOCODE listesinden (https://unece.org/trade/cefact/unlocode-code-list-country-and-territory)
// "Port" fonksiyonu olan tüm lokasyonlar. Kaynak CSV: https://github.com/datasets/un-locode
// Kullanım: node scripts/build-seaports.mjs <code-list.csv>
import { readFileSync, writeFileSync } from 'node:fs'
import { parseCsv } from './csv.mjs'

const [head, ...rows] = parseCsv(readFileSync(process.argv[2], 'utf8'))
const ix = Object.fromEntries(head.map((h, i) => [h, i]))
const out = rows
  .filter((r) => r[ix.Function]?.[0] === '1')        // 1 = liman
  .filter((r) => r[ix.Change] !== 'X')               // silinmek üzere işaretlenenler hariç
  .map((r) => [r[ix.Country] + r[ix.Location], r[ix.Name], r[ix.Country]])
  .sort((a, b) => a[0].localeCompare(b[0]))
writeFileSync('public/ref/seaports.json', JSON.stringify(out))
console.log(out.length, 'liman')
