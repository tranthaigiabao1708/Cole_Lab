/**
 * Functional icon whitelist (docs/design/10 §1.5). Thin 1.5px strokes, monochrome.
 * Adding an icon requires review: AI-flavoured glyphs (sparkles, wands, robots,
 * brains, glowing orbs, starred chat bubbles) are forbidden — see scripts/check-icons.
 */
import type { SVGProps } from 'react'

const PATHS = {
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Zm0 0v4h4',
  folder: 'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z',
  folderOpen: 'M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v1M3 7v11h16l2-8H6l-3 8',
  play: 'M7 5v14l11-7L7 5Z',
  stop: 'M6 6h12v12H6z',
  terminal: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  download: 'M12 4v12m0 0-4-4m4 4 4-4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  chevronRight: 'm9 6 6 6-6 6',
  chevronDown: 'm6 9 6 6 6-6',
  chevronLeft: 'm15 6-6 6 6 6',
  arrowRight: 'M5 12h14m-5-5 5 5-5 5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  star: 'm12 4 2.4 5 5.5.7-4 3.8 1 5.5L12 16.4 7.1 19l1-5.5-4-3.8 5.5-.7L12 4Z',
  check: 'm5 12 5 5 9-10',
  alert: 'M12 4 2.5 20h19L12 4Zm0 6v4m0 3v.01',
  save: 'M5 4h11l3 3v13H5V4Zm3 0v5h7V4M8 20v-6h8v6',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
} as const

export type IconName = keyof typeof PATHS
export const ICON_WHITELIST = Object.keys(PATHS) as IconName[]

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  filled?: boolean
}

export function Icon({ name, size = 16, filled = false, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
