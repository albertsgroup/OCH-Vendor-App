/**
 * AI-powered file parsing — uses Claude tool use for guaranteed structured output.
 * Accepts XLSX, CSV, or PDF buffers and extracts item rows reliably.
 *
 * Key design decisions:
 * - Tool use instead of "return JSON" in text → eliminates ALL JSON parse failures
 * - Chunked processing (80 rows/call) → handles large files without hitting token limits
 * - Detailed server-side logging → easy to diagnose future issues
 */

import Anthropic from '@anthropic-ai/sdk'

export interface ParsedRow {
  row_index: number
  vendor_item_number: string | null
  item_name: string | null
  unit_size: string | null   // e.g. "1lb", "12/case", "500mL", "ea"
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

// -------------------------------------------------------
// Extract raw rows from the file buffer
// Returns: header row + data rows as string[][]
// -------------------------------------------------------
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

      // For PDFs we can't extract structured rows — pass as lines
      const lines = data.text.split('\n').map(l => [l.trim()]).filter(l => l[0])
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

  // Find first non-empty row as headers
  const firstData = all.findIndex(r => r.some(c => String(c).trim()))
  if (firstData === -1) return { headers: [], rows: [], type: ext }

  const headers = all[firstData].map(c => String(c ?? '').trim())
  const dataRows = all.slice(firstData + 1)
    .filter(r => r.some(c => String(c).trim()))  // skip fully blank rows
    .map(r => r.map(c => String(c ?? '').trim()))

  return { headers, rows: dataRows, type: ext }
}

