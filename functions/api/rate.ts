interface Env { [key: string]: unknown }
interface Context { request: Request; env: Env; waitUntil(promise: Promise<unknown>): void }
const currencies = new Set(['JPY', 'USD', 'EUR', 'GBP', 'HKD', 'KRW', 'PHP', 'VND', 'THB', 'TWD'])

export async function onRequestGet(context: Context): Promise<Response> {
  const url = new URL(context.request.url)
  const base = (url.searchParams.get('base') || '').toUpperCase()
  const quote = (url.searchParams.get('quote') || 'JPY').toUpperCase()
  if (!currencies.has(base) || !currencies.has(quote)) return Response.json({ error: 'Unsupported currency' }, { status: 400 })
  if (base === quote) return Response.json({ rate: 1, date: new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString(), provider: 'Identity' })
  const api = `https://api.frankfurter.dev/v2/rate/${base.toLowerCase()}/${quote.toLowerCase()}`
  try {
    const response = await fetch(api, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 21_600, cacheEverything: true } } as RequestInit)
    if (!response.ok) throw new Error(`Upstream ${response.status}`)
    const data = await response.json() as { rate?: number; date?: string }
    if (!Number.isFinite(data.rate) || !data.rate || !data.date) throw new Error('Invalid rate data')
    return Response.json({ rate: data.rate, date: data.date, fetchedAt: new Date().toISOString(), provider: 'Frankfurter' }, { headers: { 'Cache-Control': 'public, max-age=3600, stale-if-error=86400' } })
  } catch { return Response.json({ error: 'Rate unavailable' }, { status: 503 }) }
}
