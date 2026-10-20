import { useCallback, useEffect, useRef, useState } from 'react'

/** Minimal data loader: { data, error, loading, reload }. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const run = useCallback(() => {
    const my = ++seq.current
    setLoading(true)
    setError(null)
    fn()
      .then((d) => {
        if (my === seq.current) setData(d)
      })
      .catch((e) => {
        if (my === seq.current) setError(e)
      })
      .finally(() => {
        if (my === seq.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    run()
  }, [run])

  return { data, error, loading, reload: run, setData }
}
