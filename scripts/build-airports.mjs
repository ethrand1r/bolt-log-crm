// OurAirports verisinden (https://ourairports.com/data/) tarifeli seferi olan, IATA kodlu havalimanları.
// Kullanım: node scripts/build-airports.mjs <airports.csv>
import { readFileSync, writeFileSync } from 'node:fs'
import { parseCsv } from './csv.mjs'

const [head, ...rows] = parseCsv(readFileSync(process.argv[2], 'utf8'))
const ix = Object.fromEntries(head.map((h, i) => [h, i]))
const out = rows
  .filter((r) => r[ix.iata_code] && /^[A-Z]{3}$/.test(r[ix.iata_code]))
  .filter((r) => ['large_airport', 'medium_airport'].includes(r[ix.type]) || (r[ix.type] === 'small_airport' && r[ix.scheduled_service] === 'yes'))
  .filter((r) => r[ix.scheduled_service] === 'yes' || r[ix.type] === 'large_airport')
  .map((r) => [r[ix.iata_code], r[ix.name], r[ix.municipality], r[ix.iso_country]])
  .sort((a, b) => a[0].localeCompare(b[0]))
writeFileSync('public/ref/airports.json', JSON.stringify(out))
console.log(out.length, 'havalimanı')
