/**
 * AI-powered file parsing — fast path for CSV/Excel, AI-assisted for PDF.
 *
 * CSV/Excel strategy (fast):
 *   1. One Haiku call to detect column layout from headers + a few sample rows
 *   2. Parse all rows locally using column indices — no more per-chunk AI calls
 *   Result: ~3s instead of ~60s for typical vendor files
 *
 * PDF strategy (unchanged):
 *   Chunks of raw text sent to Claude in parallel (PDFs have no column structure)
 */

import Anthropic from '@anthropic-ai/sdk'
import { extractUnitSizeFromName } from '@/lib/utils/parseUnitSize'

export interface ParsedRow {
  row_index: number
  vendor_item_number: string | null
  item_name: string | null
  unit_size: string | null
  price: number
}

export interface ParseError {
  location: string
  problem: string
  fix: string
}

export interface ParseResult {
  success: true
  rows: ParsedRow[]
  parse_errors: ParseError[]
  column_mapping: Record<string, string>
}

export interface ParseFailure {
  success: false
  error: string
  suggestions: string[]
}

// ── File extraction ────────────────────────────────────────────────────────

async function extractRawRows(
  buffer: ArrayBuffer,
  filename: string
): Promise<{ headers: string[]; rows: string[][]; type: string }> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
      const data = await pdfParse(Buffer.from(buffer))

      if (!data.text || data.text.trim().length < 20) {
        throw new Error(
          'This PDF appears to be a scanned image and cannot be read as text. ' +
          'Please export your order guide as CSV or Excel from your ordering system instead.'
        )
      }

      const lines = data.text.split('\n').map((l: string) => [l.trim()]).filter((l: string[]) => l[0])
      return { headers: [], rows: lines, type: 'pdf' }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('scanned') || msg.includes('image') || msg.includes('export')) throw new Error(msg)
      throw new Error(
        'Could not read this PDF. It may be password-protected or corrupted. ' +
        'Try exporting as CSV or Excel instead.'
      )
    }
  }

  // XLSX / XLS / CSV
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const all: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][]

  const firstData = all.findIndex(r => r.some(c => String(c).trim()))
  if (firstData === -1) return { headers: [], rows: [], type: ext }

  // Detect Sysco row-typed format: rows start with H (file header), F (field names),
  // C (category headings), P (product rows). Standard files never have this pattern.
  const firstColSample = all.slice(firstData, firstData + 6).map(r => String(r[0] ?? '').trim().toUpperCase())
  if (firstColSample.includes('H') && firstColSample.includes('F')) {
    const fRowIdx = all.findIndex(r => String(r[0] ?? '').trim().toUpperCase() === 'F')
    if (fRowIdx >= 0) {
      // Strip the single-letter type indicator from every row
      const headers = all[fRowIdx].slice(1).map(c => String(c ?? '').trim())
      const dataRows = all
        .filter(r => String(r[0] ?? '').trim().toUpperCase() === 'P')
        .map(r => r.slice(1).map(c => String(c ?? '').trim()))
      console.log(`[parseUpload] Detected Sysco row-typed format — ${dataRows.length} product rows, headers from F row`)
      return { headers, rows: dataRows, type: ext }
    }
  }

  const headers = all[firstData].map(c => String(c ?? '').trim())
  const dataRows = all.slice(firstData + 1)
    .filter(r => r.some(c => String(c).trim()))
    .map(r => r.map(c => String(c ?? '').trim()))

  return { headers, rows: dataRows, type: ext }
}

// ── Column detection (1 Haiku call, CSV/Excel only) ───────────────────────

interface ColumnIndices {
  itemNumber: number  // -1 if absent
  itemName: number
  unitSize: number    // -1 if absent (combined column)
  price: number
  pack: number        // -1 if absent (separate pack-count column)
  packSize: number    // -1 if absent (separate size-per-pack column)
  packUnit: number    // -1 if absent (separate unit column)
  perLb: number       // -1 if absent; "Y" means price is $/lb already, not a case total
}

