/**
 * Single entry point for all requests to the backend.
 * Uses VITE_API_URL from .env; adds Authorization header from localStorage when present.
 */

const baseUrl = import.meta.env.VITE_API_URL as string

if (!baseUrl) {
  console.warn('VITE_API_URL is not set; API requests may fail.')
}

const STORAGE_TOKEN_KEY = 'token'

function getToken(): string | null {
  return localStorage.getItem(STORAGE_TOKEN_KEY)
}

function buildHeaders(includeBody = false): HeadersInit {
  const headers: Record<string, string> = {}
  if (includeBody) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getToken()
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
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * GET request. Throws ApiError on non-2xx response.
 */
export async function get<T = unknown>(path: string): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(false),
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
export async function post<T = unknown>(path: string, body: object): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(true),
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
export async function patch<T = unknown>(path: string, body: object): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(true),
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
export async function put<T = unknown>(path: string, body: object): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'PUT',
    headers: buildHeaders(true),
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

export { getToken }
export { STORAGE_TOKEN_KEY }
