import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { Signal } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import type { Contract } from '../../pages/assignments/AssignmentPage'
import type { TreeEntry } from './FileTree'

export interface Manifest {
  manifest?: string
  assignment?: string
  mode?: string | null
  artifacts?: Record<string, { path?: string; entry?: string; command?: string }>
}
interface ReportError {
  code: string
  artifact_key: string | null
  message_vi: string
  hint_vi: string
}
interface Report {
  status: 'valid' | 'invalid'
  errors: ReportError[]
  warnings: ReportError[]
}

export function ManifestPanel({
  workspaceId,
  contract,
  initial,
  files,
  readOnly,
  beforeSubmit,
  onSubmitted,
}: {
  workspaceId: string
  contract: Contract
  initial: Manifest
  files: TreeEntry[]
  readOnly: boolean
  beforeSubmit: () => Promise<void>
  onSubmitted?: (sub: { id: string; seq: number }) => void
}) {
  const [m, setM] = useState<Manifest>(initial)
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState<'check' | 'submit' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [last, setLast] = useState<{ id: string; seq: number } | null>(null)

  useEffect(() => {
    api.get<{ manifest: Manifest; report: Report }>(`/workspaces/${workspaceId}/manifest`).then((r) => {
      setM(r.manifest)
      setReport(r.report)
    }).catch(() => undefined)
  }, [workspaceId])

  const arts = Object.entries(contract.artifacts ?? {})
  const modes = contract.modes ? Object.keys(contract.modes) : []
  const required = new Set(
    m.mode && contract.modes?.[m.mode] ? contract.modes[m.mode].requires ?? [] : arts.filter(([, a]) => a.required).map(([k]) => k),
  )
  const fileList = files.filter((f) => f.type === 'file' && !f.readonly).map((f) => f.path)

  function setArt(key: string, field: 'path' | 'entry' | 'command', value: string) {
    setM((cur) => ({ ...cur, artifacts: { ...(cur.artifacts ?? {}), [key]: { ...(cur.artifacts?.[key] ?? {}), [field]: value } } }))
  }

  async function check() {
    setBusy('check')
    setErr(null)
    try {
      const r = await api.put<{ manifest: Manifest; report: Report }>(`/workspaces/${workspaceId}/manifest`, { manifest: m })
      setReport(r.report)
      return r.report
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(null)
    }
  }

  async function submit() {
    await beforeSubmit()
    const r = await check()
    if (!r || r.status !== 'valid') return
    setBusy('submit')
    try {
      const s = await api.post<{ id: string; seq: number }>(`/workspaces/${workspaceId}/submit`, { manifest: m })
      setLast(s)
      onSubmitted?.(s)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SUBMISSION_INVALID') {
        setReport((e.details as { report: Report }).report)
      } else setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const errsFor = (k: string) => (report?.errors ?? []).filter((e) => e.artifact_key === k)
  const general = (report?.errors ?? []).filter((e) => !e.artifact_key)

  return (
    <div className="mpanel">
      <div className="mpanel__head">
        <span>{vi.manifest.title}</span>
        {report && (
          <Signal tone={report.status === 'valid' ? 'pass' : 'critical'}>
            {report.status === 'valid' ? vi.manifest.valid : vi.manifest.invalid}
          </Signal>
        )}
      </div>
      <div className="mpanel__body">
        {modes.length > 0 && (
          <label className="field">
            <span className="field__label">{vi.manifest.mode}</span>
            <select className="select select--sm" id="manifest-mode" value={m.mode ?? ''} disabled={readOnly}
              onChange={(e) => setM({ ...m, mode: e.target.value })}>
              <option value="">{vi.common.none}</option>
              {modes.map((k) => (
                <option key={k} value={k}>{contract.modes![k].label ?? k}</option>
              ))}
            </select>
          </label>
        )}
        {arts.map(([k, a]) => {
          const d = m.artifacts?.[k] ?? {}
          const errs = errsFor(k)
          const exts = a.accepted_formats ?? []
          const opts = exts.length ? fileList.filter((f) => exts.some((x) => f.toLowerCase().endsWith('.' + x))) : fileList
          return (
            <div key={k} className={`mart${errs.length ? ' has-error' : ''}`}>
              <div className="mart__head">
                <span className="mono">{k}</span>
                <span className="annot">{required.has(k) ? vi.manifest.required : vi.manifest.optional}</span>
              </div>
              <div className="mart__kind">{a.label ?? vi.assignment.kinds[a.kind] ?? a.kind}</div>
              {(a.kind === 'file' || a.kind === 'config') && (
                <select className="select select--sm" id={`manifest-${k}-path`} value={d.path ?? ''} disabled={readOnly}
                  onChange={(e) => setArt(k, 'path', e.target.value)} aria-label={`${k} — ${vi.manifest.pickFile}`}>
                  <option value="">{vi.manifest.notDeclared}</option>
                  {d.path && !opts.includes(d.path) && <option value={d.path}>{d.path}</option>}
                  {opts.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              )}
              {a.kind === 'python_entrypoint' && (
                <input className="input mono select--sm" id={`manifest-${k}-entry`} placeholder={vi.manifest.entry}
                  value={d.entry ?? ''} disabled={readOnly} onChange={(e) => setArt(k, 'entry', e.target.value)} />
              )}
              {a.kind === 'http_service' && (
                <>
                  <input className="input mono select--sm" id={`manifest-${k}-command`} placeholder={vi.manifest.command}
                    value={d.command ?? ''} disabled={readOnly} onChange={(e) => setArt(k, 'command', e.target.value)} />
                  <select className="select select--sm" id={`manifest-${k}-path`} value={d.path ?? ''} disabled={readOnly}
                    onChange={(e) => setArt(k, 'path', e.target.value)}>
                    <option value="">{vi.manifest.notDeclared}</option>
                    {fileList.filter((f) => f.endsWith('.py')).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </>
              )}
              {errs.map((e, i) => (
                <div key={i} className="mart__err" role="alert">
                  <strong>{e.message_vi}</strong>
                  <span>{e.hint_vi}</span>
                  <code>{e.code}</code>
                </div>
              ))}
            </div>
          )
        })}
        {general.map((e, i) => (
          <div key={i} className="mart__err" role="alert">
            <strong>{e.message_vi}</strong>
            <span>{e.hint_vi}</span>
          </div>
        ))}
        {err && <div className="mart__err" role="alert">{err}</div>}
      </div>
      {!readOnly && (
        <div className="mpanel__foot">
          <button className="btn btn--ghost btn--sm" id="btn-manifest-check" disabled={!!busy} onClick={check}>
            <Icon name="check" size={14} />
            {vi.manifest.check}
          </button>
          <button className="btn btn--ember btn--sm" id="btn-submit" disabled={!!busy} onClick={submit}>
            <Icon name="upload" size={14} />
            {busy === 'submit' ? vi.manifest.submitting : vi.manifest.submit}
          </button>
        </div>
      )}
      {last && (
        <div className="mpanel__done">
          <Signal tone="pass">{vi.manifest.submitted(last.seq)}</Signal>
          <Link className="go" to={`/submissions/${last.id}`} id="link-last-submission">
            {vi.manifest.viewSubmission} <Icon name="arrowRight" size={14} />
          </Link>
        </div>
      )}
    </div>
  )
}