const DETECT_COLUMNS_TOOL: Anthropic.Tool = {
  name: 'detect_columns',
  description: 'Identify which spreadsheet columns contain the vendor item number, item name, pack/unit size, and price. Some vendors (like Sysco) use separate Pack, Size, and Unit columns instead of a single unit-size column.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fatal_error: {
        type: 'string',
        description: 'Set only if there is no identifiable price column or the file is unreadable. Leave empty for normal files.',
      },
      fatal_suggestions: { type: 'array', items: { type: 'string' } },
      item_number_col: {
        type: 'string',
        description: 'Exact header text for the vendor SKU/item number column. Empty string if absent.',
      },
      item_name_col: {
        type: 'string',
        description: 'Exact header text for the item name/description column.',
      },
      unit_size_col: {
        type: 'string',
        description: 'Exact header text for a combined pack/unit-size column (e.g. "Pack Size", "UOM", "Unit"). Empty string if the file uses separate Pack/Size/Unit columns instead.',
      },
      pack_col: {
        type: 'string',
        description: 'Exact header for number of packs per case (e.g. "Pack", "Ct", "Qty", "Count"). Empty string if absent or if already covered by unit_size_col.',
      },
      pack_size_col: {
        type: 'string',
        description: 'Exact header for weight/size per individual pack (e.g. "Size", "Wt", "Weight", "Each Size", "Each Wt"). Empty string if absent.',
      },
      pack_unit_col: {
        type: 'string',
        description: 'Exact header for the unit of measure per pack (e.g. "Unit", "UOM", "UofM", "Measure"). Empty string if absent.',
      },
      price_col: {
        type: 'string',
        description: 'Exact header text for the price column. If multiple price columns exist, pick "Your Price", "Net Price", or "Case Price" over "List Price".',
      },
    },
    required: ['item_name_col', 'price_col'],
  },
}

