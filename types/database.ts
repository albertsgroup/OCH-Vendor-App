export type Role = 'admin' | 'vendor'

export interface Profile {
  id: string
  role: Role
  vendor_name: string | null
  is_active: boolean
  created_at: string
}

export interface Item {
  id: string
  item_number: string
  item_name: string
  is_active: boolean
  created_at: string
}

export interface PriceSubmission {
  id: string
  vendor_id: string
  item_id: string
  price: number
  week_start: string
  updated_at: string
}

// Legacy type kept for any remaining references
export interface LowestPriceRow {
  item_id: string
  item_number: string
  item_name: string
  lowest_price: number
  lowest_vendor: string
  all_prices: { vendor_name: string; price: number }[]
}

// ---- Upload system ----

export interface VendorUpload {
  id: string
  vendor_id: string
  week_start: string
  file_name: string
  file_path: string
  row_count: number
  uploaded_at: string
}

export interface VendorUploadRow {
  id: string
  upload_id: string
  vendor_item_number: string | null
  item_name: string | null
  unit_size: string | null
  price: number
  internal_item_id: string | null
  ai_suggested_item_id: string | null
  ai_confidence: number | null
  needs_admin_review: boolean
  ai_match_reason: string | null
  review_resolved: boolean
  sort_order: number
}

export interface VendorItemMapping {
  id: string
  vendor_id: string
  vendor_item_number: string
  internal_item_id: string
}

// ---- Dashboard view types ----

/** A single row in View 1 (vendor-grouped) */
export interface GroupedRow {
  id: string
  vendor_id: string
  vendor_name: string
  vendor_item_number: string | null
  item_name: string | null
  unit_size: string | null
  price: number
  internal_item_id: string | null
  internal_item_number: string | null   // resolved from items table
  internal_item_name: string | null     // resolved from items table
}

/** A single item row in View 2 (price comparison) */
export interface ComparisonRow {
  internal_item_id: string
  internal_item_number: string
  internal_item_name: string
  prices: Record<string, number | null>  // vendor_id → price
  lowest_price: number
  lowest_vendor_id: string
  lowest_vendor_name: string
}

// ---- AI cross-vendor matching (View 2) ----

export interface MatchVendorItem {
  rowId: string
  vendorId: string
  vendorName: string
  itemName: string
  vendorItemNumber: string | null
  unitSize: string | null
  price: number
}

export interface MatchGroup {
  commonName: string
  isMatched: boolean        // true = 2+ vendors carry this item
  confidence?: 'high' | 'medium' | 'low'
  matchReason?: string
  vendorItems: MatchVendorItem[]
}

// ---- Cart ----

export interface CartItem {
  rowId: string
  vendorId: string
  vendorName: string
  vendorItemNumber: string | null
  itemName: string
  unitSize: string | null
  price: number
  quantity: number
}

/** Aggregated vendor info for both views */
export interface VendorSummary {
  vendor_id: string
  vendor_name: string
  upload_id: string | null
  file_name: string | null
  uploaded_at: string | null
  row_count: number
  total_spend: number       // sum of all their prices
}
