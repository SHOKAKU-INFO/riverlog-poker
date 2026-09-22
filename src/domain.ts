export type Currency = 'JPY' | 'USD' | 'EUR' | 'GBP' | 'HKD' | 'KRW' | 'PHP' | 'VND' | 'THB' | 'TWD'
export const currencies: Currency[] = ['JPY', 'USD', 'EUR', 'GBP', 'HKD', 'KRW', 'PHP', 'VND', 'THB', 'TWD']
const decimals: Record<Currency, number> = { JPY: 0, USD: 2, EUR: 2, GBP: 2, HKD: 2, KRW: 0, PHP: 2, VND: 0, THB: 2, TWD: 2 }
const blindChoices: Record<Currency, string[]> = {
  JPY: ['100-200', '200-500', '500-1,000', '1,000-2,000'],
  USD: ['1-2', '1-3', '2-5', '5-10'],
  EUR: ['1-2', '1-3', '2-5', '5-10'],
  GBP: ['1-2', '1-3', '2-5', '5-10'],
  HKD: ['10-20', '10-25', '25-50', '50-100'],
  KRW: ['1,000-2,000', '1,000-3,000', '2,000-5,000', '5,000-10,000'],
  PHP: ['25-50', '50-100', '100-200', '200-400'],
  VND: ['10,000-20,000', '10,000-30,000', '25,000-50,000', '50,000-100,000'],
  THB: ['10-20', '10-25', '25-50', '50-100'],
  TWD: ['10-20', '10-30', '25-50', '50-100'],
}
export const blindChoicesFor = (currency: Currency) => blindChoices[currency]

export interface Rate { rate: number; date: string; fetchedAt: string; provider: string; stale?: boolean }
export interface Session {
  id: string; venue: string; location: string; game: 'ライブ' | 'オンライン'; stakes: string; currency: Currency
  startedAt: string; localDate?: string; endedAt?: string; buyIn: number; rebuy: number; cashOut: number; tips: number
  note: string; tripId?: string; rate?: Rate; createdAt: string; updatedAt: string
}
export interface Player { id: string; name: string; venue: string; tags: string[]; note: string; updatedAt: string }
export type ExpenseCategory = '宿泊' | '食事' | '交通' | 'その他'
export interface TripExpense { id: string; category: ExpenseCategory; amount: number; currency: Currency; spentAt: string; note: string; rate?: Rate }
export interface Trip { id: string; name: string; destination: string; startDate: string; endDate: string; expenses: TripExpense[]; note: string; createdAt: string; updatedAt: string }

export const toMinor = (value: number, currency: Currency) => Math.round(value * 10 ** decimals[currency])
export const fromMinor = (value: number, currency: Currency) => value / 10 ** decimals[currency]
export const profit = (session: Session) => session.cashOut - session.buyIn - session.rebuy - session.tips
export const asYen = (minor: number, currency: Currency, rate?: Rate) => currency === 'JPY' ? minor : rate ? Math.round(fromMinor(minor, currency) * rate.rate) : null
export const calendarDayTotal = (sessions: Session[]) => {
  const completed = sessions.filter(session => session.endedAt)
  if (!completed.length) return null
  const converted = completed.map(session => asYen(profit(session), session.currency, session.rate))
  if (converted.some(value => value === null)) return null
  return converted.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}
export const tripsForDate = (date: string, trips: Trip[]) => trips.filter(trip => date >= trip.startDate && date <= trip.endDate)
export const sessionsInTrip = (trip: Trip, sessions: Session[]) => sessions.filter(session => { if (session.tripId) return session.tripId === trip.id; const date = session.localDate || session.startedAt.slice(0, 10); return date >= trip.startDate && date <= trip.endDate })
export const sessionsForTrip = (trip: Trip, sessions: Session[]) => sessionsInTrip(trip, sessions).filter(session => Boolean(session.endedAt))
export const tripPokerYen = (trip: Trip, sessions: Session[]) => {
  const values = sessionsForTrip(trip, sessions).map(session => asYen(profit(session), session.currency, session.rate))
  return values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}
export const tripExpenseYen = (trip: Trip) => {
  const values = trip.expenses.map(expense => asYen(expense.amount, expense.currency, expense.rate))
  return values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}
