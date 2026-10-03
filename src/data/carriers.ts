// Aktif havayolları (kargo taşımacılığı açısından önemli olanlar) - [ad, IATA kodu]
// Listede olmayanlar ekranda "ekle" ile eklenebilir; veritabanındaki carriers tablosuna kaydedilir.
export const AIRLINES: [string, string][] = [
  // Türkiye
  ['Turkish Airlines / Turkish Cargo', 'TK'], ['AJet', 'VF'], ['Pegasus Airlines', 'PC'], ['SunExpress', 'XQ'],
  ['Corendon Airlines', 'XC'], ['MNG Airlines', 'MB'], ['ACT Airlines', '9T'], ['ULS Airlines Cargo', 'GO'],
  // Orta Doğu
  ['Emirates / Emirates SkyCargo', 'EK'], ['Qatar Airways / Qatar Airways Cargo', 'QR'], ['Etihad Airways / Etihad Cargo', 'EY'],
  ['flydubai', 'FZ'], ['Air Arabia', 'G9'], ['Saudia / Saudia Cargo', 'SV'], ['flynas', 'XY'], ['Riyadh Air', 'RX'],
  ['Royal Jordanian', 'RJ'], ['Gulf Air', 'GF'], ['Oman Air', 'WY'], ['Kuwait Airways', 'KU'], ['Jazeera Airways', 'J9'],
  ['Middle East Airlines', 'ME'], ['Iraqi Airways', 'IA'], ['El Al', 'LY'],
  // Afrika
  ['EgyptAir', 'MS'], ['Air Cairo', 'SM'], ['Royal Air Maroc', 'AT'], ['Tunisair', 'TU'], ['Air Algérie', 'AH'],
  ['Ethiopian Airlines', 'ET'], ['Kenya Airways', 'KQ'], ['RwandAir', 'WB'], ['South African Airways', 'SA'],
  ['Astral Aviation', '8V'],
  // Avrupa
  ['Lufthansa / Lufthansa Cargo', 'LH'], ['AeroLogic', '3S'], ['Condor', 'DE'], ['Eurowings', 'EW'], ['Discover Airlines', '4Y'],
  ['Air France', 'AF'], ['KLM Royal Dutch Airlines', 'KL'], ['Martinair Cargo', 'MP'], ['British Airways', 'BA'],
  ['Virgin Atlantic', 'VS'], ['Iberia', 'IB'], ['Air Europa', 'UX'], ['ITA Airways', 'AZ'], ['Swiss International Air Lines', 'LX'],
  ['Edelweiss Air', 'WK'], ['Austrian Airlines', 'OS'], ['Brussels Airlines', 'SN'], ['Luxair', 'LG'], ['Cargolux', 'CV'],
  ['Cargolux Italia', 'C8'], ['SAS Scandinavian Airlines', 'SK'], ['Finnair', 'AY'], ['Icelandair', 'FI'], ['Aer Lingus', 'EI'],
  ['TAP Air Portugal', 'TP'], ['LOT Polish Airlines', 'LO'], ['Aegean Airlines', 'A3'], ['Air Serbia', 'JU'],
  ['Croatia Airlines', 'OU'], ['TAROM', 'RO'], ['Bulgaria Air', 'FB'], ['airBaltic', 'BT'], ['KM Malta Airlines', 'KM'],
  ['Wizz Air', 'W6'], ['Ryanair', 'FR'], ['easyJet', 'U2'], ['ASL Airlines Belgium', '3V'], ['European Air Transport (DHL)', 'QY'],
  ['DHL Air UK', 'D0'],
  // Kafkasya / Orta Asya
  ['Azerbaijan Airlines', 'J2'], ['Silk Way West Airlines', '7L'], ['Silk Way Airlines', 'ZP'], ['Georgian Airways', 'A9'],
  ['Uzbekistan Airways', 'HY'], ['Air Astana', 'KC'], ['SCAT Airlines', 'DV'], ['Turkmenistan Airlines', 'T5'],
  // Asya - Pasifik
  ['Singapore Airlines', 'SQ'], ['Cathay Pacific / Cathay Cargo', 'CX'], ['Korean Air', 'KE'], ['Asiana Airlines', 'OZ'],
  ['Japan Airlines', 'JL'], ['All Nippon Airways', 'NH'], ['Nippon Cargo Airlines', 'KZ'], ['China Airlines', 'CI'],
  ['EVA Air', 'BR'], ['Starlux Airlines', 'JX'], ['Air China / Air China Cargo', 'CA'], ['China Eastern Airlines', 'MU'],
  ['China Cargo Airlines', 'CK'], ['China Southern Airlines', 'CZ'], ['Hainan Airlines', 'HU'], ['Sichuan Airlines', '3U'],
  ['Xiamen Airlines', 'MF'], ['SF Airlines', 'O3'], ['YTO Cargo Airlines', 'YG'], ['Central Airlines', 'I9'],
  ['Air India', 'AI'], ['IndiGo', '6E'], ['SpiceJet', 'SG'], ['Thai Airways', 'TG'], ['Malaysia Airlines', 'MH'],
  ['Garuda Indonesia', 'GA'], ['Vietnam Airlines', 'VN'], ['Philippine Airlines', 'PR'], ['Cebu Pacific', '5J'],
  ['Pakistan International Airlines', 'PK'], ['SriLankan Airlines', 'UL'], ['Biman Bangladesh Airlines', 'BG'],
  ['US-Bangla Airlines', 'BS'], ['Qantas', 'QF'], ['Air New Zealand', 'NZ'], ['Virgin Australia', 'VA'], ['Air Premia', 'YP'],
  // Amerika
  ['American Airlines', 'AA'], ['Delta Air Lines', 'DL'], ['United Airlines', 'UA'], ['Alaska Airlines', 'AS'],
  ['FedEx Express', 'FX'], ['UPS Airlines', '5X'], ['Atlas Air', '5Y'], ['Kalitta Air', 'K4'], ['Polar Air Cargo', 'PO'],
  ['Air Canada', 'AC'], ['WestJet', 'WS'], ['Cargojet', 'W8'], ['LATAM Airlines', 'LA'], ['LATAM Cargo', 'M3'],
  ['Avianca', 'AV'], ['Avianca Cargo', 'QT'], ['Copa Airlines', 'CM'], ['Aeroméxico', 'AM'], ['Volaris', 'Y4'],
  ['GOL Linhas Aéreas', 'G3'], ['Azul Brazilian Airlines', 'AD'], ['Aerolíneas Argentinas', 'AR'],
]

