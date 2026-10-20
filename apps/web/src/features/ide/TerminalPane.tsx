import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { vi } from '../../core/copy/vi'

export interface TerminalHandle {
  send: (text: string) => void
  focus: () => void
}

type State = 'connecting' | 'open' | 'closed'

export const TerminalPane = forwardRef<TerminalHandle, { workspaceId: string; enabled: boolean }>(
  function TerminalPane({ workspaceId, enabled }, ref) {
    const host = useRef<HTMLDivElement>(null)
    const term = useRef<Terminal | null>(null)
    const sock = useRef<WebSocket | null>(null)
    const [state, setState] = useState<State>('connecting')
    const [nonce, setNonce] = useState(0)

    useImperativeHandle(ref, () => ({
      send: (text: string) => {
        if (sock.current?.readyState === WebSocket.OPEN) sock.current.send(JSON.stringify({ type: 'input', data: text }))
        term.current?.focus()
      },
      focus: () => term.current?.focus(),
    }))

    useEffect(() => {
      if (!enabled || !host.current) return
      const t = new Terminal({
        fontFamily: "'JetBrains Mono', Consolas, monospace",
        fontSize: 13,
        cursorBlink: true,
        theme: {
          background: '#0d0e10',
          foreground: '#ece9e2',
          cursor: '#e06a3b',
          selectionBackground: '#e06a3b55',
          black: '#1a1c20',
          brightBlack: '#5a5f69',
          red: '#c8372d',
          green: '#7fa888',
          yellow: '#c9962e',
          blue: '#7f9aa8',
          magenta: '#b58aa0',
          cyan: '#7f9a8c',
          white: '#ece9e2',
        },
        scrollback: 5000,
      })
      const fit = new FitAddon()
      t.loadAddon(fit)
      t.open(host.current)
      fit.fit()
      term.current = t
      setState('connecting')
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/api/workspaces/${workspaceId}/pty?cols=${t.cols}&rows=${t.rows}`)
      ws.binaryType = 'arraybuffer'
      sock.current = ws
      ws.onopen = () => {
        setState('open')
        ws.send(JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows }))
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const m = JSON.parse(ev.data)
            if (m.type === 'error') t.writeln(`\r\n\x1b[31m${vi.workspace.runnerDown} (${m.code})\x1b[0m`)
          } catch {
            t.write(ev.data)
          }
        } else {
          t.write(new Uint8Array(ev.data))
        }
      }
      ws.onclose = () => setState('closed')
      const sub = t.onData((d) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: d }))
      })
      const ro = new ResizeObserver(() => {
        try {
          fit.fit()
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows }))
        } catch {
          /* not visible */
        }
      })
      ro.observe(host.current)
      return () => {
        ro.disconnect()
        sub.dispose()
        ws.close()
        t.dispose()
        term.current = null
      }
    }, [workspaceId, enabled, nonce])

    return (
      <div className="term">
        <div ref={host} className="term__host" id="terminal" />
        {state !== 'open' && (
          <div className="term__overlay">
            <span>{state === 'connecting' ? vi.workspace.connecting : vi.workspace.disconnected}</span>
            {state === 'closed' && (
              <button className="btn btn--ghost btn--sm" id="btn-term-reconnect" onClick={() => setNonce((n) => n + 1)}>
                {vi.workspace.reconnect}
              </button>
            )}
          </div>
        )}
      </div>
    )
  },
)
