/**
 * Track configuration (docs/design/10 §2). Tracks are an attribute of a course,
 * not separate apps. "plannedKinds" are the approved planned assignment kinds
 * shown in the StatusBlock — never generated freely.
 */
export type TrackId = 'AI_ENGINEER' | 'DATA_ENGINEER' | 'BUSINESS_ANALYST'

export interface TrackConfig {
  id: TrackId
  slug: 'ai' | 'de' | 'ba'
  code: string
  name: string
  surface: 'stage' | 'fog' | 'ochre'
  executionEnabled: boolean
  plannedKinds: string[]
}

export const TRACKS: Record<TrackId, TrackConfig> = {
  AI_ENGINEER: {
    id: 'AI_ENGINEER',
    slug: 'ai',
    code: 'AI',
    name: 'AI Engineer',
    surface: 'stage',
    executionEnabled: true,
    plannedKinds: [],
  },
  DATA_ENGINEER: {
    id: 'DATA_ENGINEER',
    slug: 'de',
    code: 'DE',
    name: 'Data Engineer',
    surface: 'fog',
    executionEnabled: false,
    plannedKinds: ['Pipeline ETL', 'Data Quality'],
  },
  BUSINESS_ANALYST: {
    id: 'BUSINESS_ANALYST',
    slug: 'ba',
    code: 'BA',
    name: 'Business Analyst',
    surface: 'ochre',
    executionEnabled: false,
    plannedKinds: ['Đặc tả yêu cầu', 'Mô hình quy trình'],
  },
}

export const TRACK_ORDER: TrackId[] = ['AI_ENGINEER', 'DATA_ENGINEER', 'BUSINESS_ANALYST']

export function trackOf(id: string): TrackConfig {
  return TRACKS[id as TrackId] ?? TRACKS.AI_ENGINEER
}

export function trackBySlug(slug: string | undefined): TrackConfig | undefined {
  return Object.values(TRACKS).find((t) => t.slug === slug)
}
