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
): Promise<{ allRows: string[][]; firstNonEmptyIdx: number; type: string } | { headers: string[]; rows: string[][]; type: string }> {
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

  const firstNonEmptyIdx = all.findIndex(r => r.some(c => String(c).trim()))
  if (firstNonEmptyIdx === -1) return { headers: [], rows: [], type: ext }

  // Detect Sysco row-typed format: rows start with H (file header), F (field names),
  // C (category headings), P (product rows). Standard files never have this pattern.
  const firstColSample = all.slice(firstNonEmptyIdx, firstNonEmptyIdx + 6).map(r => String(r[0] ?? '').trim().toUpperCase())
  if (firstColSample.includes('H') && firstColSample.includes('F')) {
    const fRowIdx = all.findIndex(r => String(r[0] ?? '').trim().toUpperCase() === 'F')
    if (fRowIdx >= 0) {
      const headers = all[fRowIdx].slice(1).map(c => String(c ?? '').trim())
      const dataRows = all
        .filter(r => String(r[0] ?? '').trim().toUpperCase() === 'P')
        .map(r => r.slice(1).map(c => String(c ?? '').trim()))
      console.log(`[parseUpload] Detected Sysco row-typed format — ${dataRows.length} product rows, headers from F row`)
      return { headers, rows: dataRows, type: ext }
    }
  }

  // Return raw rows — let AI identify which row is the actual header
  const cleanAll = all.map(r => r.map(c => String(c ?? '').trim()))
  return { allRows: cleanAll, firstNonEmptyIdx, type: ext }
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
      no_headers: {
        type: 'boolean',
        description: 'True if the file has NO column header row — data begins from the very first row. In this case, set col_* fields to 0-based column index numbers instead of header name strings.',
      },
      header_row: {
        type: 'integer',
        description: 'Zero-based index (relative to the rows shown) of the row that contains the actual column headers. Usually 0 but may be higher if the file has metadata rows (company name, date, etc.) before the column headers. Ignored when no_headers=true.',
      },
      item_number_col: {
        type: 'string',
        description: 'When headers exist: exact header text for the vendor SKU/item number column. When no_headers=true: "0", "1", "2", etc. for the column index. Empty string if absent.',
      },
      item_name_col: {
        type: 'string',
        description: 'When headers exist: exact header text for the item name/description column. When no_headers=true: "0", "1", "2", etc. for the column index.',
      },
      unit_size_col: {
        type: 'string',
        description: 'When headers exist: exact header text for a combined pack/unit-size column (e.g. "Pack Size", "UOM", "Unit"). When no_headers=true: column index or empty. Empty string if the file uses separate Pack/Size/Unit columns instead.',
      },
      pack_col: {
        type: 'string',
        description: 'Exact header (or column index if no_headers) for number of packs per case. Empty string if absent.',
      },
      pack_size_col: {
        type: 'string',
        description: 'Exact header (or column index if no_headers) for weight/size per individual pack. Empty string if absent.',
      },
      pack_unit_col: {
        type: 'string',
        description: 'Exact header (or column index if no_headers) for the unit of measure per pack. Empty string if absent.',
      },
      price_col: {
        type: 'string',
        description: 'When headers exist: exact header text for the price column — pick "Your Price" or "Net Price" over "List Price". When no_headers=true: column index string (e.g. "2").',
      },
    },
    required: ['item_name_col', 'price_col'],
  },
}

