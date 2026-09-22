import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'
import type { Player, Session, Trip } from './domain'

const env = import.meta.env
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID)
const app = firebaseConfigured ? (getApps()[0] || initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID })) : null
const auth = app ? getAuth(app) : null
const db = app ? getFirestore(app) : null

export const watchUser = (callback: (user: User | null) => void) => auth ? onAuthStateChanged(auth, callback) : () => {}
export const login = async () => { if (!auth) return; await signInWithPopup(auth, new GoogleAuthProvider()) }
export const logout = async () => { if (!auth) return; await signOut(auth) }
export const loadRemote = async (uid: string) => {
  if (!db) return { sessions: [] as Session[], players: [] as Player[], trips: [] as Trip[] }
  const [sessions, players, trips] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'sessions')),
    getDocs(collection(db, 'users', uid, 'players')),
    getDocs(collection(db, 'users', uid, 'trips')),
  ])
  return {
    sessions: sessions.docs.map(item => item.data() as Session),
    players: players.docs.map(item => item.data() as Player),
    trips: trips.docs.map(item => item.data() as Trip),
  }
}
export const saveSessionRemote = async (uid: string, session: Session) => { if (db) await setDoc(doc(db, 'users', uid, 'sessions', session.id), JSON.parse(JSON.stringify(session)) as Session) }
export const deleteSessionRemote = async (uid: string, id: string) => { if (db) await deleteDoc(doc(db, 'users', uid, 'sessions', id)) }
export const savePlayerRemote = async (uid: string, player: Player) => { if (db) await setDoc(doc(db, 'users', uid, 'players', player.id), player) }
export const deletePlayerRemote = async (uid: string, id: string) => { if (db) await deleteDoc(doc(db, 'users', uid, 'players', id)) }
export const saveTripRemote = async (uid: string, trip: Trip) => { if (db) await setDoc(doc(db, 'users', uid, 'trips', trip.id), JSON.parse(JSON.stringify(trip)) as Trip) }
export const deleteTripRemote = async (uid: string, id: string) => { if (db) await deleteDoc(doc(db, 'users', uid, 'trips', id)) }
