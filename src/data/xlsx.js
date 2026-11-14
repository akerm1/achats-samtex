/* ------------------------------------------------------------------ */
/* Classeur Excel (.xlsx) sans dépendance                              */
/*                                                                     */
/* Un .xlsx est une archive ZIP de quelques fichiers XML. Le navigateur */
/* sait déjà tout faire sauf le ZIP : on l'écrit ici, en méthode        */
/* « stored » (sans compression), qui est parfaitement légale et tient  */
/* en quelques dizaines de lignes. Aucune bibliothèque, aucun build :   */
/* le fichier s'ouvre dans Excel, LibreOffice et Google Sheets.         */
/*                                                                     */
/* Parts produites :                                                    */
/*   [Content_Types].xml          types des parties                     */
/*   _rels/.rels                  pointeur vers le classeur             */
/*   xl/workbook.xml              la liste des feuilles                 */
/*   xl/_rels/workbook.xml.rels   pointeur vers chaque feuille          */
/*   xl/worksheets/sheetN.xml     les cellules                          */
/* ------------------------------------------------------------------ */

/* --- ZIP ---------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const encoder = new TextEncoder()

/**
 * Archive ZIP « stored » : chaque fichier est recopié tel quel.
 * @param {{name: string, text: string}[]} files
 * @returns {Uint8Array}
 */
function zip(files) {
  const chunks = []
  const central = []
  let offset = 0
  /* Heure DOS fixe (01/01/1980 00:00) : deux exports identiques donnent
     alors exactement le même fichier, ce qui rend les tests possibles. */
  const dosTime = 0
  const dosDate = 0x0021

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.text)
    const crc = crc32(data)

    const local = new Uint8Array(30 + name.length)
    const view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true) // signature
    view.setUint16(4, 20, true) // version nécessaire
    view.setUint16(6, 0x0800, true) // noms en UTF-8
    view.setUint16(8, 0, true) // méthode : stored
    view.setUint16(10, dosTime, true)
    view.setUint16(12, dosDate, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, data.length, true)
    view.setUint32(22, data.length, true)
    view.setUint16(26, name.length, true)
    view.setUint16(28, 0, true) // extra
    local.set(name, 30)
    chunks.push(local, data)

    const entry = new Uint8Array(46 + name.length)
    const entryView = new DataView(entry.buffer)
    entryView.setUint32(0, 0x02014b50, true) // signature
    entryView.setUint16(4, 20, true) // version d'écriture
    entryView.setUint16(6, 20, true) // version nécessaire
    entryView.setUint16(8, 0x0800, true)
    entryView.setUint16(10, 0, true)
    entryView.setUint16(12, dosTime, true)
    entryView.setUint16(14, dosDate, true)
    entryView.setUint32(16, crc, true)
    entryView.setUint32(20, data.length, true)
    entryView.setUint32(24, data.length, true)
    entryView.setUint16(28, name.length, true)
    entryView.setUint16(30, 0, true)
    entryView.setUint16(32, 0, true) // commentaire
    entryView.setUint16(34, 0, true) // disque
    entryView.setUint16(36, 0, true) // attributs internes
    entryView.setUint32(38, 0, true) // attributs externes
    entryView.setUint32(42, offset, true) // position de l'entrée locale
    entry.set(name, 46)
    central.push(entry)

    offset += local.length + data.length
  }

  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const total = offset + centralSize + end.length
  const out = new Uint8Array(total)
  let cursor = 0
  for (const chunk of [...chunks, ...central, end]) {
    out.set(chunk, cursor)
    cursor += chunk.length
  }
  return out
}

/* --- XML ---------------------------------------------------------- */

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    /* Les caractères de contrôle ne sont pas admis dans XML 1.0. */
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

/** 1 → A, 27 → AA. */
function columnName(index) {
  let name = ''
  let value = index
  while (value > 0) {
    const rest = (value - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function cellXml(ref, value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

function sheetXml({ columns, rows }) {
  const width = columns.length
  const cols = columns
    .map((column, index) => {
      const size = column.width || 18
      return `<col min="${index + 1}" max="${index + 1}" width="${size}" customWidth="1"/>`
    })
    .join('')

  const headerRow = `<row r="1">${columns
    .map((column, index) => cellXml(`${columnName(index + 1)}1`, column.label))
    .join('')}</row>`

  const body = rows
    .map((row, rowIndex) => {
      const number = rowIndex + 2
      const cells = columns
        .map((column, index) => cellXml(`${columnName(index + 1)}${number}`, row[column.key]))
        .join('')
      return `<row r="${number}">${cells}</row>`
    })
    .join('')

  return `${HEADER}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${headerRow}${body}</sheetData>
</worksheet>`
}

/** Excel refuse certains caractères dans un nom de feuille (31 max). */
function safeSheetName(name, index, used) {
  let base = String(name || `Feuille ${index + 1}`)
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
    .slice(0, 31)
  if (!base) base = `Feuille ${index + 1}`
  let candidate = base
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const tail = ` ${suffix}`
    candidate = base.slice(0, 31 - tail.length) + tail
    suffix += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

/**
 * Construit un classeur complet.
 * @param {{name: string, columns: {key: string, label: string, width?: number}[], rows: object[]}[]} sheets
 * @returns {Uint8Array}
 */
export function buildXlsx(sheets) {
  const used = new Set()
  const list = (sheets || []).filter((sheet) => sheet && Array.isArray(sheet.columns))
  if (!list.length) throw new Error('Aucune feuille à exporter.')

  const names = list.map((sheet, index) => safeSheetName(sheet.name, index, used))

  const contentTypes = `${HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${list
  .map(
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  )
  .join('\n')}
</Types>`

  const rootRels = `${HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbook = `${HEADER}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names
    .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('')}</sheets>
</workbook>`

  const workbookRels = `${HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list
  .map(
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  )
  .join('\n')}
</Relationships>`

  const files = [
    { name: '[Content_Types].xml', text: contentTypes },
    { name: '_rels/.rels', text: rootRels },
    { name: 'xl/workbook.xml', text: workbook },
    { name: 'xl/_rels/workbook.xml.rels', text: workbookRels },
    ...list.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      text: sheetXml(sheet),
    })),
  ]

  return zip(files)
}