// Strip non-standard whitespace and normalize for comparison
function normalizeHeader(s: string): string {
  return s
    .replace(/[ ​‌‍﻿­]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

async function detectColumnIndices(
  allRows: string[][],        // all rows from file starting at first non-empty row
  filename: string,
  fileType: string,
  client: Anthropic
): Promise<{ indices: ColumnIndices; columnMapping: Record<string, string>; headers: string[]; dataRows: string[][] } | { error: string; suggestions: string[] }> {

  // Send up to 15 rows so AI can see any metadata rows before the actual header
  const sampleRows = allRows.slice(0, 15)
  const rowLines = sampleRows.map((r, i) => `[Row ${i}]: ${r.join('\t')}`)

  const sampleText = [
    'FILE ROWS (row 0 = first non-empty row):',
    ...rowLines,
  ].join('\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    system: `You identify columns in vendor order guide spreadsheets for a restaurant.

TWO POSSIBLE FILE TYPES:

1. FILE WITH COLUMN HEADERS: Most files have a header row ("Description", "Price", "Item #", etc.).
   - Set no_headers=false
   - Some files have 1-3 metadata rows (company name, date) BEFORE the header — use header_row to indicate which row is the actual header
   - Return exact header text in item_name_col, price_col, etc.

2. FILE WITH NO COLUMN HEADERS (like a bare export or internal spreadsheet): Data starts from row 0 with no header labels.
   - Signs: every row has the same structure; first column is a numeric item code; no row looks like labels
   - Set no_headers=true
   - Return column INDEX numbers as strings: "0", "1", "2", etc. in item_name_col, price_col, etc.

Column meanings regardless of format:
- ITEM NUMBER: vendor SKU/product code — typically a short integer or alphanumeric code. May be absent.
- ITEM NAME: product description — always a string with product name and pack info like "4/5# SWISS CHEESE".
- UNIT SIZE: pack/size info if in a separate column. Often embedded in item name instead.
- PRICE: what the restaurant pays per case — always a positive decimal number.
  If multiple price columns, prefer "Your Price" / "Net Price" over "List Price".

Some vendors (Sysco, US Foods) split pack info into separate Pack, Size, Unit columns — detect those too.`,
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

  const noHeaders = result.no_headers === true

  let headers: string[]
  let dataRows: string[][]

  if (noHeaders) {
    // No header row — data starts at row 0, resolve columns by numeric index
    headers = []
    dataRows = allRows.filter(r => r.some(c => c.trim()))

    function parseColIdx(val: unknown): number {
      if (val === null || val === undefined || val === '') return -1
      const n = parseInt(String(val), 10)
      return isNaN(n) ? -1 : n
    }

    const perLbIdx = -1  // no headers → no Per Lb column
    const indices: ColumnIndices = {
      itemNumber: parseColIdx(result.item_number_col),
      itemName:   parseColIdx(result.item_name_col),
      unitSize:   parseColIdx(result.unit_size_col),
      price:      parseColIdx(result.price_col),
      pack:       parseColIdx(result.pack_col),
      packSize:   parseColIdx(result.pack_size_col),
      packUnit:   parseColIdx(result.pack_unit_col),
      perLb:      perLbIdx,
    }

    if (indices.itemName < 0 || indices.price < 0) {
      return {
        error: 'Could not identify the item name or price column in this file.',
        suggestions: [
          'The file appears to have no column headers.',
          'Try adding a header row (Item #, Description, Price) to the first row.',
          'Or export as CSV from your ordering system.',
        ],
      }
    }

    const columnMapping: Record<string, string> = {
      item_number: String(result.item_number_col ?? ''),
      item_name:   String(result.item_name_col ?? ''),
      unit_size:   String(result.unit_size_col ?? ''),
      price:       String(result.price_col ?? ''),
      pack: '', pack_size: '', pack_unit: '',
    }

    console.log(`[parseUpload] no_headers=true, col indices:`, columnMapping)
    return { indices, columnMapping, headers, dataRows }
  }

  // Has headers — use the AI-identified header row index (default 0)
  const headerRowIdx = typeof result.header_row === 'number' ? Math.max(0, result.header_row) : 0
  headers = (allRows[headerRowIdx] ?? allRows[0]).map(c => normalizeHeader(c))
  dataRows = allRows
    .slice(headerRowIdx + 1)
    .filter(r => r.some(c => c.trim()))

  // Map column names back to indices (normalized, with partial match fallback)
  function findIndex(colName: unknown): number {
    if (!colName || typeof colName !== 'string' || !colName.trim()) return -1
    const name = normalizeHeader(colName)
    const exact = headers.indexOf(name)
    if (exact >= 0) return exact
    // Partial match fallback
    const partial = headers.findIndex(h => h.includes(name) || name.includes(h))
    return partial
  }

  // Detect "Per Lb" / "Per Unit" flag column (Sysco-specific)
  const perLbIdxH = headers.findIndex(h =>
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
    perLb:      perLbIdxH,
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

  console.log(`[parseUpload] header_row=${headerRowIdx}, column mapping:`, columnMapping)
  return { indices, columnMapping, headers, dataRows }
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
        if (packVal && packSizeVal) {
          // Avoid doubling the unit when size already includes it (e.g. "5LB" + "LB" → "5LBLB")
          const sizeAlreadyHasUnit = packUnitVal &&
            packSizeVal.replace(/\s/g, '').toUpperCase().includes(packUnitVal.toUpperCase())
          unitSize = sizeAlreadyHasUnit || !packUnitVal
            ? `${packVal}/${packSizeVal}`
            : `${packVal}/${packSizeVal}${packUnitVal}`
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

  let extractedType: string
  let pdfRows: string[][] | null = null
  let xlsAllRows: string[][] | null = null
  let legacyHeaders: string[] | null = null
  let legacyDataRows: string[][] | null = null

  try {
    const extracted = await extractRawRows(buffer, filename)
    extractedType = extracted.type
    if ('allRows' in extracted) {
      // New path: raw rows returned for AI to identify header row
      const startIdx = extracted.firstNonEmptyIdx
      xlsAllRows = extracted.allRows.slice(startIdx)
    } else if ('rows' in extracted && 'headers' in extracted) {
      // Legacy path: pre-split (Sysco format or PDF)
      legacyHeaders = extracted.headers
      legacyDataRows = extracted.rows
      pdfRows = extracted.type === 'pdf' ? extracted.rows : null
    }
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

  const hasRows = (xlsAllRows?.length ?? 0) > 0 || (pdfRows?.length ?? 0) > 0 || (legacyDataRows?.length ?? 0) > 0
  if (!hasRows) {
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
  const fileType = extractedType

  console.log(`[parseUpload] File: "${filename}" | Type: ${fileType}`)

  // ── PDF path: parallel AI chunks ──────────────────────────────────────

  if (fileType === 'pdf' && pdfRows) {
    const chunks: string[][][] = []
    for (let i = 0; i < pdfRows.length; i += PDF_CHUNK_SIZE) {
      chunks.push(pdfRows.slice(i, i + PDF_CHUNK_SIZE))
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

    const allParsedRows = chunkResults.flatMap(r => r.rows)
    const allErrors = chunkResults.flatMap(r => r.errors)
    const columnMapping = chunkResults[0]?.columnMapping ?? {}

    if (allParsedRows.length === 0) {
      return {
        success: false,
        error: 'No valid priced items were found in this PDF.',
        suggestions: [
          'Make sure the PDF is a text-based file (not a scanned image).',
          'Try exporting as CSV or Excel from your ordering system.',
        ],
      }
    }

    console.log(`[parseUpload] PDF done. Total rows: ${allParsedRows.length}`)
    return { success: true, rows: allParsedRows, parse_errors: allErrors, column_mapping: columnMapping }
  }

  // ── CSV/Excel path: 1 AI call to detect columns, then parse locally ───

  // Use pre-split legacy rows (Sysco format) or the raw allRows path
  const rowsForDetection = xlsAllRows ?? (legacyDataRows ? [legacyHeaders ?? [], ...legacyDataRows] : [])

  const mappingResult = await detectColumnIndices(rowsForDetection, filename, fileType, client)

  if ('error' in mappingResult) {
    return {
      success: false,
      error: mappingResult.error,
      suggestions: mappingResult.suggestions,
    }
  }

  const { indices, columnMapping, dataRows } = mappingResult
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
