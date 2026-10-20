import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'

/** Renders teacher-authored markdown, sanitized. */
export function Markdown({ source, id }: { source: string; id?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true }) as string), [source])
  return <div className="prose" id={id} dangerouslySetInnerHTML={{ __html: html }} />
}
