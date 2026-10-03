// Ülke / şehir verisini public/geo altına ülke bazında böler. Tüm adlar İngilizce yazılır.
// Kullanım: node scripts/build-geo.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const countries = require('country-state-city/lib/assets/country.json')
const states = require('country-state-city/lib/assets/state.json')
const cities = require('country-state-city/lib/assets/city.json')

const en = new Intl.DisplayNames(['en'], { type: 'region' })
const tr = new Intl.DisplayNames(['tr'], { type: 'region' })
const out = 'public/geo'
mkdirSync(`${out}/cities`, { recursive: true })

// Yerel adı kullanılan büyük şehirlerin İngilizce karşılıkları
const EXONYMS = {
  'Köln': 'Cologne', 'Nürnberg': 'Nuremberg', 'Hannover': 'Hanover', 'Braunschweig': 'Brunswick',
  'Frankfurt am Main': 'Frankfurt', 'Torino': 'Turin', 'Antwerpen': 'Antwerp', 'Gent': 'Ghent',
  'Göteborg': 'Gothenburg', 'København': 'Copenhagen', 'Warszawa': 'Warsaw', 'Sevilla': 'Seville',
  'Genève': 'Geneva', 'Zürich': 'Zurich', 'Thessaloníki': 'Thessaloniki', 'A Coruña': 'A Coruna',
}

/** Yerel harfleri Latin karşılıklarına çevirir: "Ağrı" → "Agri", "Łódź" → "Lodz" */
function ascii(s) {
  return s
    .replace(/[ıİ]/g, (c) => (c === 'ı' ? 'i' : 'I'))
    .replace(/ß/g, 'ss').replace(/[Łł]/g, (c) => (c === 'Ł' ? 'L' : 'l')).replace(/[Øø]/g, (c) => (c === 'Ø' ? 'O' : 'o'))
    .replace(/Æ/g, 'Ae').replace(/æ/g, 'ae').replace(/Đ/g, 'D').replace(/đ/g, 'd').replace(/Þ/g, 'Th').replace(/þ/g, 'th')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/Œ/g, 'Oe').replace(/œ/g, 'oe').replace(/Ð/g, 'D').replace(/ð/g, 'd').replace(/Ə/g, 'A').replace(/ə/g, 'a')
    .replace(/Ħ/g, 'H').replace(/ħ/g, 'h').replace(/[–—]/g, '-')
    .replace(/[‘’ʼʻ`´]/g, "'")
}

/** İngilizce ad; Latin dışı alfabe (Kiril, Arap…) içeren kayıtlar atılır */
function cityName(s) {
  const n = ascii(EXONYMS[s] ?? s).trim()
  return /^[\x20-\x7E]+$/.test(n) ? n : null
}

const list = countries
  .map((c) => {
    let name = c.name
    let trName = c.name
    try { name = en.of(c.isoCode) || c.name } catch { /* bilinmeyen kod */ }
    try { trName = tr.of(c.isoCode) || c.name } catch { /* bilinmeyen kod */ }
    // tr: sadece aramada kullanılır (ekranda gösterilmez)
    return { code: c.isoCode, name: name.replace(/’/g, "'"), tr: trName }
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
writeFileSync(`${out}/countries.json`, JSON.stringify(list))

const byCountry = {}
for (const c of cities) (byCountry[c[1]] ??= new Set()).add(c[0])
for (const c of countries) {
  let names
  // Türkiye için 81 il; diğer ülkelerde şehir listesi (yoksa eyalet/bölge)
  if (c.isoCode === 'TR') names = states.filter((s) => s.countryCode === 'TR').map((s) => s.name)
  else names = [...(byCountry[c.isoCode] ?? new Set(states.filter((s) => s.countryCode === c.isoCode).map((s) => s.name)))]
  names = [...new Set(names.map(cityName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en'))
  writeFileSync(`${out}/cities/${c.isoCode}.json`, JSON.stringify(names))
}
console.log(`${list.length} ülke yazıldı`)
