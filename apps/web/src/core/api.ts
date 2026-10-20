/** Thin fetch wrapper. Cookies carry the session; errors follow `{detail:{code,message}}`. */
import { vi } from './copy/vi'

export class ApiError extends Error {
  status: number
  code: string
  details: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

type Body = BodyInit | object | undefined

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const init: RequestInit = { method, credentials: 'include', headers: {} }
  if (body instanceof FormData || typeof body === 'string' || body instanceof Blob) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError(0, 'NETWORK', vi.common.networkError)
  }
  const text = await res.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const d = (data as { detail?: unknown })?.detail
    if (d && typeof d === 'object' && 'code' in d) {
      const dd = d as { code: string; message?: string; details?: unknown }
      throw new ApiError(res.status, dd.code, dd.message ?? vi.common.error, dd.details)
    }
    throw new ApiError(res.status, `HTTP_${res.status}`, typeof d === 'string' ? d : vi.common.error, d)
  }
  return data as T
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: Body) => request<T>('POST', p, b),
  put: <T>(p: string, b?: Body) => request<T>('PUT', p, b),
  patch: <T>(p: string, b?: Body) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
}

/* ---- Shared response types ------------------------------------------------ */

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'teacher' | 'student'
  status?: string
}

export interface CourseStats {
  modules: number
  lessons: number
  sessions: number
  practice_candidates: number
}

export interface CourseSummary {
  id: string
  track: string
  slug: string
  title: string
  status: string
  execution_status: 'active' | 'planned'
  role: string | null
  stats: CourseStats
}

export interface Lesson {
  id: string
  order: number
  label: string
  session_numbers: number[]
  title: string
  content: string | null
  objectives: string | null
  practice: string | null
  practice_candidate: boolean
  kind: 'session' | 'project'
}

export interface Module {
  id: string
  order: number
  code: string
  title: string
  group_path: string | null
  objectives: string | null
  lessons: Lesson[]
}

export interface AssignmentSummary {
  id: string
  slug: string
  title: string
  lesson_id: string | null
  module_id: string | null
  version: number | null
  simulator: string | null
  status: string
}

export interface CourseDetail extends CourseSummary {
  modules: Module[]
  assignments: AssignmentSummary[]
}
