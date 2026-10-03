// Ülke / şehir verisini public/geo altına ülke bazında böler.
// Kullanım: node scripts/build-geo.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const countries = require('country-state-city/lib/assets/country.json')
const states = require('country-state-city/lib/assets/state.json')
const cities = require('country-state-city/lib/assets/city.json')

const tr = new Intl.DisplayNames(['tr'], { type: 'region' })
const out = 'public/geo'
mkdirSync(`${out}/cities`, { recursive: true })

const list = countries
  .map((c) => {
    let name = c.name
    try { name = tr.of(c.isoCode) || c.name } catch { /* bilinmeyen kod */ }
    return { code: c.isoCode, name, en: c.name }
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
writeFileSync(`${out}/countries.json`, JSON.stringify(list))

const byCountry = {}
for (const c of cities) (byCountry[c[1]] ??= new Set()).add(c[0])
for (const c of countries) {
  let names
  // Türkiye için 81 il; diğer ülkelerde şehir listesi (yoksa eyalet/bölge)
  if (c.isoCode === 'TR') names = states.filter((s) => s.countryCode === 'TR').map((s) => s.name)
  else names = [...(byCountry[c.isoCode] ?? new Set(states.filter((s) => s.countryCode === c.isoCode).map((s) => s.name)))]
  names.sort((a, b) => a.localeCompare(b, 'tr'))
  writeFileSync(`${out}/cities/${c.isoCode}.json`, JSON.stringify(names))
}
console.log(`${list.length} ülke yazıldı`)