export const tripNetYen = (trip: Trip, sessions: Session[]) => { const poker = tripPokerYen(trip, sessions); const expenses = tripExpenseYen(trip); return poker === null || expenses === null ? null : poker - expenses }
export const money = (minor: number, currency: Currency, signed = false) => {
  const value = fromMinor(minor, currency)
  const symbol = { JPY: '¥', USD: '$', EUR: '€', GBP: '£', HKD: 'HK$', KRW: '₩', PHP: '₱', VND: '₫', THB: '฿', TWD: 'NT$' }[currency]
  const digits = decimals[currency]
  return `${signed && value > 0 ? '+' : value < 0 ? '-' : ''}${symbol}${Math.abs(value).toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}
export const dateLabel = (iso: string) => new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(iso))
export const shortDate = (iso: string) => new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(iso))
export const hours = (session: Session, now = Date.now()) => Math.max(0, ((session.endedAt ? new Date(session.endedAt).getTime() : now) - new Date(session.startedAt).getTime()) / 3_600_000)
export const duration = (session: Session, now = Date.now()) => {
  const total = Math.floor(hours(session, now) * 60)
  return `${Math.floor(total / 60)}時間${String(total % 60).padStart(2, '0')}分`
}

const stamp = (days: number, hour = 10) => new Date(Date.now() - days * 86_400_000 + hour * 3_600_000).toISOString()
export const sampleSessions: Session[] = [
  { id: 'demo-1', venue: 'Bellagio', location: 'Las Vegas', game: 'ライブ', stakes: '2-5', currency: 'USD', startedAt: stamp(1), endedAt: stamp(1, 16), buyIn: 60000, rebuy: 30000, cashOut: 137500, tips: 1500, note: '夕方のテーブル。常連が多め。', rate: { rate: 149.82, date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), fetchedAt: stamp(1), provider: 'Frankfurter' }, createdAt: stamp(1), updatedAt: stamp(1) },
  { id: 'demo-2', venue: 'Aria', location: 'Las Vegas', game: 'ライブ', stakes: '1-3', currency: 'USD', startedAt: stamp(3), endedAt: stamp(3, 14), buyIn: 30000, rebuy: 0, cashOut: 20500, tips: 500, note: '', rate: { rate: 149.24, date: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10), fetchedAt: stamp(3), provider: 'Frankfurter' }, createdAt: stamp(3), updatedAt: stamp(3) },
  { id: 'demo-3', venue: 'PokerStars', location: 'Online', game: 'オンライン', stakes: '0.5-1', currency: 'USD', startedAt: stamp(5), endedAt: stamp(5, 13), buyIn: 20000, rebuy: 0, cashOut: 27800, tips: 0, note: '', rate: { rate: 148.64, date: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10), fetchedAt: stamp(5), provider: 'Frankfurter' }, createdAt: stamp(5), updatedAt: stamp(5) },
]
export const samplePlayers: Player[] = [
  { id: 'demo-p1', name: 'Michael', venue: 'Bellagio', tags: ['タイト', '常連'], note: '3番席。プリフロップは堅め、リバーの大きなベットは強い傾向。', updatedAt: stamp(1) },
  { id: 'demo-p2', name: 'Kei', venue: 'Bellagio', tags: ['アグレッシブ'], note: '8番席。ボタンからのオープン頻度が高い。', updatedAt: stamp(1) },
]
export const sampleTrips: Trip[] = [{
  id: 'demo-trip-1', name: 'ラスベガス遠征', destination: 'Las Vegas',
  startDate: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10),
  expenses: [
    { id: 'demo-e1', category: '宿泊', amount: 42000, currency: 'USD', spentAt: new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10), note: 'Hotel', rate: { rate: 149.5, date: new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10), fetchedAt: stamp(6), provider: 'Frankfurter' } },
    { id: 'demo-e2', category: '交通', amount: 120000, currency: 'JPY', spentAt: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10), note: '日本で予約した往復航空券' },
    { id: 'demo-e3', category: '食事', amount: 12000, currency: 'USD', spentAt: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), note: '', rate: { rate: 149.5, date: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), fetchedAt: stamp(2), provider: 'Frankfurter' } },
  ], note: '', createdAt: stamp(7), updatedAt: stamp(1),
}]