async function detectColumnIndices(
  headers: string[],
  sampleRows: string[][],
  filename: string,
  fileType: string,
  client: Anthropic
): Promise<{ indices: ColumnIndices; columnMapping: Record<string, string> } | { error: string; suggestions: string[] }> {

  const sampleText = [
    `Headers: ${headers.join('\t')}`,
    '',
    'Sample rows:',
    ...sampleRows.slice(0, 8).map((r, i) => `Row ${i + 1}: ${r.join('\t')}`),
  ].join('\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    system: `You identify columns in vendor order guide spreadsheets for a restaurant.

Some vendors (like Sysco, US Foods) use SEPARATE columns for pack count, pack size, and unit instead of a single combined unit-size column. Detect both patterns.

Column meanings:
- ITEM NUMBER: vendor SKU. Headers: "Item #", "SKU", "Cat #", "Code". May be absent.
- ITEM NAME: product description. Headers: "Description", "Item Description", "Product", "Name". Always present.
- UNIT SIZE (combined): e.g. "Pack Size", "UOM", "Unit" — a single column like "4/5LB" or "12/7OZ". Use this if present.
- PACK (separate): number of packs per case. Headers: "Pack", "Ct", "Qty", "Count". Use when size is split across columns.
- PACK SIZE (separate): weight or size per pack. Headers: "Size", "Wt", "Weight", "Each Size", "Each Wt".
- PACK UNIT (separate): unit of the pack size. Headers: "Unit", "UOM", "UofM", "Measure" (e.g. LB, OZ, GAL).
- PRICE: what the restaurant pays per case. Headers: "Price", "Unit Price", "Your Price", "Net Price", "Case Price", "Each". If multiple price columns, pick "Your Price" or "Net Price" over "List Price". Always present.`,
    tools: [DETECT_COLUMNS_TOOL],
    tool_choice: { type: 'tool', name: 'detect_columns' },
    messages: [{
      role: 'user',
      content: `FILE: ${filename} (${fileType.toUpperCase()})\n\n${sampleText}`,
    }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use') as
    | { type: 'tool_use'; input: Record<string, unknown> }
    | undefined

  if (!toolUse) {
    return { error: 'Could not detect column layout from this file.', suggestions: ['Try exporting as CSV from your ordering system.'] }
  }

  const result = toolUse.input
  if (result.fatal_error) {
    return {
      error: String(result.fatal_error),
      suggestions: (result.fatal_suggestions as string[]) ?? [],
    }
  }

  // Map column names back to indices (case-insensitive, partial match as fallback)
  const headerLower = headers.map(h => h.toLowerCase().trim())

  function findIndex(colName: unknown): number {
    if (!colName || typeof colName !== 'string' || !colName.trim()) return -1
    const name = colName.trim().toLowerCase()
    const exact = headerLower.indexOf(name)
    if (exact >= 0) return exact
    // Partial match fallback
    const partial = headerLower.findIndex(h => h.includes(name) || name.includes(h))
    return partial
  }

  // Detect "Per Lb" / "Per Unit" flag column without asking the AI — it's a vendor-specific
  // marker (used by Sysco) indicating that the price is already $/lb, not a case total.
  const perLbIdx = headerLower.findIndex(h =>
    h === 'per lb' || h === 'per_lb' || h === 'perlb' || h === 'per unit' || h === 'per_unit'
  )

  const indices: ColumnIndices = {
    itemNumber: findIndex(result.item_number_col),
    itemName:   findIndex(result.item_name_col),
    unitSize:   findIndex(result.unit_size_col),
    price:      findIndex(result.price_col),
    pack:       findIndex(result.pack_col),
    packSize:   findIndex(result.pack_size_col),
    packUnit:   findIndex(result.pack_unit_col),
    perLb:      perLbIdx,
  }

  if (indices.itemName < 0 || indices.price < 0) {
    return {
      error: `Could not locate required columns (item name: "${result.item_name_col}", price: "${result.price_col}") in this file.`,
      suggestions: [
        'Make sure the file has column headers in the first row.',
        'Ensure there is a price column with numeric values.',
        'Try exporting as CSV from your ordering system.',
      ],
    }
  }

  const columnMapping: Record<string, string> = {
    item_number: String(result.item_number_col ?? ''),
    item_name:   String(result.item_name_col ?? ''),
    unit_size:   String(result.unit_size_col ?? ''),
    pack:        String(result.pack_col ?? ''),
    pack_size:   String(result.pack_size_col ?? ''),
    pack_unit:   String(result.pack_unit_col ?? ''),
    price:       String(result.price_col ?? ''),
  }

  console.log('[parseUpload] Column mapping detected:', columnMapping)
  return { indices, columnMapping }
}

// ── Local row parser (no AI, fast) ────────────────────────────────────────

function parseRowsLocally(
  rows: string[][],
  indices: ColumnIndices
): { parsed: ParsedRow[]; errors: ParseError[] } {
  const parsed: ParsedRow[] = []
  const errors: ParseError[] = []

  rows.forEach((row, i) => {
    const rowNum = i + 1
    const itemName = (row[indices.itemName] ?? '').trim()
    const priceRaw = (indices.price >= 0 ? row[indices.price] : '') ?? ''
    const priceStr = priceRaw.trim()

    if (!itemName) return  // blank row or section heading with no name

    const price = parseFloat(priceStr.replace(/[$,\s]/g, ''))
    if (!isFinite(price) || price <= 0) {
      // Category rows (like "SEAFOOD") just have no price — skip silently
      if (priceStr && priceStr !== '0' && priceStr !== '-') {
        errors.push({
          location: `Row ${rowNum}`,
          problem: `Could not parse price "${priceStr}" for "${itemName}"`,
          fix: 'Ensure the price column contains a number (e.g. 19.99)',
        })
      }
      return
    }

    const vendorItemNumber = indices.itemNumber >= 0 ? (row[indices.itemNumber] ?? '').trim() || null : null

    // When "Per Lb" column = "Y", the price is already $/lb (variable-weight market pricing).
    // Store as "1LB" so breakdownPrice correctly returns price/1 = $/lb without double-dividing.
    const isPricePerLb = indices.perLb >= 0 &&
      (row[indices.perLb] ?? '').trim().toUpperCase() === 'Y'

    let unitSize: string | null
    if (isPricePerLb) {
      unitSize = '1LB'
    } else {
      // Build unit_size: prefer combined column; fall back to assembling from separate pack/size/unit columns
      unitSize = indices.unitSize >= 0 ? (row[indices.unitSize] ?? '').trim() || null : null
      if (!unitSize && (indices.pack >= 0 || indices.packSize >= 0)) {
        const packVal     = indices.pack     >= 0 ? (row[indices.pack]     ?? '').trim() : ''
        const packSizeVal = indices.packSize >= 0 ? (row[indices.packSize] ?? '').trim() : ''
        const packUnitVal = indices.packUnit >= 0 ? (row[indices.packUnit] ?? '').trim() : ''
        if (packVal && packSizeVal && packUnitVal) {
          unitSize = `${packVal}/${packSizeVal}${packUnitVal}`
        } else if (packVal && packSizeVal) {
          unitSize = `${packVal}/${packSizeVal}`
        } else if (packVal) {
          unitSize = `${packVal} CT`
        }
      }
      // Last resort: extract pack info embedded in the item name itself
      // e.g. "4/5# SWISS CHEESE" → "4/5LB"
      if (!unitSize) {
        unitSize = extractUnitSizeFromName(itemName)
      }
    }

    parsed.push({
      row_index: rowNum,
      vendor_item_number: vendorItemNumber,
      item_name: itemName,
      unit_size: unitSize,
      price,
    })
  })

  return { parsed, errors }
}

// ── PDF path: parallel AI chunks ──────────────────────────────────────────

const PDF_EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_items',
  description: 'Extract product items from a vendor order guide. Call this with ALL rows found.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fatal_error: { type: 'string' },
      fatal_suggestions: { type: 'array', items: { type: 'string' } },
      column_mapping: {
        type: 'object',
        properties: {
          item_number: { type: 'string' },
          item_name: { type: 'string' },
          unit_size: { type: 'string' },
          price: { type: 'string' },
        },
        required: ['item_name', 'price'],
      },
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            row_index: { type: 'number' },
            vendor_item_number: { type: 'string' },
            item_name: { type: 'string' },
            unit_size: { type: 'string' },
            price: { type: 'number' },
          },
          required: ['row_index', 'item_name', 'price'],
        },
      },
      parse_errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            location: { type: 'string' },
            problem: { type: 'string' },
            fix: { type: 'string' },
          },
          required: ['location', 'problem', 'fix'],
        },
      },
    },
    required: ['rows'],
  },
}

const PDF_CHUNK_SIZE = 80

const PDF_SYSTEM = `You are a data extraction assistant for Old City Hall BBQ restaurant. Extract product items from vendor order guide files (PDFs).

IDENTIFYING COLUMNS — match by meaning, not exact header name:
• ITEM NUMBER: vendor's product code/SKU. May be absent.
• ITEM NAME: product description. Always present.
• UNIT SIZE: how it's packaged. Values like "1lb", "12/case", "6x500mL". May be absent.
• PRICE: what the restaurant pays. Strip $, commas. Must be > 0.

RULES:
• Skip: header rows, category headings (e.g. "SEAFOOD"), subtotals, blank rows
• price must be > 0 — skip rows where price is 0 or blank
• Extract every valid product row`

async function parsePDFChunk(
  chunk: string[][],
  chunkIdx: number,
  totalChunks: number,
  filename: string,
  client: Anthropic
): Promise<{ rows: ParsedRow[]; errors: ParseError[]; columnMapping?: Record<string, string>; fatalError?: string; fatalSuggestions?: string[] }> {
  const startRow = chunkIdx * PDF_CHUNK_SIZE + 1
  const tableLines = chunk.map((row, i) => `[Row ${startRow + i}] ${row.join('\t')}`)

  const userContent = [
    `FILE TYPE: PDF`,
    `FILENAME: ${filename}`,
    totalChunks > 1 ? `CHUNK: ${chunkIdx + 1} of ${totalChunks} (rows ${startRow}–${startRow + chunk.length - 1})` : '',
    '',
    'FILE CONTENT:',
    tableLines.join('\n'),
  ].filter(Boolean).join('\n')

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8000,
      system: PDF_SYSTEM,
      tools: [PDF_EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_items' },
      messages: [{ role: 'user', content: userContent }],
    })

    const toolUse = response.content.find(b => b.type === 'tool_use') as
      | { type: 'tool_use'; input: Record<string, unknown> }
      | undefined

    if (!toolUse) {
      console.error(`[parseUpload] PDF chunk ${chunkIdx + 1}: no tool_use block`)
      return { rows: [], errors: [] }
    }

    const result = toolUse.input

    if (chunkIdx === 0 && result.fatal_error) {
      return {
        rows: [],
        errors: [],
        fatalError: String(result.fatal_error),
        fatalSuggestions: (result.fatal_suggestions as string[]) ?? [],
      }
    }

    const columnMapping = chunkIdx === 0 && result.column_mapping
      ? result.column_mapping as Record<string, string>
      : undefined

    const rawRows = (result.rows as Array<Record<string, unknown>>) ?? []
    const parsedRows: ParsedRow[] = []

    for (const r of rawRows) {
      const price = typeof r.price === 'number' ? r.price : parseFloat(String(r.price ?? '0'))
      if (!isFinite(price) || price <= 0) continue
      parsedRows.push({
        row_index: typeof r.row_index === 'number' ? r.row_index : parsedRows.length + 1,
        vendor_item_number: r.vendor_item_number ? String(r.vendor_item_number).trim() || null : null,
        item_name: r.item_name ? String(r.item_name).trim() || null : null,
        unit_size: r.unit_size ? String(r.unit_size).trim() || null : null,
        price,
      })
    }

    const parseErrors: ParseError[] = ((result.parse_errors as Array<Record<string, string>>) ?? []).map(e => ({
      location: String(e.location ?? ''),
      problem: String(e.problem ?? ''),
      fix: String(e.fix ?? ''),
    }))

    console.log(`[parseUpload] PDF chunk ${chunkIdx + 1}: ${parsedRows.length} rows extracted`)
    return { rows: parsedRows, errors: parseErrors, columnMapping }

  } catch (err) {
    console.error(`[parseUpload] PDF chunk ${chunkIdx + 1} error:`, err)
    return { rows: [], errors: [] }
  }
}

// ── Main entry point ───────────────────────────────────────────────────────

export async function parseUploadWithAI(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParseResult | ParseFailure> {

  let headers: string[]
  let dataRows: string[][]
  let fileType: string

  try {
    const extracted = await extractRawRows(buffer, filename)
    headers = extracted.headers
    dataRows = extracted.rows
    fileType = extracted.type
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not read this file.'
    console.error('[parseUpload] File extraction failed:', msg)
    return {
      success: false,
      error: msg,
      suggestions: [
        'Make sure the file is not password-protected.',
        'For PDFs: check that text is selectable (Ctrl+A in the PDF viewer). If not, export as CSV instead.',
        'Accepted formats: CSV (.csv), Excel (.xlsx, .xls), or text-based PDF.',
      ],
    }
  }

  if (dataRows.length === 0) {
    return {
      success: false,
      error: 'The file appears to be empty or has no readable rows.',
      suggestions: [
        'Make sure the file contains item rows with names and prices.',
        'Open the file and verify it has data before uploading.',
      ],
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    return {
      success: false,
      error: 'AI service is not configured. Please contact the brewery administrator.',
      suggestions: [],
    }
  }

  const client = new Anthropic({ apiKey })

  console.log(`[parseUpload] File: "${filename}" | Type: ${fileType} | Rows: ${dataRows.length}`)

  // ── PDF path: parallel AI chunks ──────────────────────────────────────

  if (fileType === 'pdf') {
    const chunks: string[][][] = []
    for (let i = 0; i < dataRows.length; i += PDF_CHUNK_SIZE) {
      chunks.push(dataRows.slice(i, i + PDF_CHUNK_SIZE))
    }

    console.log(`[parseUpload] PDF: ${chunks.length} chunks (parallel)`)

    const chunkResults = await Promise.all(
      chunks.map((chunk, idx) => parsePDFChunk(chunk, idx, chunks.length, filename, client))
    )

    // Check if first chunk hit a fatal error
    const firstChunkFatal = chunkResults[0]?.fatalError
    if (firstChunkFatal) {
      return {
        success: false,
        error: firstChunkFatal,
        suggestions: chunkResults[0]?.fatalSuggestions ?? [],
      }
    }

    const allRows = chunkResults.flatMap(r => r.rows)
    const allErrors = chunkResults.flatMap(r => r.errors)
    const columnMapping = chunkResults[0]?.columnMapping ?? {}

    if (allRows.length === 0) {
      return {
        success: false,
        error: 'No valid priced items were found in this PDF.',
        suggestions: [
          'Make sure the PDF is a text-based file (not a scanned image).',
          'Try exporting as CSV or Excel from your ordering system.',
        ],
      }
    }

    console.log(`[parseUpload] PDF done. Total rows: ${allRows.length}`)
    return { success: true, rows: allRows, parse_errors: allErrors, column_mapping: columnMapping }
  }

  // ── CSV/Excel path: 1 AI call to detect columns, then parse locally ───

  const mappingResult = await detectColumnIndices(headers, dataRows, filename, fileType, client)

  if ('error' in mappingResult) {
    return {
      success: false,
      error: mappingResult.error,
      suggestions: mappingResult.suggestions,
    }
  }

  const { indices, columnMapping } = mappingResult
  const { parsed, errors } = parseRowsLocally(dataRows, indices)

  if (parsed.length === 0) {
    return {
      success: false,
      error: 'No valid priced items were found in this file.',
      suggestions: [
        columnMapping.price
          ? `The price column was identified as "${columnMapping.price}" — make sure it contains numbers greater than $0.`
          : 'Make sure the file has a column with prices (numeric values, not text).',
        'Remove any summary rows, totals, or category headings that don\'t represent individual items.',
        'Try exporting the file as CSV from your ordering system.',
      ],
    }
  }

  console.log(`[parseUpload] CSV/Excel done. ${parsed.length} rows parsed locally, ${errors.length} parse errors.`)
  return { success: true, rows: parsed, parse_errors: errors, column_mapping: columnMapping }
}
