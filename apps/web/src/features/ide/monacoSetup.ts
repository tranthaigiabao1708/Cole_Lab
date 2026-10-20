/** Monaco served from the local bundle (no CDN) with Vite-built workers. */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'

self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  },
}

monaco.editor.defineTheme('cole-ink', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b6d72', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'f0a07c' },
    { token: 'string', foreground: 'b5c9a8' },
    { token: 'number', foreground: 'e3c38a' },
  ],
  colors: {
    'editor.background': '#131418',
    'editor.foreground': '#ece9e2',
    'editorLineNumber.foreground': '#3a3e46',
    'editorLineNumber.activeForeground': '#b9b5ac',
    'editor.selectionBackground': '#e06a3b44',
    'editor.lineHighlightBackground': '#1a1c20',
    'editorCursor.foreground': '#e06a3b',
    'editorIndentGuide.background1': '#22252a',
    'editorWidget.background': '#1a1c20',
  },
})

loader.config({ monaco })

export function languageOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return (
    {
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      json: 'json',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
      sh: 'shell',
      txt: 'plaintext',
      jsonl: 'plaintext',
      toml: 'ini',
      ini: 'ini',
      sql: 'sql',
      html: 'html',
      css: 'css',
    } as Record<string, string>
  )[ext] ?? 'plaintext'
}
