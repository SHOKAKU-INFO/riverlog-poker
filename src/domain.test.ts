import { describe, expect, it } from 'vitest'
import { activeTableSeats, asYen, blindChoicesFor, calendarDayTotal, currentStreetBet, defaultPokerTable, forcedPokerActions, fromMinor, money, movePokerSeat, nextPokerHand, profit, sessionRoi, sessionsForTrip, sessionsInTrip, settlePokerHand, streetContributionFor, tablePosition, tablePositionFor, toMinor, tripExpenseYen, tripNetYen, tripPokerYen, tripsForDate, unfoldedTableSeats, type PokerAction, type Session, type Trip } from './domain'

const base: Session = { id: 's1', venue: 'Test', location: 'Las Vegas', game: 'ライブ', stakes: '$1/$3', currency: 'USD', startedAt: '2026-09-01T00:00:00Z', endedAt: '2026-09-01T04:00:00Z', buyIn: 30000, rebuy: 10000, cashOut: 50000, tips: 1000, note: '', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T04:00:00Z' }
describe('currency accounting', () => {
  it('keeps USD cents and JPY yen as integers', () => { expect(toMinor(300.25, 'USD')).toBe(30025); expect(fromMinor(30025, 'USD')).toBe(300.25); expect(toMinor(300, 'JPY')).toBe(300) })
  it('subtracts buy-ins, rebuys and tips', () => { expect(profit(base)).toBe(9000); expect(money(profit(base), 'USD', true)).toBe('+$90.00') })
  it('uses the saved rate for a stable JPY value', () => { const rate = { rate: 150, date: '2026-09-01', fetchedAt: '2026-09-01T10:00:00Z', provider: 'Test' }; expect(asYen(profit(base), 'USD', rate)).toBe(13500); expect(asYen(profit(base), 'USD')).toBeNull() })
  it('totals all completed sessions in yen and excludes running sessions', () => {
    const usd = { ...base, rate: { rate: 150, date: '2026-09-01', fetchedAt: '2026-09-01T10:00:00Z', provider: 'Test' } }
    const won: Session = { ...base, id: 'krw', currency: 'KRW', buyIn: 10000, rebuy: 0, cashOut: 15000, tips: 0, rate: { rate: 0.1, date: '2026-09-01', fetchedAt: '2026-09-01T10:00:00Z', provider: 'Test' } }
    expect(calendarDayTotal([usd, won, { ...won, id: 'running', endedAt: undefined }])).toBe(14000)
    expect(calendarDayTotal([{ ...usd, rate: undefined }])).toBeNull()
    expect(calendarDayTotal([{ ...won, endedAt: undefined }])).toBeNull()
  })
  it('offers locally scaled blind presets with hyphen notation', () => {
    expect(blindChoicesFor('USD')).toContain('1-3')
    expect(blindChoicesFor('KRW')).toContain('1,000-3,000')
    expect(blindChoicesFor('USD').every(value => !value.includes('/'))).toBe(true)
  })
  it('calculates actual tournament ROI from entries and winnings', () => {
    const tournament: Session = { ...base, format: 'tournament', buyIn: 10000, rebuy: 10000, cashOut: 50000, tips: 0 }
    expect(sessionRoi(tournament)).toBe(1.5)
  })
  it('rotates the dealer button and every derived position for the next hand', () => {
    const first = { ...defaultPokerTable(9), players: [2, 3, 4, 5, 6, 7, 8, 9].map(seat => ({ seat, name: `P${seat}`, tags: [], note: '' })) }
    expect(tablePosition(1, first.buttonSeat, first.seatCount)).toBe('BTN')
    expect(tablePosition(2, first.buttonSeat, first.seatCount)).toBe('SB')
    expect(tablePosition(9, first.buttonSeat, first.seatCount)).toBe('CO')
    const second = nextPokerHand(first)
    expect(second.handNumber).toBe(2)
    expect(second.buttonSeat).toBe(2)
    expect(tablePosition(1, second.buttonSeat, second.seatCount)).toBe('CO')
    expect(tablePosition(2, second.buttonSeat, second.seatCount)).toBe('BTN')
  })
  it('skips empty seats and recalculates positions when players join or leave', () => {
    const table = { ...defaultPokerTable(9), buttonSeat: 1, players: [
      { seat: 3, name: 'A', tags: [], note: '' },
      { seat: 6, name: 'B', tags: [], note: '' },
      { seat: 8, name: 'C', tags: [], note: '' },
    ] }
    expect(activeTableSeats(table)).toEqual([1, 3, 6, 8])
    expect(tablePositionFor(table, 1)).toBe('BTN')
    expect(tablePositionFor(table, 3)).toBe('SB')
    expect(tablePositionFor(table, 2)).toBe('')
    expect(nextPokerHand(table).buttonSeat).toBe(3)
    const afterLeaving = { ...table, buttonSeat: 3, players: table.players.filter(player => player.seat !== 3) }
    expect(nextPokerHand(afterLeaving).buttonSeat).toBe(8)
  })
  it('records blinds, applies capped rake, and updates every stack in BB', () => {
    const createdAt = '2026-09-01T10:00:00Z'
    const table = { ...defaultPokerTable(6), settings: { smallBlindBb: 0.5, anteBb: 0, rakePercent: 5, rakeCapBb: 3 }, players: [
      { seat: 1, name: 'Hero', stackBb: 100, tags: [], note: '' },
      { seat: 2, name: 'A', stackBb: 100, tags: [], note: '' },
      { seat: 3, name: 'B', stackBb: 100, tags: [], note: '' },
    ] }
    const forced = forcedPokerActions(table, createdAt)
    expect(forced.map(action => [action.seat, action.type, action.amountBb])).toEqual([[2, 'small-blind', 0.5], [3, 'big-blind', 1]])
    const actions: PokerAction[] = [...forced, { id: 'call', street: 'preflop', seat: 1, type: 'call', amountBb: 1, toBb: 1, createdAt }]
    expect(currentStreetBet(actions, 'preflop')).toBe(1)
    expect(streetContributionFor(actions, 1, 'preflop')).toBe(1)
    const settled = settlePokerHand(table, actions, [3], '2026-09-01T10:01:00Z')
    expect(settled.record.potBb).toBe(2.5)
    expect(settled.record.rakeBb).toBe(0.13)
    expect(settled.table.players.map(player => player.stackBb)).toEqual([99, 99.5, 101.37])
    expect(settled.table.handNumber).toBe(2)
    expect(settled.table.buttonSeat).toBe(2)
  })
  it('supports UTG and button straddles as forced preflop bets', () => {
    const players = [1, 2, 3, 4, 5, 6].map(seat => ({ seat, name: `P${seat}`, stackBb: 100, tags: [], note: '' }))
    const baseTable = { ...defaultPokerTable(6), players }
    const utg = forcedPokerActions({ ...baseTable, settings: { smallBlindBb: 0.5, anteBb: 0, rakePercent: 0, rakeCapBb: 0, straddleMode: 'utg' as const, straddleBb: 2 } })
    expect(utg.find(action => action.type === 'straddle')).toMatchObject({ seat: 4, amountBb: 2, toBb: 2 })
    const button = forcedPokerActions({ ...baseTable, settings: { smallBlindBb: 0.5, anteBb: 0, rakePercent: 0, rakeCapBb: 0, straddleMode: 'button' as const, straddleBb: 3 } })
    expect(button.find(action => action.type === 'straddle')).toMatchObject({ seat: 1, amountBb: 3, toBb: 3 })
  })
  it('moves or swaps seats together with hero and dealer state', () => {
    const table = { ...defaultPokerTable(6), buttonSeat: 2, players: [
      { seat: 1, name: 'Hero', stackBb: 100, tags: [], note: '' },
      { seat: 2, name: 'A', stackBb: 80, tags: [], note: '' },
      { seat: 4, name: 'B', stackBb: 120, tags: [], note: '' },
    ] }
    const swapped = movePokerSeat(table, 2, 4)
    expect(swapped.buttonSeat).toBe(4)
    expect(swapped.players.find(player => player.seat === 4)?.name).toBe('A')
    expect(swapped.players.find(player => player.seat === 2)?.name).toBe('B')
    const movedHero = movePokerSeat(swapped, 1, 5)
    expect(movedHero.heroSeat).toBe(5)
    expect(movedHero.players.find(player => player.seat === 5)?.name).toBe('Hero')
  })
  it('identifies the automatic winner when everyone else folds', () => {
    const table = { ...defaultPokerTable(6), players: [1, 2, 3].map(seat => ({ seat, name: `P${seat}`, stackBb: 100, tags: [], note: '' })) }
    const folds: PokerAction[] = [
      { id: 'f1', street: 'preflop', seat: 2, type: 'fold', amountBb: 0, createdAt: '2026-09-01T00:00:00Z' },
      { id: 'f2', street: 'preflop', seat: 3, type: 'fold', amountBb: 0, createdAt: '2026-09-01T00:00:01Z' },
    ]
    expect(unfoldedTableSeats(table, folds)).toEqual([1])
  })
  it('calculates the true trip result from poker profit minus travel costs', () => {
    const trip: Trip = { id: 't1', name: 'Test trip', destination: 'Las Vegas', startDate: '2026-09-01', endDate: '2026-09-03', expenses: [{ id: 'e1', category: '宿泊', amount: 10000, currency: 'USD', spentAt: '2026-09-02', note: '', rate: { rate: 150, date: '2026-09-02', fetchedAt: '2026-09-02T10:00:00Z', provider: 'Test' } }], note: '', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-03T00:00:00Z' }
    const session = { ...base, rate: { rate: 150, date: '2026-09-01', fetchedAt: '2026-09-01T10:00:00Z', provider: 'Test' } }
    expect(sessionsForTrip(trip, [session])).toHaveLength(1)
    expect(tripPokerYen(trip, [session])).toBe(13500)
    expect(tripExpenseYen(trip)).toBe(15000)
    expect(tripNetYen(trip, [session])).toBe(-1500)
    expect(tripsForDate('2026-09-01', [trip])).toEqual([trip])
    expect(tripsForDate('2026-09-03', [trip])).toEqual([trip])
    expect(tripsForDate('2026-09-04', [trip])).toEqual([])
    expect(sessionsInTrip(trip, [session, { ...session, id: 'running', endedAt: undefined }])).toHaveLength(2)
    expect(sessionsForTrip(trip, [session, { ...session, id: 'running', endedAt: undefined }])).toHaveLength(1)
    expect(sessionsInTrip(trip, [{ ...session, localDate: '2026-10-01', tripId: trip.id }])).toHaveLength(1)
    expect(sessionsInTrip(trip, [{ ...session, tripId: 'another-trip' }])).toHaveLength(0)
  })
})
