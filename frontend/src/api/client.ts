/**
 * Single entry point for all requests to the backend.
 * Uses VITE_API_URL from .env; adds Authorization header from localStorage when present.
 */

const baseUrl = import.meta.env.VITE_API_URL as string

if (!baseUrl) {
  console.warn('VITE_API_URL is not set; API requests may fail.')
}

const STORAGE_TOKEN_KEY = 'token'
export const STORAGE_STAFF_TOKEN_KEY = 'staffToken'

function getToken(): string | null {
  return localStorage.getItem(STORAGE_TOKEN_KEY)
}

function getStaffToken(): string | null {
  return localStorage.getItem(STORAGE_STAFF_TOKEN_KEY)
}

function buildHeaders(includeBody = false, useStaffToken = false): HeadersInit {
  const headers: Record<string, string> = {}
  if (includeBody) {
    headers['Content-Type'] = 'application/json'
  }
  const token = useStaffToken ? getStaffToken() : getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

function buildUrl(path: string): string {
  const base = baseUrl?.replace(/\/$/, '') ?? ''
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export class ApiError extends Error {
  status: number
  body?: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * GET request. Throws ApiError on non-2xx response.
 */
export async function get<T = unknown>(path: string, useStaffToken = false): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(false, useStaffToken),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string })?.error ?? res.statusText,
      res.status,
      data
    )
  }
  return data as T
}

/**
 * POST request with JSON body. Throws ApiError on non-2xx response.
 */
export async function post<T = unknown>(path: string, body: object, useStaffToken = false): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(true, useStaffToken),
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string })?.error ?? res.statusText,
      res.status,
      data
    )
  }
  return data as T
}

/**
 * PATCH request with JSON body. Throws ApiError on non-2xx response.
 */
export async function patch<T = unknown>(path: string, body: object, useStaffToken = false): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(true, useStaffToken),
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string })?.error ?? res.statusText,
      res.status,
      data
    )
  }
  return data as T
}

/**
 * PUT request with JSON body. Throws ApiError on non-2xx response.
 */
export async function put<T = unknown>(path: string, body: object, useStaffToken = false): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'PUT',
    headers: buildHeaders(true, useStaffToken),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const data: unknown = text.trim() ? JSON.parse(text) : undefined
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string })?.error ?? res.statusText,
      res.status,
      data
    )
  }
  return data as T
}

/**
 * DELETE request. Throws ApiError on non-2xx response. Handles 204 No Content.
 */
export async function del<T = unknown>(path: string, useStaffToken = false): Promise<T | void> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'DELETE',
    headers: buildHeaders(false, useStaffToken),
  })
  const text = await res.text()
  if (!res.ok) {
    let data: object = {}
    try {
      if (text.trim()) data = JSON.parse(text) as object
    } catch (_) { /* ignore */ }
    throw new ApiError(
      (data as { error?: string })?.error ?? res.statusText,
      res.status,
      data
    )
  }
  if (res.status === 204 || !text.trim()) return
  return JSON.parse(text) as T
}

export { getToken, getStaffToken }
export { STORAGE_TOKEN_KEY }