// -------------------------------------------------------
// Claude tool definition — forces structured output
// -------------------------------------------------------
const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_items',
  description: 'Extract product items from a vendor order guide. Call this with ALL rows found.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fatal_error: {
        type: 'string',
        description: 'Only set this if the file is completely unreadable or has no price column at all. Leave empty/null for normal extraction.',
      },
      fatal_suggestions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Actionable steps if fatal_error is set.',
      },
      column_mapping: {
        type: 'object',
        description: 'Which column header maps to each field.',
        properties: {
          item_number: { type: 'string', description: 'Column header for item/product number, or "none" if absent' },
          item_name: { type: 'string', description: 'Column header for item description/name' },
          unit_size: { type: 'string', description: 'Column header for pack/unit size, or "none" if absent' },
          price: { type: 'string', description: 'Column header for the price to charge the brewery' },
        },
        required: ['item_name', 'price'],
      },
      rows: {
        type: 'array',
        description: 'All extracted product rows. Skip headers, category headings, subtotals, blank rows.',
        items: {
          type: 'object',
          properties: {
            row_index: { type: 'number', description: '1-based row number in the file' },
            vendor_item_number: { type: 'string', description: 'Vendor product code/SKU, or empty string if none' },
            item_name: { type: 'string', description: 'Product description or name' },
            unit_size: { type: 'string', description: 'Pack/unit size like 1lb, 12/case, 500mL, or empty string if none' },
            price: { type: 'number', description: 'Unit price as a number (strip $, commas). Must be > 0.' },
          },
          required: ['row_index', 'item_name', 'price'],
        },
      },
      parse_errors: {
        type: 'array',
        description: 'Non-fatal warnings about specific rows that were skipped.',
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

const SYSTEM_PROMPT = `You are a data extraction assistant for Old City Hall Brewery. Extract product items from vendor order guide files.

IDENTIFYING COLUMNS — match by meaning, not exact header name:

• ITEM NUMBER: vendor's product code/SKU. Headers: "Item #", "Item No", "SKU", "Cat #", "Code", "Product #", "Prod #", "Part #", etc. May be absent — use empty string.

• ITEM NAME: product description. Headers: "Description", "Item Description", "Product", "Product Name", "Name", "Desc", "Item", etc. Always present.

• UNIT SIZE: how it's packaged/sold. Headers: "Pack", "Pack Size", "Size", "UOM", "Unit", "Unit of Measure", "Case Size", "Sell Unit", etc. Values like "1lb", "12/case", "6x500mL", "ea", "1kg". May be absent — use empty string.

• PRICE: what the brewery pays per unit. Headers: "Price", "Unit Price", "Your Price", "Net Price", "Each", "Cost", "Amount", "Rate", "$/Unit", etc. If both "List Price" and "Your Price/Net Price" exist, use the Your/Net price. Strip $, commas, spaces. Must be a positive number.

RULES:
• Skip: header rows, category/section headings (e.g. "SEAFOOD", "DAIRY"), subtotal rows, total rows, blank rows
• price must be > 0 — skip rows where price is 0, blank, or cannot be parsed as a number
• For PDFs: the content may be less structured — use context clues to identify items
• Extract every valid product row, even if hundreds of rows`

// How many data rows to send per Claude call (keeps output within token limits)
const CHUNK_SIZE = 80

// -------------------------------------------------------
// Main parse function
// -------------------------------------------------------
export async function parseUploadWithAI(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParseResult | ParseFailure> {

  // ── 1. Extract raw content from file ─────────────────
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

  // ── 2. Check API key ──────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    return {
      success: false,
      error: 'AI service is not configured. Please contact the brewery administrator.',
      suggestions: [],
    }
  }
  const client = new Anthropic({ apiKey })

  // ── 3. Process in chunks ──────────────────────────────
  const allExtractedRows: ParsedRow[] = []
  const allParseErrors: ParseError[] = []
  let columnMapping: Record<string, string> = {}
  let fatalError: string | null = null
  let fatalSuggestions: string[] = []

  const chunks: string[][][] = []
  for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
    chunks.push(dataRows.slice(i, i + CHUNK_SIZE))
  }

  console.log(`[parseUpload] File: "${filename}" | Type: ${fileType} | Rows: ${dataRows.length} | Chunks: ${chunks.length}`)

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx]
    const startRow = chunkIdx * CHUNK_SIZE + 1

    // Format the chunk as a readable table
    const tableLines: string[] = []
    if (headers.length > 0) {
      tableLines.push(headers.join('\t'))
    }
    chunk.forEach((row, i) => {
      tableLines.push(`[Row ${startRow + i}] ${row.join('\t')}`)
    })

    const userContent = [
      `FILE TYPE: ${fileType.toUpperCase()}`,
      `FILENAME: ${filename}`,
      chunks.length > 1 ? `CHUNK: ${chunkIdx + 1} of ${chunks.length} (rows ${startRow}–${startRow + chunk.length - 1})` : '',
      chunkIdx > 0 && Object.keys(columnMapping).length > 0
        ? `COLUMN MAPPING ALREADY IDENTIFIED: ${JSON.stringify(columnMapping)} — use the same mapping for this chunk.`
        : '',
      '',
      'FILE CONTENT:',
      tableLines.join('\n'),
    ].filter(Boolean).join('\n')

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'extract_items' },
        messages: [{ role: 'user', content: userContent }],
      })

      // Tool use guarantees the response is in response.content[0].input
      const toolUse = response.content.find(b => b.type === 'tool_use') as
        | { type: 'tool_use'; input: Record<string, unknown> }
        | undefined

      if (!toolUse) {
        console.error(`[parseUpload] Chunk ${chunkIdx + 1}: no tool_use block in response`, JSON.stringify(response.content))
        // Continue to next chunk rather than failing entirely
        continue
      }

      const result = toolUse.input

      // Fatal error on first chunk only (if the file is unreadable)
      if (chunkIdx === 0 && result.fatal_error) {
        fatalError = String(result.fatal_error)
        fatalSuggestions = (result.fatal_suggestions as string[]) ?? []
        break
      }

      // Capture column mapping from first chunk
      if (chunkIdx === 0 && result.column_mapping) {
        const cm = result.column_mapping as Record<string, string>
        columnMapping = {
          item_number: cm.item_number && cm.item_number !== 'none' ? cm.item_number : '',
          item_name: cm.item_name ?? '',
          unit_size: cm.unit_size && cm.unit_size !== 'none' ? cm.unit_size : '',
          price: cm.price ?? '',
        }
        console.log(`[parseUpload] Column mapping:`, columnMapping)
      }

      // Collect rows
      const rows = (result.rows as Array<Record<string, unknown>>) ?? []
      console.log(`[parseUpload] Chunk ${chunkIdx + 1}: ${rows.length} rows extracted`)

      for (const r of rows) {
        const price = typeof r.price === 'number' ? r.price : parseFloat(String(r.price ?? '0'))
        if (!isFinite(price) || price <= 0) continue

        allExtractedRows.push({
          row_index: typeof r.row_index === 'number' ? r.row_index : allExtractedRows.length + 1,
          vendor_item_number: r.vendor_item_number ? String(r.vendor_item_number).trim() || null : null,
          item_name: r.item_name ? String(r.item_name).trim() || null : null,
          unit_size: r.unit_size ? String(r.unit_size).trim() || null : null,
          price,
        })
      }

      // Collect parse errors
      const errors = (result.parse_errors as Array<Record<string, string>>) ?? []
      for (const e of errors) {
        allParseErrors.push({
          location: String(e.location ?? ''),
          problem: String(e.problem ?? ''),
          fix: String(e.fix ?? ''),
        })
      }

    } catch (err: unknown) {
      console.error(`[parseUpload] Chunk ${chunkIdx + 1} AI error:`, err)
      // If this is the only chunk, return error; otherwise keep partial results
      if (chunks.length === 1) {
        return {
          success: false,
          error: 'Our AI assistant encountered an error reading your file. Please try again.',
          suggestions: ['Wait a moment and try again.', 'If the problem continues, export as CSV and try that instead.'],
        }
      }
    }
  }

  // ── 4. Return results ─────────────────────────────────
  if (fatalError) {
    return { success: false, error: fatalError, suggestions: fatalSuggestions }
  }

  if (allExtractedRows.length === 0) {
    return {
      success: false,
      error: 'No valid priced items were found in this file.',
      suggestions: [
        columnMapping.price
          ? `The price column was identified as "${columnMapping.price}" — make sure it contains numbers greater than $0.`
          : 'Make sure the file has a column with prices (numeric values, not text).',
        'Remove any summary rows, totals, or category headings that don\'t represent individual items.',
        'Try exporting the file as CSV from your ordering system and uploading that instead.',
      ],
    }
  }

  console.log(`[parseUpload] Done. Total rows: ${allExtractedRows.length}, parse errors: ${allParseErrors.length}`)

  return {
    success: true,
    rows: allExtractedRows,
    parse_errors: allParseErrors,
    column_mapping: columnMapping,
  }
}
