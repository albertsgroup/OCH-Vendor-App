import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentWeekStart } from '@/lib/utils/week'
import { parseUploadWithAI } from '@/lib/ai/parseUpload'
import { matchItemsWithAI } from '@/lib/ai/matchItems'

const CONFIDENCE_AUTO_MATCH = 0.85  // above this → auto-match
const ALLOWED_EXTENSIONS = ['csv', 'xlsx', 'xls', 'pdf']

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active, vendor_name')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'vendor' || !profile.is_active) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const vendorName = profile.vendor_name ?? 'Unknown Vendor'

    // ── File validation ───────────────────────────────────
    const form = await request.formData()
    const file = form.get('file') as File | null
    const weekStart = (form.get('week_start') as string | null) ?? getCurrentWeekStart()

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({
        error: `"${file.name}" is not a supported file type.`,
        parse_errors: [],
        suggestions: [
          'Accepted formats: CSV (.csv), Excel (.xlsx or .xls), or PDF (.pdf).',
          'Export your order guide from your ordering system in one of these formats.',
        ],
      }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()

    // ── Step 1: AI-powered file parsing ──────────────────
    const t1 = Date.now()
    const parseResult = await parseUploadWithAI(buffer, file.name)
    console.log(`[upload] Step 1 parse: ${Date.now() - t1}ms`)

    if (!parseResult.success) {
      return NextResponse.json({
        error: parseResult.error,
        suggestions: parseResult.suggestions,
        parse_errors: [],
      }, { status: 422 })
    }

    const { rows: parsedRows, parse_errors } = parseResult

    // ── Step 2: Fetch catalogue + saved mappings ──────────
    const admin = createAdminClient()

    const t2 = Date.now()
    const [
      { data: internalItems, error: itemsErr },
      { data: savedMappings },
    ] = await Promise.all([
      admin.from('items').select('id, item_number, item_name').eq('is_active', true),
      admin.from('vendor_item_mappings').select('vendor_item_number, internal_item_id').eq('vendor_id', user.id),
    ])
    console.log(`[upload] Step 2 DB: ${Date.now() - t2}ms`)

    if (itemsErr) {
      // Table probably doesn't exist yet — remind admin to run migrations
      console.error('DB error fetching items:', itemsErr)
      return NextResponse.json({
        error: 'Database tables are not set up yet.',
        suggestions: [
          'The brewery administrator needs to run the database migrations in Supabase.',
          'Go to Supabase → SQL Editor and run the file: supabase/run_all_migrations.sql',
        ],
        parse_errors: [],
      }, { status: 503 })
    }

    // Build a lookup: vendor item # → known internal item id (from saved mappings)
    const savedMap: Record<string, string> = {}
    savedMappings?.forEach(m => { savedMap[m.vendor_item_number] = m.internal_item_id })

    // ── Step 3: AI-powered item matching ─────────────────
    const rowsNeedingMatch = parsedRows.filter(r =>
      !r.vendor_item_number || !savedMap[r.vendor_item_number]
    )

    console.log(`[upload] Step 3 match: ${parsedRows.length} total rows, ${rowsNeedingMatch.length} need AI matching`)
    const t3 = Date.now()
    const aiMatches = rowsNeedingMatch.length > 0
      ? await matchItemsWithAI(vendorName, rowsNeedingMatch, internalItems ?? [])
      : []
    console.log(`[upload] Step 3 match done: ${Date.now() - t3}ms`)

    const aiMatchByRowIndex: Record<number, (typeof aiMatches)[0]> = {}
    aiMatches.forEach(m => { aiMatchByRowIndex[m.row_index] = m })

    // ── Step 4: Store upload record ───────────────────────
    const filePath = `${user.id}/${weekStart}/${file.name}`

    // Upload raw file to Storage (best effort — non-fatal if bucket missing)
    admin.storage.from('order-guides').upload(filePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    }).catch(err => console.warn('Storage upload failed (non-fatal):', err))

    // Check if an upload already exists for this vendor+week
    const { data: existing } = await admin
      .from('vendor_uploads')
      .select('id')
      .eq('vendor_id', user.id)
      .eq('week_start', weekStart)
      .maybeSingle()   // maybeSingle avoids throwing when row is missing

    let uploadId: string

    if (existing) {
      // Replace existing rows then update the header record
      await admin.from('vendor_upload_rows').delete().eq('upload_id', existing.id)

      const { data: updated, error: updateErr } = await admin
        .from('vendor_uploads')
        .update({
          file_name: file.name,
          file_path: filePath,
          row_count: parsedRows.length,
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id')
        .single()

      if (updateErr || !updated) {
        console.error('Upload update error:', updateErr)
        return NextResponse.json({
          error: 'Failed to update the upload record. Please try again.',
          suggestions: ['If this keeps happening, contact your brewery administrator.'],
          parse_errors: [],
        }, { status: 500 })
      }
      uploadId = updated.id
    } else {
      const { data: created, error: insertErr } = await admin
        .from('vendor_uploads')
        .insert({
          vendor_id: user.id,
          week_start: weekStart,
          file_name: file.name,
          file_path: filePath,
          row_count: parsedRows.length,
        })
        .select('id')
        .single()

      if (insertErr || !created) {
        console.error('Upload insert error:', insertErr)
        // Surface a helpful message if tables are missing
        const isSchemaError = insertErr?.message?.includes('does not exist') ||
          insertErr?.code === '42P01'
        return NextResponse.json({
          error: isSchemaError
            ? 'The database is not set up yet. Please ask the administrator to run the migrations.'
            : 'Failed to save the upload record. Please try again.',
          suggestions: isSchemaError
            ? ['Run supabase/run_all_migrations.sql in the Supabase SQL Editor.']
            : ['If this keeps happening, contact your brewery administrator.'],
          parse_errors: [],
        }, { status: 500 })
      }
      uploadId = created.id
    }

    // ── Step 5: Build and insert rows ────────────────────
    let autoMatchedCount = 0
    let needsReviewCount = 0

    const rowInserts = parsedRows.map((row) => {
      // Priority 1: saved mapping (from a previous admin confirmation)
      if (row.vendor_item_number && savedMap[row.vendor_item_number]) {
        autoMatchedCount++
        return {
          upload_id: uploadId,
          vendor_item_number: row.vendor_item_number,
          item_name: row.item_name,
          unit_size: row.unit_size,
          price: row.price,
          sort_order: row.row_index,
          internal_item_id: savedMap[row.vendor_item_number],
          ai_confidence: 1.0,
          ai_suggested_item_id: null,
          needs_admin_review: false,
          ai_match_reason: 'Matched from saved mapping',
          review_resolved: true,
        }
      }

      // Priority 2: AI match result
      const aiMatch = aiMatchByRowIndex[row.row_index]

      if (!aiMatch) {
        needsReviewCount++
        return {
          upload_id: uploadId,
          vendor_item_number: row.vendor_item_number,
          item_name: row.item_name,
          unit_size: row.unit_size,
          price: row.price,
          sort_order: row.row_index,
          internal_item_id: null,
          ai_confidence: 0,
          ai_suggested_item_id: null,
          needs_admin_review: true,
          ai_match_reason: 'AI match unavailable — please review',
          review_resolved: false,
        }
      }

      if (aiMatch.match_type === 'confident' && aiMatch.internal_item_id && aiMatch.confidence >= CONFIDENCE_AUTO_MATCH) {
        autoMatchedCount++

        // Persist to vendor_item_mappings so future uploads auto-match this item
        if (row.vendor_item_number) {
          admin.from('vendor_item_mappings')
            .upsert(
              { vendor_id: user.id, vendor_item_number: row.vendor_item_number, internal_item_id: aiMatch.internal_item_id },
              { onConflict: 'vendor_id,vendor_item_number' }
            )
            .then(() => {})
        }

        return {
          upload_id: uploadId,
          vendor_item_number: row.vendor_item_number,
          item_name: row.item_name,
          unit_size: row.unit_size,
          price: row.price,
          sort_order: row.row_index,
          internal_item_id: aiMatch.internal_item_id,
          ai_confidence: aiMatch.confidence,
          ai_suggested_item_id: null,
          needs_admin_review: false,
          ai_match_reason: aiMatch.reason,
          review_resolved: true,
        }
      }

      // Medium / low confidence or new item → needs admin review
      needsReviewCount++
      return {
        upload_id: uploadId,
        vendor_item_number: row.vendor_item_number,
        item_name: row.item_name,
        unit_size: row.unit_size,
        price: row.price,
        sort_order: row.row_index,
        internal_item_id: null,
        ai_confidence: aiMatch.confidence,
        ai_suggested_item_id: aiMatch.internal_item_id,
        needs_admin_review: true,
        ai_match_reason: aiMatch.match_type === 'new'
          ? `New item — suggested common name: "${aiMatch.suggested_common_name ?? row.item_name}"`
          : aiMatch.reason,
        review_resolved: false,
      }
    })

    const { error: rowsErr } = await admin.from('vendor_upload_rows').insert(rowInserts)
    if (rowsErr) {
      console.error('Row insert error:', rowsErr)
      return NextResponse.json({
        error: 'The file was read successfully but we could not save the rows. Please try again.',
        suggestions: ['If this keeps happening, contact your brewery administrator.'],
        parse_errors: [],
      }, { status: 500 })
    }

    return NextResponse.json({
      upload_id: uploadId,
      row_count: parsedRows.length,
      auto_matched: autoMatchedCount,
      needs_review: needsReviewCount,
      parse_errors,
    })

  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({
      error: 'An unexpected error occurred while processing your file.',
      suggestions: ['Please try again. If the problem persists, try exporting your file as CSV and uploading that instead.'],
      parse_errors: [],
    }, { status: 500 })
  }
}