// Aktif konteyner hatları (armatörler)
export const OCEAN_CARRIERS: string[] = [
  'MSC (Mediterranean Shipping Company)', 'Maersk', 'CMA CGM', 'COSCO Shipping Lines', 'Hapag-Lloyd',
  'ONE (Ocean Network Express)', 'Evergreen Line', 'HMM', 'Yang Ming', 'ZIM', 'Wan Hai Lines', 'PIL (Pacific International Lines)',
  'OOCL', 'SITC', 'KMTC', 'X-Press Feeders', 'Sinokor', 'Sea Lead Shipping', 'Emirates Shipping Line', 'TS Lines',
  'RCL (Regional Container Lines)', 'Interasia Lines', 'CU Lines (China United Lines)', 'Global Feeder Shipping',
  'Unifeeder', 'Samskip', 'Admiral Container Lines', 'Arkas Line', 'Turkon Line', 'Medkon Lines', 'Akkon Lines',
  'Sealand (Maersk)', 'APL', 'ANL', 'CNC Line', 'Containerships', 'MacAndrews', 'Gold Star Line',
  'Matson', 'Crowley', 'Seaboard Marine', 'Swire Shipping', 'Ignazio Messina & C.', 'Grimaldi Lines', 'Tarros',
  'Borchard Lines', 'Marfret', 'Nirint Shipping', 'Eimskip', 'Hyundai Glovis', 'Wallenius Wilhelmsen',
  'Höegh Autoliners', 'Bahri',
]
