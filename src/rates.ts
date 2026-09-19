import type { Currency, Rate } from './domain'

const cacheKey = (currency: Currency) => `riverlog-rate-${currency}`
export async function getRate(currency: Currency): Promise<Rate | undefined> {
  if (currency === 'JPY') return { rate: 1, date: new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString(), provider: 'JPY' }
  const raw = localStorage.getItem(cacheKey(currency))
  let cached: Rate | undefined
  try { cached = raw ? JSON.parse(raw) as Rate : undefined } catch { /* ignore invalid cache */ }
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 6 * 3_600_000) return cached
  try {
    const response = await fetch(`/api/rate?base=${currency}&quote=JPY`)
    if (!response.ok) throw new Error('rate unavailable')
    const rate = await response.json() as Rate
    if (!Number.isFinite(rate.rate) || rate.rate <= 0) throw new Error('invalid rate')
    localStorage.setItem(cacheKey(currency), JSON.stringify(rate))
    return rate
  } catch { return cached ? { ...cached, stale: true } : undefined }
}
