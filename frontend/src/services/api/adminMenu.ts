import { api } from './client'

// ---------------------------------------------------------------------------
// Admin menu management — raw category / menu-item CRUD against the backend
// apiResources. This is deliberately separate from services/api/menu.ts, which
// maps items into the trimmed POS Product shape for the order screens; the
// admin editor needs the full rows (slug, sort_order, availability, …).
// ---------------------------------------------------------------------------

export type AdminCategory = {
  id: number
  name: string
  slug: string
  description: string | null
  image: string | null
  sort_order: number
  is_active: boolean
}

export type AdminMenuItem = {
  id: number
  category_id: number | null
  name: string
  slug: string
  description: string | null
  price: string // decimal cast serializes as a string, e.g. "6.50"
  image: string | null
  is_available: boolean
  sort_order: number
  category: { id: number; name: string; slug: string } | null
}

// --- Categories ------------------------------------------------------------

export function fetchAdminCategories(): Promise<AdminCategory[]> {
  return api<AdminCategory[]>('/categories')
}

export type CategoryInput = {
  name: string
  description?: string | null
  sort_order?: number | null
  is_active?: boolean
}

export function createCategory(input: CategoryInput): Promise<AdminCategory> {
  return api<AdminCategory>('/categories', { method: 'POST', body: input })
}

export function updateCategory(id: number, input: Partial<CategoryInput>): Promise<AdminCategory> {
  return api<AdminCategory>(`/categories/${id}`, { method: 'PUT', body: input })
}

export function deleteCategory(id: number): Promise<{ message: string }> {
  return api<{ message: string }>(`/categories/${id}`, { method: 'DELETE' })
}

// --- Menu items ------------------------------------------------------------

export function fetchAdminMenuItems(): Promise<AdminMenuItem[]> {
  return api<AdminMenuItem[]>('/menu-items')
}

export type MenuItemInput = {
  category_id: number
  name: string
  price: number
  description?: string | null
  is_available?: boolean
  sort_order?: number | null
}

export function createMenuItem(input: MenuItemInput): Promise<AdminMenuItem> {
  return api<AdminMenuItem>('/menu-items', { method: 'POST', body: input })
}

export function updateMenuItem(id: number, input: Partial<MenuItemInput>): Promise<AdminMenuItem> {
  return api<AdminMenuItem>(`/menu-items/${id}`, { method: 'PUT', body: input })
}

export function deleteMenuItem(id: number): Promise<{ message: string }> {
  return api<{ message: string }>(`/menu-items/${id}`, { method: 'DELETE' })
}
