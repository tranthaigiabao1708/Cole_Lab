import { api, type CostSummaryOut } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, PageHead, usePageMeta } from '../../core/design-system/components'
import { useAsync } from '../../core/useAsync'

const usd = (v: number) => `$${v.toFixed(v >= 0.01 ? 4 : 6)}`

/** Cost per assignment over finished runs (docs/design/13 §2, AC-17). */
export function CostsPage() {
  usePageMeta(vi.meta.costsTitle, vi.costs.meta)
  const q = useAsync(() => api.get<CostSummaryOut>('/admin/runs/cost-summary'), [])
  const c = vi.costs
  return (
    <div className="page">
      <PageHead code={c.sheetCode} title={c.heading} />
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>{c.meta}</p>
      {q.error ? <ErrorNote error={q.error} onRetry={q.reload} id="costs-error" /> : null}
      {q.loading && !q.data && <Loading />}
      {q.data && (
        <>
          <p className="mono" id="costs-total" style={{ marginBottom: 'var(--space-4)' }}>
            {c.totalLine(q.data.totals.runs, usd(q.data.totals.total_cost_usd))}
          </p>
          {!q.data.pricing_configured && (
            <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>{vi.run.costPricingMissing}</p>
          )}
          {q.data.items.length === 0 ? (
            <p className="muted">{c.empty}</p>
          ) : (
            <div className="table-wrap">
              <table className="table" id="costs-table">
                <thead>
                  <tr>
                    <th>{c.colAssignment}</th>
                    <th className="num">{c.colRuns}</th>
                    <th className="num">{c.colAvgDuration}</th>
                    <th className="num">{c.colTokens}</th>
                    <th className="num">{c.colLlmCost}</th>
                    <th className="num">{c.colAvgCost}</th>
                    <th className="num">{c.colTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((i) => (
                    <tr key={i.assignment_id}>
                      <td>{i.title ?? i.slug ?? i.assignment_id}</td>
                      <td className="num">{i.runs_with_cost} / {i.runs}</td>
                      <td className="num">{(i.avg_duration_ms / 1000).toFixed(1)} s</td>
                      <td className="num">{i.llm_tokens_in} / {i.llm_tokens_out}</td>
                      <td className="num">{usd(i.llm_cost_usd)}</td>
                      <td className="num">{usd(i.avg_cost_usd)}</td>
                      <td className="num">{usd(i.total_cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
