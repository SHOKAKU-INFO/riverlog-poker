import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment
const session = { id: 's1', venue: 'Bellagio', location: 'Las Vegas', game: 'ライブ', stakes: '$1/$3', currency: 'USD', startedAt: '2026-09-01T00:00:00Z', buyIn: 30000, rebuy: 0, cashOut: 0, tips: 0, note: '', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'riverlog-test', firestore: { rules: readFileSync('firestore.rules', 'utf8') } }) })
afterAll(async () => { await env.cleanup() })
describe('Firestore rules', () => {
  it('allows an owner to save and read a valid session', async () => { const db = env.authenticatedContext('alice').firestore(); await assertSucceeds(setDoc(doc(db, 'users/alice/sessions/s1'), session)); await assertSucceeds(getDoc(doc(db, 'users/alice/sessions/s1'))) })
  it('denies another user and anonymous readers', async () => { await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'users/alice/sessions/s1'))); await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice/sessions/s1'))) })
  it('denies invalid amounts and forged document IDs', async () => { const db = env.authenticatedContext('alice').firestore(); await assertFails(setDoc(doc(db, 'users/alice/sessions/s2'), { ...session, id: 's2', buyIn: -1 })); await assertFails(setDoc(doc(db, 'users/alice/sessions/s3'), session)) })
})
