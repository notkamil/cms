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

/** Returns the current member JWT from localStorage, or null. */
function getToken(): string | null {
  return localStorage.getItem(STORAGE_TOKEN_KEY)
}

/** Returns the current staff JWT from localStorage, or null. */
function getStaffToken(): string | null {
  return localStorage.getItem(STORAGE_STAFF_TOKEN_KEY)
}

/** Builds request headers: optional Content-Type, and Authorization Bearer when token present. */
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

/** Resolves full API URL for a path (uses VITE_API_URL, normalizes trailing slash). */
function buildUrl(path: string): string {
  const base = baseUrl?.replace(/\/$/, '') ?? ''
  const p = path.startsWith('/') ? path : `/${path}`
  // Avoid double prefix when path already starts with base (e.g. base=/api, path=/api/staff/...)
  if (base && p.startsWith(base)) return p
  return `${base}${p}`
}

/** Maps HTTP status to Russian message when backend does not return error body. */
function statusTextToRussian(status: number, fallback: string): string {
  if (fallback && /[а-яА-ЯёЁ]/.test(fallback)) return fallback
  const map: Record<number, string> = {
    400: 'Неверный запрос',
    401: 'Требуется авторизация',
    403: 'Доступ запрещён',
    404: 'Не найдено',
    409: 'Конфликт данных',
    500: 'Ошибка сервера',
    502: 'Сервер недоступен',
    503: 'Сервис недоступен',
  }
  return map[status] ?? 'Произошла ошибка'
}

/** Thrown on non-2xx API response. message is shown to user (Russian if from status). */
export class ApiError extends Error {
  status: number
  body?: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(statusTextToRussian(status, message))
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
    const msg = (data as { error?: string })?.error ?? res.statusText
    throw new ApiError(msg, res.status, data)
  }
  return data as T
}

/**
 * POST request with JSON body. Throws ApiError on non-2xx response.
 * Handles 204 No Content (empty body) without parsing JSON.
 */
export async function post<T = unknown>(path: string, body: object, useStaffToken = false): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(true, useStaffToken),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const data: unknown = text.trim() ? (() => { try { return JSON.parse(text) } catch { return {} } })() : {}
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
 * Handles 204 No Content (empty body) without parsing JSON.
 */
export async function patch<T = unknown>(path: string, body: object, useStaffToken = false): Promise<T> {
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(true, useStaffToken),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const data: unknown = text.trim() ? (() => { try { return JSON.parse(text) } catch { return {} } })() : {}
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
