'use client'

import { useState, useRef } from 'react'
import type { VendorUpload, VendorUploadRow } from '@/types/database'

interface ParseError {
  location: string
  problem: string
  fix: string
}

interface UploadResult {
  row_count: number
  auto_matched: number
  needs_review: number
  parse_errors: ParseError[]
}

interface UploadFailure {
  error: string
  suggestions?: string[]
  parse_errors?: ParseError[]
}

interface Props {
  weekStart: string
  currentUpload: (VendorUpload & { rows: VendorUploadRow[] }) | null
  onUploadComplete: (result: UploadResult) => void
}

export default function UploadForm({ weekStart, currentUpload, onUploadComplete }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [failure, setFailure] = useState<UploadFailure | null>(null)
  const [success, setSuccess] = useState<UploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submitFile(file: File) {
    setFailure(null)
    setSuccess(null)
    setUploading(true)

    const form = new FormData()
    form.append('file', file)
    form.append('week_start', weekStart)

    try {
      const res = await fetch('/api/vendor/upload', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) {
        setFailure({
          error: data.error ?? 'Upload failed. Please try again.',
          suggestions: data.suggestions,
          parse_errors: data.parse_errors,
        })
        return
      }

      setSuccess(data)
      onUploadComplete(data)
    } catch {
      setFailure({ error: 'Network error. Please check your connection and try again.' })
    } finally {
      setUploading(false)
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) submitFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) submitFile(file)
  }

  const hasUpload = !!currentUpload && !success

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-primary bg-primary-50'
            : 'border-gray-300 hover:border-primary hover:bg-gray-50'
        } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          className="hidden"
          onChange={handleFileInput}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-700">Reading your file with AI…</p>
              <p className="text-xs text-gray-400 mt-1">This may take a few seconds</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div>
              <p className="font-semibold text-gray-700">
                {hasUpload ? 'Re-upload this week\'s order guide' : 'Upload your order guide'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Drag & drop or click to browse — CSV, XLSX, XLS, or PDF
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Fatal error ───────────────────────────────── */}
      {failure && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="font-semibold text-red-800">We couldn&apos;t read your file</p>
              <p className="text-sm text-red-700 mt-1">{failure.error}</p>
            </div>
          </div>

          {/* How to fix */}
          {failure.suggestions && failure.suggestions.length > 0 && (
            <div className="border-t border-red-200 pt-3">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">How to fix:</p>
              <ul className="space-y-1">
                {failure.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                    <span className="text-red-400 font-bold mt-0.5">→</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Row-level parse errors */}
          {failure.parse_errors && failure.parse_errors.length > 0 && (
            <div className="border-t border-red-200 pt-3">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Rows with issues:</p>
              <div className="space-y-2">
                {failure.parse_errors.map((e, i) => (
                  <div key={i} className="bg-white rounded-lg border border-red-100 px-3 py-2">
                    <p className="text-xs font-semibold text-red-700">{e.location}</p>
                    <p className="text-xs text-red-600 mt-0.5">{e.problem}</p>
                    <p className="text-xs text-gray-500 mt-1"><strong>Fix:</strong> {e.fix}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Success ──────────────────────────────────── */}
      {success && (
        <div className="space-y-3">
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-green-800">Order guide uploaded successfully!</p>
                <p className="text-sm text-green-700 mt-1">
                  {success.row_count} items read by AI.
                  {success.auto_matched > 0 && ` ${success.auto_matched} matched to our catalogue automatically.`}
                  {success.needs_review > 0 && ` ${success.needs_review} item${success.needs_review !== 1 ? 's' : ''} will be reviewed by the brewery.`}
                </p>
              </div>
            </div>
          </div>

          {/* Non-fatal row warnings (items that were skipped) */}
          {success.parse_errors && success.parse_errors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                ⚠ {success.parse_errors.length} row{success.parse_errors.length !== 1 ? 's' : ''} were skipped
              </p>
              <div className="space-y-2">
                {success.parse_errors.map((e, i) => (
                  <div key={i} className="text-xs text-amber-700">
                    <span className="font-semibold">{e.location}:</span> {e.problem}.{' '}
                    <span className="text-amber-600">{e.fix}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Current upload status ─────────────────────── */}
      {hasUpload && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="font-medium">{currentUpload.file_name}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{currentUpload.row_count} items</span>
            </div>
            <span className="text-xs text-gray-400">
              {new Date(currentUpload.uploaded_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
