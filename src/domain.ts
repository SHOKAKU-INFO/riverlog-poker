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
export type TableSeatCount = 6 | 8 | 9
export interface TablePlayer {
  seat: number; playerId?: string; name: string; stackBb?: number; tags: string[]; note: string
}
export interface PokerTableState {
  seatCount: TableSeatCount; heroSeat: number; buttonSeat: number; handNumber: number; players: TablePlayer[]
}
export interface Session {
  id: string; venue: string; location: string; game: 'ライブ' | 'オンライン'; stakes: string; currency: Currency
  startedAt: string; localDate?: string; endedAt?: string; buyIn: number; rebuy: number; cashOut: number; tips: number
  note: string; format?: 'cash' | 'tournament'; tripId?: string; rate?: Rate; table?: PokerTableState; createdAt: string; updatedAt: string
}
export interface Player { id: string; name: string; venue: string; tags: string[]; note: string; updatedAt: string }
export type ExpenseCategory = '宿泊' | '食事' | '交通' | 'その他'
export interface TripExpense { id: string; category: ExpenseCategory; amount: number; currency: Currency; spentAt: string; note: string; rate?: Rate }
export interface Trip { id: string; name: string; destination: string; startDate: string; endDate: string; expenses: TripExpense[]; note: string; createdAt: string; updatedAt: string }

export const toMinor = (value: number, currency: Currency) => Math.round(value * 10 ** decimals[currency])
export const fromMinor = (value: number, currency: Currency) => value / 10 ** decimals[currency]
export const profit = (session: Session) => session.cashOut - session.buyIn - session.rebuy - session.tips
export const sessionFormat = (session: Session) => session.format || 'cash'
export const sessionRoi = (session: Session) => { const invested = session.buyIn + session.rebuy + session.tips; return invested > 0 ? profit(session) / invested : null }
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

const tablePositions: Record<TableSeatCount, string[]> = {
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'],
}
export const tablePosition = (seat: number, buttonSeat: number, seatCount: TableSeatCount) => tablePositions[seatCount][(seat - buttonSeat + seatCount) % seatCount]
export const defaultPokerTable = (seatCount: TableSeatCount = 9): PokerTableState => ({ seatCount, heroSeat: 1, buttonSeat: 1, handNumber: 1, players: [] })
export const nextPokerHand = (table: PokerTableState): PokerTableState => ({ ...table, buttonSeat: table.buttonSeat % table.seatCount + 1, handNumber: table.handNumber + 1 })
