import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, CloudOff, Copy, Download, ExternalLink, Globe2, LayoutDashboard, LogOut, MapPin, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Spade, Tag, Trash2, UserRound, Users, Wallet, X } from 'lucide-react'
import type { User } from 'firebase/auth'
import { asYen, blindChoicesFor, calendarDayTotal, currencies, dateLabel, duration, fromMinor, hours, money, profit, samplePlayers, sampleSessions, shortDate, toMinor, type Currency, type Player, type Rate, type Session } from './domain'
import { deletePlayerRemote, deleteSessionRemote, firebaseConfigured, loadRemote, login, logout, savePlayerRemote, saveSessionRemote, watchUser } from './firebase'
import { getRate } from './rates'
import { authErrorMessage, detectInAppBrowser, type InAppBrowser } from './browser'

type Page = 'overview' | 'sessions' | 'calendar' | 'analytics' | 'players' | 'settings'
const nav: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { page: 'overview', label: 'ダッシュボード', icon: LayoutDashboard },
  { page: 'sessions', label: 'セッション', icon: Spade },
  { page: 'calendar', label: 'カレンダー', icon: CalendarDays },
  { page: 'analytics', label: '収支分析', icon: BarChart3 },
  { page: 'players', label: 'プレイヤーメモ', icon: Users },
  { page: 'settings', label: '設定・データ', icon: Settings2 },
]
const title: Record<Page, string> = { overview: 'ダッシュボード', sessions: 'セッション', calendar: 'カレンダー', analytics: '収支分析', players: 'プレイヤーメモ', settings: '設定・データ' }
const readLocal = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback } }
const today = () => new Date().toISOString().slice(0, 10)
const localInputDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const formatYen = (value: number | null, signed = false) => value === null ? 'レート未取得' : money(value, 'JPY', signed)

function App() {
  const [page, setPage] = useState<Page>('overview')
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(!firebaseConfigured)
  const [sessions, setSessions] = useState<Session[]>(() => readLocal('riverlog-demo-sessions', sampleSessions))
  const [players, setPlayers] = useState<Player[]>(() => readLocal('riverlog-demo-players', samplePlayers))
  const [rates, setRates] = useState<Partial<Record<Currency, Rate>>>({})
  const [sessionModal, setSessionModal] = useState<Session | 'new' | null>(null)
  const [sessionAction, setSessionAction] = useState<{ kind: 'rebuy' | 'finish'; session: Session } | null>(null)
  const [playerModal, setPlayerModal] = useState<Player | 'new' | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [browserHelp, setBrowserHelp] = useState<InAppBrowser>(null)
  const [now, setNow] = useState(Date.now())
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(id) }, [])
  useEffect(() => { if (!firebaseConfigured) return; return watchUser(async next => {
    setUser(next); setAuthReady(true)
    if (next) {
      try { const data = await loadRemote(next.uid); setSessions(data.sessions); setPlayers(data.players) }
      catch { setNotice('データの読み込みに失敗しました。接続を確認してください。') }
    } else { setSessions(readLocal('riverlog-demo-sessions', sampleSessions)); setPlayers(readLocal('riverlog-demo-players', samplePlayers)) }
  }) }, [])
  useEffect(() => { if (!user) localStorage.setItem('riverlog-demo-sessions', JSON.stringify(sessions)) }, [sessions, user])
  useEffect(() => { if (!user) localStorage.setItem('riverlog-demo-players', JSON.stringify(players)) }, [players, user])
  useEffect(() => { const codes = [...new Set<Currency>(['USD', 'KRW', ...sessions.map(s => s.currency)])].filter(code => code !== 'JPY'); codes.forEach(code => getRate(code).then(rate => { if (rate) setRates(old => ({ ...old, [code]: rate })) })) }, [sessions])

  const sorted = useMemo(() => [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [sessions])
  const completed = sorted.filter(s => s.endedAt)
  const active = sorted.find(s => !s.endedAt)
  const totalYen = completed.reduce((sum, s) => sum + (asYen(profit(s), s.currency, s.rate) || 0), 0)
  const totalHours = completed.reduce((sum, s) => sum + hours(s), 0)
  const wins = completed.filter(s => profit(s) > 0).length
  const liveRate = rates.USD
  const wonRate = rates.KRW
  const restrictedBrowser = useMemo(() => detectInAppBrowser(navigator.userAgent), [])
  useEffect(() => { if (restrictedBrowser && firebaseConfigured && authReady && !user) setBrowserHelp(restrictedBrowser) }, [restrictedBrowser, authReady, user])

  const saveSession = async (session: Session, successMessage?: string) => {
    const previous = sessions
    setSessions(current => [session, ...current.filter(s => s.id !== session.id)])
    setSessionModal(null); setSessionAction(null); setSelectedSession(null)
    if (user) try { await saveSessionRemote(user.uid, session) } catch { setSessions(previous); setNotice('保存に失敗しました。接続を確認してください。'); return }
    else if (!successMessage) setNotice('端末内のデモデータに保存しました')
    if (successMessage) setNotice(successMessage)
  }
  const addMatchingRebuy = (session: Session) => {
    const updatedAt = new Date().toISOString()
    void saveSession({ ...session, rebuy: session.rebuy + session.buyIn, updatedAt }, `${money(session.buyIn, session.currency)} のリバイを追加しました`)
  }
  const removeSession = async (id: string) => {
    if (!window.confirm('このセッションを削除しますか？')) return
    const previous = sessions; setSessions(current => current.filter(s => s.id !== id)); setSelectedSession(null)
    if (user) try { await deleteSessionRemote(user.uid, id) } catch { setSessions(previous); setNotice('削除に失敗しました') }
  }
  const savePlayer = async (player: Player) => {
    const previous = players; setPlayers(current => [player, ...current.filter(p => p.id !== player.id)]); setPlayerModal(null)
    if (user) try { await savePlayerRemote(user.uid, player) } catch { setPlayers(previous); setNotice('保存に失敗しました') }
    else setNotice('端末内のデモデータに保存しました')
  }
  const removePlayer = async (id: string) => {
    if (!window.confirm('このプレイヤーメモを削除しますか？')) return
    const previous = players; setPlayers(current => current.filter(p => p.id !== id)); setPlayerModal(null)
    if (user) try { await deletePlayerRemote(user.uid, id) } catch { setPlayers(previous); setNotice('削除に失敗しました') }
  }
  const navigate = (destination: Page) => { setPage(destination); setSidebarOpen(false); window.scrollTo(0, 0) }
  const startOrOpenSession = () => active ? setSelectedSession(active) : setSessionModal('new')
  const beginLogin = () => {
    if (restrictedBrowser) { setBrowserHelp(restrictedBrowser); return }
    void login().catch(error => setNotice(authErrorMessage(error)))
  }
  const exportCsv = () => {
    const rows = [['id','venue','location','game','blinds','currency','startedAt','endedAt','buyIn','rebuy','cashOut','tips','profit','rate','rateDate','note'], ...sessions.map(s => [s.id,s.venue,s.location,s.game,s.stakes,s.currency,s.startedAt,s.endedAt || '',fromMinor(s.buyIn,s.currency),fromMinor(s.rebuy,s.currency),fromMinor(s.cashOut,s.currency),fromMinor(s.tips,s.currency),fromMinor(profit(s),s.currency),s.rate?.rate || '',s.rate?.date || '',s.note])]
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `riverlog-sessions-${today()}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="メニューを閉じる" />}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">R<span>●</span></div><div><strong>RIVERLOG</strong><small>POKER TRAVEL JOURNAL</small></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="メインメニュー">{nav.map(item => <button key={item.page} className={`nav-item ${page === item.page ? 'active' : ''}`} onClick={() => navigate(item.page)}><item.icon size={19} strokeWidth={1.9} /><span>{item.label}</span>{page === item.page && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-rate"><div className="sidebar-rate-heading"><Globe2 size={16} /> TODAY'S RATE</div><div className="sidebar-rate-line"><strong>1 USD <span>=</span> {liveRate ? `¥${liveRate.rate.toFixed(2)}` : '—'}</strong></div><div className="sidebar-rate-line"><strong>100 KRW <span>=</span> {wonRate ? `¥${(wonRate.rate * 100).toFixed(2)}` : '—'}</strong></div><small>{liveRate || wonRate ? `${liveRate?.date || wonRate?.date} 基準 · 日次参考レート` : 'レートを取得中'}</small></div><div className="sidebar-footer">{user ? <button onClick={() => logout()}><LogOut size={15} /> ログアウト</button> : <span><ShieldCheck size={15} /> {firebaseConfigured ? '閲覧用デモ' : 'ローカルデモモード'}</span>}</div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="メニューを開く"><Menu size={22} /></button><span className="breadcrumb">RIVERLOG</span><ChevronRight size={15} className="breadcrumb-chevron" /><strong>{title[page]}</strong></div><div className="topbar-right"><div className="live-pill"><span className="pulse" /> {navigator.onLine ? 'SYNC READY' : 'OFFLINE'}</div><div className="topbar-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : <UserRound size={17} />}</div></div></header>
      <div className="content">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="閉じる"><X size={16} /></button></div>}
        {!user && <div className={`demo-banner ${restrictedBrowser ? 'browser-warning' : ''}`}><div><ShieldCheck size={17} /><span>{restrictedBrowser ? `${restrictedBrowser === 'line' ? 'LINE' : restrictedBrowser === 'instagram' ? 'Instagram' : 'Facebook'}内ブラウザを検出しました。Googleログインは外部ブラウザから行えます。` : firebaseConfigured ? 'デモを表示中。Google でログインすると自分のデータを保存できます。' : 'デモモードです。Firebase 設定後、Google ログインとクラウド同期が使えます。'}</span></div>{firebaseConfigured && authReady && <button onClick={beginLogin}>{restrictedBrowser ? '開き方を見る' : 'Google でログイン'} <ArrowRight size={15} /></button>}</div>}

        {page === 'overview' && <>
          <div className="page-heading"><div><div className="eyebrow">OVERVIEW / {new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(new Date())}</div><h1>おかえりなさい<span className="title-period">.</span></h1><p>プレーと収支を、旅の流れに沿って振り返る。</p></div><button className="primary-button" onClick={startOrOpenSession}>{active ? <Clock3 size={18} /> : <Plus size={18} />} {active ? '進行中を開く' : 'セッションを開始'}</button></div>
          <section className="hero-grid"><div className="hero-card"><div className="hero-card-top"><span><Activity size={16} /> TOTAL PERFORMANCE</span><MoreHorizontal size={22} /></div><div className="hero-main"><div className="hero-overline">累計参考収支 <span>JPY 換算</span></div><div className="hero-amount">{money(totalYen, 'JPY', true)}</div><div className="hero-hint">終了済み {completed.length} セッションの固定レート換算</div></div><div className="hero-card-bottom"><span><span className="hero-dot" /> あなたの記録</span><span>01 / 03</span></div></div><div className="stat-stack"><StatCard icon={Clock3} label="総プレー時間" value={`${totalHours.toFixed(1)}h`} detail="終了済みセッション" /><StatCard icon={Wallet} label="平均時給" value={totalHours >= 0.05 ? formatYen(Math.round(totalYen / totalHours)) : '—'} detail="参考円換算 / 時間" /></div></section>
          <section className="insight-row"><div className="mini-stat"><div className="mini-icon green"><ArrowUpRight size={19} /></div><div><small>勝率</small><strong>{completed.length ? `${Math.round(wins / completed.length * 100)}%` : '—'}</strong></div><span>WIN RATE</span></div><div className="mini-stat"><div className="mini-icon amber"><Spade size={19} /></div><div><small>記録したセッション</small><strong>{sessions.length}回</strong></div><span>SESSIONS</span></div><div className="mini-stat"><div className="mini-icon blue"><Globe2 size={19} /></div><div><small>使用した通貨</small><strong>{new Set(sessions.map(s => s.currency)).size}種類</strong></div><span>CURRENCIES</span></div></section>
          {active && <section className="active-session"><button className="active-session-summary" onClick={() => setSelectedSession(active)}><span className="active-label"><span className="pulse" /> LIVE SESSION</span><h3>{active.venue} <span>{active.stakes}</span></h3><p>{duration(active, now)} プレー中 · {money(active.buyIn + active.rebuy, active.currency)} 投入</p></button><div className="active-actions"><button className="active-quick-button" onClick={() => addMatchingRebuy(active)}><Plus size={17} /><span>同額リバイ<small>{money(active.buyIn, active.currency)}</small></span></button><button className="active-quick-button" onClick={() => setSessionAction({ kind: 'rebuy', session: active })}><Wallet size={17} /><span>別の金額<small>自由入力</small></span></button><button className="active-finish-button" onClick={() => setSessionAction({ kind: 'finish', session: active })}>終了する <ArrowRight size={16} /></button></div></section>}
          <section className="section"><SectionHeading label="RECENT ACTIVITY" title="最近のセッション" action="すべて見る" onAction={() => navigate('sessions')} /><div className="session-list">{sorted.slice(0, 4).map(s => <SessionRow key={s.id} session={s} onClick={() => setSelectedSession(s)} />)}{!sorted.length && <Empty message="まだセッションがありません。最初の記録を作成しましょう。" />}</div></section>
          <div className="lower-grid"><section className="panel"><SectionHeading label="CURRENCY NOTE" title="円換算について" /><div className="rate-panel"><div className="rate-icon"><Globe2 size={23} /></div><div className="rate-values"><strong>{liveRate ? `1 USD ≈ ¥${liveRate.rate.toFixed(2)}` : 'USD レートを取得できませんでした'}</strong><strong>{wonRate ? `100 KRW ≈ ¥${(wonRate.rate * 100).toFixed(2)}` : 'KRW レートを取得できませんでした'}</strong><p>{liveRate || wonRate ? `${liveRate?.date || wonRate?.date} 基準 · Frankfurter の日次参考レート` : '現地通貨の記録は引き続き利用できます。'}</p></div></div><p className="panel-note">記録時のレートを固定保存します。実際の両替・決済レートとは異なります。</p></section><section className="panel"><SectionHeading label="QUICK ACCESS" title="次の記録へ" /><button className="quick-link" onClick={() => setPlayerModal('new')}><span className="quick-icon"><Users size={20} /></span><span><strong>プレイヤーメモを追加</strong><small>卓で気づいた特徴を忘れずに</small></span><ArrowRight size={18} /></button><button className="quick-link" onClick={() => navigate('calendar')}><span className="quick-icon"><CalendarDays size={20} /></span><span><strong>カレンダーを開く</strong><small>旅のプレー履歴を日付で探す</small></span><ArrowRight size={18} /></button></section></div>
        </>}

        {page === 'sessions' && <><div className="page-heading"><div><div className="eyebrow">YOUR PLAY HISTORY</div><h1>セッション<span className="title-period">.</span></h1><p>現地通貨と円換算、両方の視点で記録する。</p></div><button className="primary-button" onClick={startOrOpenSession}>{active ? <Clock3 size={18} /> : <Plus size={18} />} {active ? '進行中を開く' : 'セッションを開始'}</button></div><div className="filter-bar"><div className="search-box"><Search size={18} /><input placeholder="会場・ゲームで検索" value={search} onChange={e => setSearch(e.target.value)} /></div><span>{sorted.length} 件の記録</span></div><div className="session-list page-list">{sorted.filter(s => `${s.venue} ${s.game} ${s.location}`.toLowerCase().includes(search.toLowerCase())).map(s => <SessionRow key={s.id} session={s} onClick={() => setSelectedSession(s)} />)}{!sessions.length && <Empty message="まだセッションがありません。" />}</div></>}

        {page === 'calendar' && <>
          <div className="page-heading"><div><div className="eyebrow">PLAY CALENDAR</div><h1>カレンダー<span className="title-period">.</span></h1><p>日ごとの収支合計を、記録時のレートで表示する。</p></div><button className="primary-button" onClick={startOrOpenSession}>{active ? <Clock3 size={18} /> : <Plus size={18} />} {active ? '進行中を開く' : 'セッションを開始'}</button></div>
          <div className="calendar-panel">
            <div className="calendar-head"><h2>{year}年 {month + 1}月</h2><div><button className="icon-button" onClick={() => { const d = new Date(year, month - 1); setYear(d.getFullYear()); setMonth(d.getMonth()); setSelectedDay(null) }} aria-label="前月"><ChevronLeft size={20} /></button><button className="icon-button" onClick={() => { const d = new Date(year, month + 1); setYear(d.getFullYear()); setMonth(d.getMonth()); setSelectedDay(null) }} aria-label="翌月"><ChevronRight size={20} /></button></div></div>
            <div className="calendar-grid">
              {['日','月','火','水','木','金','土'].map(day => <div className="calendar-weekday" key={day}>{day}</div>)}
              {Array.from({ length: new Date(year, month, 1).getDay() }, (_, i) => <div key={`blank-${i}`} />)}
              {Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => {
                const day = i + 1
                const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const matches = sorted.filter(s => (s.localDate || s.startedAt.slice(0, 10)) === date)
                const total = calendarDayTotal(matches)
                const amount = total === null ? (matches.some(s => s.endedAt) ? 'レート未取得' : '進行中') : money(total, 'JPY', true)
                return <button key={day} className={`calendar-day ${matches.length ? 'has-session' : ''} ${total !== null && total < 0 ? 'loss' : ''} ${selectedDay === day ? 'selected' : ''} ${localInputDate(new Date()).slice(0, 10) === date ? 'today' : ''}`} aria-label={`${day}日、${matches.length}件${matches.length ? `、${amount}` : ''}`} aria-pressed={selectedDay === day} onClick={() => setSelectedDay(day)}><span>{day}</span>{matches.length > 0 && <><strong className={`calendar-amount ${total === null ? 'unconverted' : total < 0 ? 'negative' : total > 0 ? 'positive' : ''}`}>{amount}</strong><small>{matches.length}件</small></>}</button>
              })}
            </div>
          </div>
          <section className="section"><SectionHeading label="THIS MONTH" title={selectedDay ? `${month + 1}月${selectedDay}日のセッション` : '今月のセッション'} action={selectedDay ? '月全体を見る' : undefined} onAction={() => setSelectedDay(null)} /><div className="session-list">{sorted.filter(s => { const date = s.localDate || s.startedAt.slice(0, 10); return date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`) && (selectedDay === null || date.endsWith(`-${String(selectedDay).padStart(2, '0')}`)) }).map(s => <SessionRow key={s.id} session={s} onClick={() => setSelectedSession(s)} />)}</div></section>
        </>}

        {page === 'analytics' && <><div className="page-heading"><div><div className="eyebrow">PERFORMANCE INSIGHTS</div><h1>収支分析<span className="title-period">.</span></h1><p>数字から、自分のプレーを見つめ直す。</p></div></div><div className="analytics-grid"><StatCard icon={Wallet} label="累計参考収支" value={money(totalYen, 'JPY', true)} detail="記録時レートで円換算" /><StatCard icon={Clock3} label="総プレー時間" value={`${totalHours.toFixed(1)}h`} detail="終了済みセッション" /><StatCard icon={ArrowUpRight} label="勝率" value={completed.length ? `${Math.round(wins / completed.length * 100)}%` : '—'} detail={`${wins}勝 / ${completed.length}回`} /></div><div className="lower-grid"><section className="panel"><SectionHeading label="BY VENUE" title="会場別の収支" /><div className="bars">{Object.entries(completed.reduce<Record<string, Session[]>>((map, session) => { (map[session.venue] ||= []).push(session); return map }, {})).map(([venue, items]) => { const sum = items.reduce((acc, s) => acc + (asYen(profit(s), s.currency, s.rate) || 0), 0); const max = Math.max(1, ...completed.map(s => Math.abs(asYen(profit(s), s.currency, s.rate) || 0))); return <div className="bar-row" key={venue}><div><strong>{venue}</strong><span className={sum < 0 ? 'negative' : 'positive'}>{money(sum, 'JPY', true)}</span></div><div className="bar-track"><div className={sum < 0 ? 'bar-fill loss' : 'bar-fill'} style={{ width: `${Math.max(4, Math.min(100, Math.abs(sum) / max * 100))}%` }} /></div></div> })}{!completed.length && <Empty message="分析するセッションがありません。" />}</div></section><section className="panel"><SectionHeading label="HOW WE CALCULATE" title="集計の基準" /><div className="calc-note"><CircleHelp size={20} /><p>現地通貨の損益は「キャッシュアウト − バイイン − リバイ − チップ」で計算します。異なる通貨の合算には、各セッションに保存した日次参考レートを使います。為替の実現損益ではありません。</p></div></section></div></>}

        {page === 'players' && <><div className="page-heading"><div><div className="eyebrow">TABLE INTELLIGENCE</div><h1>プレイヤーメモ<span className="title-period">.</span></h1><p>次に同じ卓に座ったとき、思い出せるように。</p></div><button className="primary-button" onClick={() => setPlayerModal('new')}><Plus size={18} /> メモを追加</button></div><div className="filter-bar"><div className="search-box"><Search size={18} /><input placeholder="名前・会場・タグで検索" value={search} onChange={e => setSearch(e.target.value)} /></div><span>{players.length} 人のメモ</span></div><div className="player-grid">{players.filter(p => `${p.name} ${p.venue} ${p.tags.join(' ')} ${p.note}`.toLowerCase().includes(search.toLowerCase())).map(p => <button className="player-card" key={p.id} onClick={() => setPlayerModal(p)}><div className="player-card-top"><div className="player-avatar">{p.name.slice(0, 1).toUpperCase()}</div><MoreHorizontal size={21} /></div><h3>{p.name}</h3><p><Globe2 size={14} /> {p.venue || '会場未設定'}</p><div className="tags">{p.tags.map(tag => <span key={tag}>{tag}</span>)}</div><div className="player-note">{p.note || 'メモはまだありません'}</div><small>更新 {shortDate(p.updatedAt)}</small></button>)}{!players.length && <Empty message="プレイヤーメモがありません。" />}</div></>}

        {page === 'settings' && <><div className="page-heading"><div><div className="eyebrow">PREFERENCES & DATA</div><h1>設定・データ<span className="title-period">.</span></h1><p>記録を自分の手元でも管理する。</p></div></div><div className="settings-grid"><section className="panel"><SectionHeading label="ACCOUNT" title="アカウント" /><div className="setting-row"><div className="setting-icon"><UserRound size={20} /></div><div><strong>{user?.displayName || 'デモモード'}</strong><small>{user?.email || 'この端末のブラウザにデータを保存中'}</small></div></div>{firebaseConfigured && !user && <button className="secondary-button wide" onClick={beginLogin}>Google でログイン <ArrowRight size={16} /></button>}{user && <button className="secondary-button wide" onClick={logout}>ログアウト <LogOut size={16} /></button>}</section><section className="panel"><SectionHeading label="YOUR DATA" title="データの持ち出し" /><p className="settings-description">すべてのセッションを CSV でダウンロードできます。データにはメモも含まれます。</p><button className="secondary-button wide" onClick={exportCsv}><Download size={17} /> CSV をダウンロード</button></section><section className="panel"><SectionHeading label="CURRENCY" title="為替データ" /><div className="setting-row"><div className="setting-icon"><Globe2 size={20} /></div><div><strong>Frankfurter 日次参考レート</strong><small>基準表示通貨: JPY · 実際の両替レートとは異なります</small></div></div><a className="text-link" href="https://frankfurter.dev/" target="_blank" rel="noreferrer">データ提供元を見る <ArrowRight size={15} /></a></section><section className="panel"><SectionHeading label="PRIVACY" title="プライバシー" /><div className="setting-row"><div className="setting-icon"><CloudOff size={20} /></div><div><strong>{user ? 'Firestore に保存' : 'この端末に保存'}</strong><small>プレイヤーメモは公開されません。画像の保存は行いません。</small></div></div></section></div></>}
      </div>
    </main>
    <nav className="mobile-nav" aria-label="モバイルメニュー">{nav.slice(0, 5).map(item => <button key={item.page} className={page === item.page ? 'active' : ''} onClick={() => navigate(item.page)}><item.icon size={21} /><span>{item.page === 'overview' ? 'ホーム' : item.page === 'players' ? 'メモ' : item.label}</span></button>)}</nav>
    {sessionModal && <SessionForm initial={sessionModal === 'new' ? undefined : sessionModal} sessions={sessions} rate={rates} onClose={() => setSessionModal(null)} onSave={saveSession} />}
    {sessionAction?.kind === 'rebuy' && <RebuyForm session={sessionAction.session} onClose={() => setSessionAction(null)} onSave={(amount) => { const session = sessionAction.session; void saveSession({ ...session, rebuy: session.rebuy + amount, updatedAt: new Date().toISOString() }, `${money(amount, session.currency)} のリバイを追加しました`) }} />}
    {sessionAction?.kind === 'finish' && <FinishSessionForm session={sessionAction.session} rate={rates[sessionAction.session.currency]} onClose={() => setSessionAction(null)} onSave={session => void saveSession(session, 'セッションを終了し、収支を記録しました')} />}
    {playerModal && <PlayerForm initial={playerModal === 'new' ? undefined : playerModal} onClose={() => setPlayerModal(null)} onSave={savePlayer} onDelete={removePlayer} />}
    {browserHelp && <ExternalBrowserGuide browser={browserHelp} onClose={() => setBrowserHelp(null)} />}
    {selectedSession && <SessionDetail session={selectedSession} currentRate={rates[selectedSession.currency]} now={now} onClose={() => setSelectedSession(null)} onEdit={() => { setSessionModal(selectedSession); setSelectedSession(null) }} onDelete={() => removeSession(selectedSession.id)} onQuickRebuy={() => addMatchingRebuy(selectedSession)} onCustomRebuy={() => { setSessionAction({ kind: 'rebuy', session: selectedSession }); setSelectedSession(null) }} onFinish={() => { setSessionAction({ kind: 'finish', session: selectedSession }); setSelectedSession(null) }} />}
  </div>
}

function StatCard({ icon: Icon, label, value, detail }: { icon: typeof Clock3; label: string; value: string; detail: string }) { return <div className="stat-card"><div className="stat-head"><div className="stat-icon"><Icon size={19} /></div><ArrowUpRight size={17} /></div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div> }
function SectionHeading({ label, title, action, onAction }: { label: string; title: string; action?: string; onAction?: () => void }) { return <div className="section-heading"><div><div className="eyebrow">{label}</div><h2>{title}</h2></div>{action && <button className="text-link" onClick={onAction}>{action} <ArrowRight size={16} /></button>}</div> }
function Empty({ message }: { message: string }) { return <div className="empty"><Spade size={27} /><p>{message}</p></div> }
function SessionRow({ session, onClick }: { session: Session; onClick: () => void }) { const result = profit(session); const yen = asYen(result, session.currency, session.rate); const active = !session.endedAt; return <button className="session-row" onClick={onClick}><div className={`result-icon ${active ? 'running' : result < 0 ? 'loss' : ''}`}>{active ? <Clock3 size={19} /> : result < 0 ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}</div><div className="session-main"><strong>{session.venue}</strong><span>{session.stakes} <span className="separator">·</span> {dateLabel((session.localDate || session.startedAt.slice(0, 10)) + 'T12:00:00')}</span></div><div className="session-extra"><span>{session.game}</span><small>{active ? 'プレー中' : duration(session)}</small></div><div className={`session-result ${active ? 'running' : result < 0 ? 'negative' : 'positive'}`}><strong>{active ? money(session.buyIn + session.rebuy, session.currency) : money(result, session.currency, true)}</strong><small>{active ? '投入中 · タップで操作' : formatYen(yen, true)}</small></div><ChevronRight size={17} className="row-chevron" /></button> }

type EntryOption = { label: string; secondary?: string }
function savedVenueOptions(sessions: Session[]): EntryOption[] {
  const seen = new Set<string>()
  return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).flatMap(session => {
    const label = session.venue.trim()
    const key = label.toLocaleLowerCase()
    if (!label || seen.has(key)) return []
    seen.add(key)
    return [{ label, secondary: session.location.trim() || undefined }]
  })
}

function savedLocationOptions(sessions: Session[]): EntryOption[] {
  const seen = new Set<string>()
  return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).flatMap(session => {
    const label = session.location.trim()
    const key = label.toLocaleLowerCase()
    if (!label || seen.has(key)) return []
    seen.add(key)
    return [{ label }]
  })
}

function EntryDrawer({ title, value, options, onChoose, onClose, allowClear = false }: { title: string; value: string; options: EntryOption[]; onChoose: (value: string, option?: EntryOption) => void; onClose: () => void; allowClear?: boolean }) {
  const [query, setQuery] = useState('')
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) }, [onClose])
  const input = query.trim()
  const filtered = options.filter(option => `${option.label} ${option.secondary || ''}`.toLocaleLowerCase().includes(input.toLocaleLowerCase()))
  const exact = options.some(option => option.label.toLocaleLowerCase() === input.toLocaleLowerCase())
  return <div className="entry-drawer-backdrop" onMouseDown={onClose}>
    <div className="entry-drawer" role="dialog" aria-modal="true" aria-label={`${title}を選択`} onMouseDown={event => event.stopPropagation()}>
      <div className="entry-drawer-handle" />
      <div className="entry-drawer-head"><div><small>QUICK PICK</small><h3>{title}を選択</h3></div><button type="button" className="icon-button" onClick={onClose} aria-label="閉じる"><X size={21} /></button></div>
      <label className="entry-drawer-search">検索・新しく入力<input value={query} onChange={event => setQuery(event.target.value)} maxLength={120} placeholder={`${title}を入力`} /></label>
      {input && !exact && <button type="button" className="entry-drawer-create" onClick={() => onChoose(input)}><Plus size={17} /><span>「{input}」を新しく使う</span><ChevronRight size={17} /></button>}
      <div className="entry-drawer-list">
        {filtered.length > 0 && <div className="entry-drawer-caption">以前の記録から選択</div>}
        {filtered.map(option => <button type="button" key={option.label} className="entry-drawer-option" onClick={() => onChoose(option.label, option)}><MapPin size={17} /><span><strong>{option.label}</strong>{option.secondary && <small>{option.secondary}</small>}</span>{option.label === value ? <Check size={17} /> : <ChevronRight size={16} />}</button>)}
        {!filtered.length && !input && <p className="entry-drawer-empty">まだ候補がありません。上の欄に入力すると、次回から選べます。</p>}
        {!filtered.length && input && <p className="entry-drawer-empty">一致する候補はありません。</p>}
      </div>
      {allowClear && value && <button type="button" className="entry-drawer-clear" onClick={() => onChoose('')}>入力を消す</button>}
    </div>
  </div>
}

function SessionForm({ initial, sessions, rate, onClose, onSave }: { initial?: Session; sessions: Session[]; rate: Partial<Record<Currency, Rate>>; onClose: () => void; onSave: (session: Session) => void }) {
  const [venue, setVenue] = useState(initial?.venue || '')
  const [location, setLocation] = useState(initial?.location || '')
  const [game, setGame] = useState<'ライブ' | 'オンライン'>(initial?.game || 'ライブ')
  const [stakes, setStakes] = useState(initial?.stakes || '')
  const [customStakes, setCustomStakes] = useState(Boolean(initial?.stakes && !blindChoicesFor(initial.currency).includes(initial.stakes)))
  const [currency, setCurrency] = useState<Currency>(initial?.currency || 'USD')
  const [picker, setPicker] = useState<'venue' | 'location' | null>(null)
  const [buyIn, setBuyIn] = useState(initial ? String(fromMinor(initial.buyIn, initial.currency)) : '')
  const [cashOut, setCashOut] = useState(initial ? String(fromMinor(initial.cashOut, initial.currency)) : '')
  const [tips, setTips] = useState(initial ? String(fromMinor(initial.tips, initial.currency)) : '0')
  const [note, setNote] = useState(initial?.note || '')
  const [startedAt, setStartedAt] = useState(initial ? localInputDate(new Date(initial.startedAt)) : localInputDate(new Date()))
  const [entryRate, setEntryRate] = useState<Rate | undefined>(rate[initial?.currency || 'USD'])
  const venueOptions = useMemo(() => savedVenueOptions(sessions), [sessions])
  const locationOptions = useMemo(() => savedLocationOptions(sessions), [sessions])
  const stakeChoices = blindChoicesFor(currency)
  useEffect(() => { let current = true; setEntryRate(rate[currency]); void getRate(currency).then(value => { if (current) setEntryRate(value) }); return () => { current = false } }, [currency, rate])
  const completed = Boolean(initial?.endedAt)
  const rebuyAmount = initial ? fromMinor(initial.rebuy, initial.currency) : 0
  const previewProfit = completed && buyIn !== '' && cashOut !== '' ? Number(cashOut) - Number(buyIn) - rebuyAmount - Number(tips || 0) : null
  const previewYen = previewProfit === null ? null : asYen(toMinor(previewProfit, currency), currency, initial?.rate || rate[currency])
  const buyInNumber = Number(buyIn)
  const buyInYen = buyIn !== '' && Number.isFinite(buyInNumber) && buyInNumber >= 0 ? asYen(toMinor(buyInNumber, currency), currency, entryRate) : null
  const rateUnit = currency === 'KRW' ? 100 : currency === 'VND' ? 1000 : 1
  const chooseCurrency = (next: Currency) => { setCurrency(next); if (!customStakes) setStakes('') }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!venue.trim() || buyIn === '') return
    const now = new Date().toISOString()
    onSave({ id: initial?.id || crypto.randomUUID(), venue: venue.trim(), location: location.trim(), game, stakes: stakes.trim(), currency, startedAt: new Date(startedAt).toISOString(), localDate: startedAt.slice(0, 10), endedAt: initial?.endedAt, buyIn: toMinor(Number(buyIn), currency), rebuy: initial?.rebuy || 0, cashOut: completed ? toMinor(Number(cashOut || 0), currency) : initial?.cashOut || 0, tips: completed ? toMinor(Number(tips || 0), currency) : initial?.tips || 0, note: note.trim(), rate: initial?.rate, createdAt: initial?.createdAt || now, updatedAt: now })
  }
  return <>
    <div className="modal-backdrop" onMouseDown={onClose}><div className="modal session-entry-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={initial ? 'セッションを編集' : 'セッションを開始'}>
      <div className="modal-header"><div><div className="eyebrow">{initial ? 'SESSION SETTINGS' : 'START SESSION'}</div><h2>{initial ? '基本情報を編集' : 'セッションを始める'}</h2><p className="entry-subtitle">{initial ? '会場や初回バイインを修正します。' : '開始に必要な項目だけを、短く入力します。'}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="閉じる"><X size={21} /></button></div>
      <form onSubmit={submit}>
        <div className="session-journey" aria-label="セッションの流れ"><span className="active"><strong>1</strong> 開始</span><i /><span><strong>2</strong> プレー中</span><i /><span><strong>3</strong> 収支確定</span></div>
        <div className="entry-section-heading">プレーした場所</div>
        <div className="form-grid">
          <div className="field"><span>会場名 <span className="required-mark">必須</span></span><button type="button" className={`picker-trigger ${venue ? 'has-value' : ''}`} onClick={() => setPicker('venue')}><MapPin size={18} /><span>{venue || '会場を選択・追加'}</span><ChevronRight size={17} /></button></div>
          <div className="field"><span>都市・場所</span><button type="button" className={`picker-trigger ${location ? 'has-value' : ''}`} onClick={() => setPicker('location')}><MapPin size={18} /><span>{location || '場所を選択・追加'}</span><ChevronRight size={17} /></button></div>
        </div>
        <div className="entry-section-heading">ゲームと通貨</div>
        <div className="field"><span>ゲーム</span><div className="choice-row">{(['ライブ', 'オンライン'] as const).map(value => <button type="button" key={value} className={`choice-button ${game === value ? 'selected' : ''}`} aria-pressed={game === value} onClick={() => setGame(value)}>{value}</button>)}</div></div>
        <div className="field"><span>通貨</span><div className="currency-choice-row"><button type="button" className={`choice-button ${currency === 'USD' ? 'selected' : ''}`} aria-pressed={currency === 'USD'} disabled={Boolean(initial)} onClick={() => chooseCurrency('USD')}>$ USD</button><button type="button" className={`choice-button ${currency === 'KRW' ? 'selected' : ''}`} aria-pressed={currency === 'KRW'} disabled={Boolean(initial)} onClick={() => chooseCurrency('KRW')}>₩ KRW</button><label className={`other-currency ${currency !== 'USD' && currency !== 'KRW' ? 'selected' : ''}`}><span>その他の通貨</span><select aria-label="その他の通貨" value={currency === 'USD' || currency === 'KRW' ? '' : currency} disabled={Boolean(initial)} onChange={event => { if (event.target.value) chooseCurrency(event.target.value as Currency) }}><option value="">選択</option>{currencies.filter(code => code !== 'USD' && code !== 'KRW').map(code => <option key={code} value={code}>{code}</option>)}</select><ChevronDown size={15} /></label></div>{initial && <small>既存の記録は通貨を変更できません。</small>}</div>
        <div className="field"><span>ブラインド <small className="field-inline-hint">{currency}のよく使う金額</small></span><div className="choice-row stakes-choices">{stakeChoices.map(value => <button type="button" key={value} className={`choice-button ${stakes === value && !customStakes ? 'selected' : ''}`} aria-pressed={stakes === value && !customStakes} onClick={() => { setStakes(value); setCustomStakes(false) }}>{value}</button>)}<button type="button" className={`choice-button ${customStakes ? 'selected' : ''}`} aria-pressed={customStakes} onClick={() => { setStakes(''); setCustomStakes(true) }}>その他</button></div>{customStakes && <input value={stakes} onChange={event => setStakes(event.target.value)} maxLength={80} placeholder="例: 10-20、0.5-1" />}</div>
        <div className="entry-section-heading">日時と投入額</div>
        <div className="form-grid"><label className="field">開始日時 <input type="datetime-local" value={startedAt} onChange={event => setStartedAt(event.target.value)} required /></label><label className="field buy-in-field">初回バイイン <span className="currency-input"><b>{currency}</b><input type="number" inputMode="decimal" min="0" step="any" required value={buyIn} onChange={event => setBuyIn(event.target.value)} placeholder={currency === 'KRW' ? '300000' : currency === 'USD' ? '300' : '0'} /></span>{buyIn !== '' && <span className="yen-estimate" role="status" aria-live="polite"><span>現在の参考円換算</span><strong>{buyInYen === null ? 'レート取得中…' : `約 ${formatYen(buyInYen)}`}</strong>{currency !== 'JPY' && entryRate && <small>{rateUnit.toLocaleString('ja-JP')} {currency} ≈ ¥{(entryRate.rate * rateUnit).toLocaleString('ja-JP', { maximumFractionDigits: 2 })} · {entryRate.date}基準{entryRate.stale ? ' · 前回取得' : ''}</small>}</span>}</label></div>
        {completed && <><div className="entry-section-heading">確定済みの収支</div><div className="form-grid"><label className="field">キャッシュアウト <input type="number" inputMode="decimal" min="0" step="any" required value={cashOut} onChange={event => setCashOut(event.target.value)} /></label><label className="field">チップ <input type="number" inputMode="decimal" min="0" step="any" value={tips} onChange={event => setTips(event.target.value)} /></label></div>{previewProfit !== null && <div className={`entry-profit-preview ${previewProfit < 0 ? 'loss' : ''}`}><span>修正後の収支</span><strong>{money(toMinor(previewProfit, currency), currency, true)}</strong><small>{previewYen === null ? '円換算レート未取得' : `参考円換算 ${formatYen(previewYen, true)}`}</small></div>}</>}
        <label className="field full">セッションメモ <textarea value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={4000} placeholder="気づいたことがあれば記録" /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit"><Check size={17} /> {initial ? '変更を保存' : 'セッションを開始'}</button></div>
      </form>
    </div></div>
    {picker === 'venue' && <EntryDrawer title="会場" value={venue} options={venueOptions} onClose={() => setPicker(null)} onChoose={(value, option) => { setVenue(value); if (option?.secondary) setLocation(option.secondary); else if (value !== venue) setLocation(''); setPicker(null) }} />}
    {picker === 'location' && <EntryDrawer title="場所" value={location} options={locationOptions} allowClear onClose={() => setPicker(null)} onChoose={value => { setLocation(value); setPicker(null) }} />}
  </>
}

function RebuyForm({ session, onClose, onSave }: { session: Session; onClose: () => void; onSave: (amount: number) => void }) {
  const initialAmount = fromMinor(session.buyIn, session.currency)
  const [amount, setAmount] = useState('')
  const minor = Number.isFinite(Number(amount)) && Number(amount) > 0 ? toMinor(Number(amount), session.currency) : 0
  const presets = [...new Set([initialAmount / 2, initialAmount, initialAmount * 2].filter(value => value > 0))]
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal action-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="リバイを追加">
    <div className="action-modal-head"><div className="action-icon"><Plus size={22} /></div><div><div className="eyebrow">ADD REBUY</div><h2>リバイを追加</h2><p>{session.venue} · {session.stakes}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="閉じる"><X size={21} /></button></div>
    <div className="session-journey compact" aria-label="セッションの流れ"><span><strong>1</strong> 開始</span><i /><span className="active"><strong>2</strong> プレー中</span><i /><span><strong>3</strong> 収支確定</span></div>
    <div className="money-context"><span>現在の投入合計</span><strong>{money(session.buyIn + session.rebuy, session.currency)}</strong><small>初回 {money(session.buyIn, session.currency)} · リバイ {money(session.rebuy, session.currency)}</small></div>
    <div className="action-section"><span className="action-label">追加する金額</span><div className="amount-presets">{presets.map(value => <button type="button" key={value} className={Number(amount) === value ? 'selected' : ''} onClick={() => setAmount(String(value))}>{value === initialAmount ? <small>初回と同額</small> : null}<strong>{money(toMinor(value, session.currency), session.currency)}</strong></button>)}</div><label className="money-input"><span>{session.currency}</span><input autoFocus type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="金額を入力" /></label><p>プリセット以外の金額も直接入力できます。</p></div>
    <div className="action-summary"><span>追加後の投入合計</span><strong>{money(session.buyIn + session.rebuy + minor, session.currency)}</strong></div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>戻る</button><button type="button" className="primary-button action-primary" disabled={minor <= 0} onClick={() => onSave(minor)}><Plus size={17} /> リバイを追加</button></div>
  </div></div>
}

function FinishSessionForm({ session, rate, onClose, onSave }: { session: Session; rate?: Rate; onClose: () => void; onSave: (session: Session) => void }) {
  const [cashOut, setCashOut] = useState('')
  const [tips, setTips] = useState('0')
  const cashOutMinor = cashOut === '' ? null : toMinor(Number(cashOut), session.currency)
  const tipsMinor = toMinor(Number(tips || 0), session.currency)
  const invested = session.buyIn + session.rebuy
  const result = cashOutMinor === null ? null : cashOutMinor - invested - tipsMinor
  const yen = result === null ? null : asYen(result, session.currency, rate)
  const finish = (event: React.FormEvent) => {
    event.preventDefault()
    if (cashOutMinor === null || cashOutMinor < 0 || tipsMinor < 0) return
    const now = new Date().toISOString()
    onSave({ ...session, endedAt: now, cashOut: cashOutMinor, tips: tipsMinor, rate, updatedAt: now })
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal action-modal finish-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="セッションを終了">
    <div className="action-modal-head"><div className="action-icon finish"><Check size={22} /></div><div><div className="eyebrow">CLOSE SESSION</div><h2>収支を確定</h2><p>{session.venue} · {duration(session)} プレー</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="閉じる"><X size={21} /></button></div>
    <div className="session-journey compact" aria-label="セッションの流れ"><span><strong>1</strong> 開始</span><i /><span><strong>2</strong> プレー中</span><i /><span className="active"><strong>3</strong> 収支確定</span></div>
    <div className="money-context"><span>投入した合計</span><strong>{money(invested, session.currency)}</strong><small>初回 {money(session.buyIn, session.currency)} · リバイ {money(session.rebuy, session.currency)}</small></div>
    <form onSubmit={finish}><div className="action-section"><span className="action-label">手元に戻った金額</span><div className="finish-shortcuts"><button type="button" onClick={() => setCashOut(String(fromMinor(invested, session.currency)))}>±0 の金額</button><button type="button" onClick={() => setCashOut('0')}>全額失った</button></div><label className="money-input featured"><span>{session.currency}</span><input autoFocus required type="number" inputMode="decimal" min="0" step="any" value={cashOut} onChange={event => setCashOut(event.target.value)} placeholder="キャッシュアウト" /></label><label className="compact-money-field"><span>チップ・諸経費</span><input type="number" inputMode="decimal" min="0" step="any" value={tips} onChange={event => setTips(event.target.value)} /></label></div>
      <div className={`settlement-preview ${result !== null && result < 0 ? 'loss' : ''}`}><span>今回の収支</span><strong>{result === null ? '—' : money(result, session.currency, true)}</strong><small>{result === null ? 'キャッシュアウトを入力すると即時に計算します' : yen === null ? '円換算レート未取得' : `参考円換算 ${formatYen(yen, true)}`}</small></div>
      <p className="form-hint">{rate ? `${rate.date} 基準の参考レートをこの記録に固定します。` : '元通貨の収支は保存できます。円換算は未確定です。'}</p>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>まだ続ける</button><button className="primary-button action-primary" type="submit" disabled={cashOutMinor === null}><Check size={17} /> 収支を確定する</button></div></form>
  </div></div>
}

function ExternalBrowserGuide({ browser, onClose }: { browser: Exclude<InAppBrowser, null>; onClose: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle')
  const url = window.location.href
  const isAndroid = /android/i.test(navigator.userAgent)
  const intentUrl = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopyState('done') }
    catch { setCopyState('failed') }
  }
  const browserName = browser === 'line' ? 'LINE' : browser === 'instagram' ? 'Instagram' : 'Facebook'
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal external-browser-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="外部ブラウザで開く">
    <div className="external-browser-icon"><ExternalLink size={25} /></div>
    <button className="icon-button external-browser-close" onClick={onClose} aria-label="閉じる"><X size={21} /></button>
    <div className="eyebrow">SECURE GOOGLE LOGIN</div>
    <h2>ブラウザを切り替えて<br />ログイン</h2>
    <p>{browserName}内ブラウザでは、Googleのパスワードやパスキーが制限される場合があります。</p>
    {isAndroid && <a className="primary-button external-open-button" href={intentUrl}><ExternalLink size={17} /> 端末のブラウザで開く</a>}
    <div className="external-browser-steps"><div><strong>1</strong><span>{browserName}の <b>…</b> メニューを開く</span></div><div><strong>2</strong><span><b>デフォルトのブラウザで開く</b>、または <b>Safariで開く</b> を選ぶ</span></div><div><strong>3</strong><span>RIVERLOGで「Googleでログイン」を押す</span></div></div>
    <button className={`copy-url-button ${copyState === 'done' ? 'done' : ''}`} onClick={copy}><Copy size={16} /><span>{copyState === 'done' ? 'URLをコピーしました' : copyState === 'failed' ? 'コピーできませんでした' : 'URLをコピー'}</span></button>
    <small>インストール済みの場合は、端末の設定によりPWAが開きます。</small>
  </div></div>
}

function PlayerForm({ initial, onClose, onSave, onDelete }: { initial?: Player; onClose: () => void; onSave: (player: Player) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState(initial?.name || ''); const [venue, setVenue] = useState(initial?.venue || ''); const [tags, setTags] = useState(initial?.tags.join(', ') || ''); const [note, setNote] = useState(initial?.note || '')
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="プレイヤーメモ"><div className="modal-header"><div><div className="eyebrow">PLAYER NOTE</div><h2>{initial ? 'メモを編集' : 'プレイヤーメモ'}</h2></div><button className="icon-button" onClick={onClose} aria-label="閉じる"><X size={21} /></button></div><form onSubmit={e => { e.preventDefault(); if (!name.trim()) return; onSave({ id: initial?.id || crypto.randomUUID(), name: name.trim(), venue: venue.trim(), tags: tags.split(',').map(t => t.trim()).filter(Boolean), note: note.trim(), updatedAt: new Date().toISOString() }) }}><label className="field full">名前・仮名 <input required value={name} onChange={e => setName(e.target.value)} placeholder="例: 3番席の Michael" /></label><label className="field full">会場 <input value={venue} onChange={e => setVenue(e.target.value)} placeholder="例: Bellagio" /></label><label className="field full">タグ <input value={tags} onChange={e => setTags(e.target.value)} placeholder="タイト, 常連, アグレッシブ" /><small>カンマ区切りで入力</small></label><label className="field full">特徴・メモ <textarea rows={5} value={note} onChange={e => setNote(e.target.value)} placeholder="プレー傾向や次に覚えておきたいこと" /></label><div className="modal-actions">{initial && <button type="button" className="delete-button" onClick={() => onDelete(initial.id)}><Trash2 size={16} /> 削除</button>}<button className="primary-button" type="submit"><Check size={17} /> 保存する</button></div></form></div></div>
}

function SessionDetail({ session, currentRate, now, onClose, onEdit, onDelete, onQuickRebuy, onCustomRebuy, onFinish }: { session: Session; currentRate?: Rate; now: number; onClose: () => void; onEdit: () => void; onDelete: () => void; onQuickRebuy: () => void; onCustomRebuy: () => void; onFinish: () => void }) {
  const result = profit(session)
  const yen = asYen(result, session.currency, session.rate)
  const currentYen = asYen(result, session.currency, currentRate)
  const invested = session.buyIn + session.rebuy
  const active = !session.endedAt
  return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal detail-modal ${active ? 'live-detail-modal' : ''}`} onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="セッション詳細">
    <div className="modal-header"><div><div className="eyebrow">{active ? 'LIVE SESSION' : 'SESSION RESULT'}</div><h2>{session.venue}</h2><span className="detail-subtitle">{session.stakes} · {session.location || session.game} · {dateLabel((session.localDate || session.startedAt.slice(0, 10)) + 'T12:00:00')}</span></div><button className="icon-button" onClick={onClose} aria-label="閉じる"><X size={21} /></button></div>
    {active ? <>
      <section className="live-session-hero"><span className="live-status"><i /> PLAYING NOW</span><div className="live-clock">{duration(session, now)}</div><p>現在の投入合計</p><strong>{money(invested, session.currency)}</strong></section>
      <div className="live-command-label">次の操作</div>
      <div className="live-command-grid">
        <button className="live-command quick" onClick={onQuickRebuy}><span className="live-command-icon"><Plus size={20} /></span><span><small>ワンタップ</small><strong>同額リバイ</strong><em>{money(session.buyIn, session.currency)}</em></span></button>
        <button className="live-command" onClick={onCustomRebuy}><span className="live-command-icon"><Wallet size={20} /></span><span><small>金額を変える</small><strong>別の金額を追加</strong><em>自由入力</em></span><ChevronRight size={18} /></button>
        <button className="live-command finish" onClick={onFinish}><span className="live-command-icon"><Check size={20} /></span><span><small>キャッシュアウトを入力</small><strong>セッションを終了</strong><em>収支を確定</em></span><ArrowRight size={18} /></button>
      </div>
      <div className="investment-breakdown"><div><span>初回バイイン</span><strong>{money(session.buyIn, session.currency)}</strong></div><div><span>追加済みリバイ</span><strong>{money(session.rebuy, session.currency)}</strong></div></div>
    </> : <>
      <div className={`detail-result ${result < 0 ? 'loss' : ''}`}><small>現地通貨の収支</small><strong>{money(result, session.currency, true)}</strong><span>記録時の参考円換算 {formatYen(yen, true)}</span></div>
      <div className="detail-list"><div><span>初回バイイン</span><strong>{money(session.buyIn, session.currency)}</strong></div><div><span>リバイ・追加購入</span><strong>{money(session.rebuy, session.currency)}</strong></div><div><span>キャッシュアウト</span><strong>{money(session.cashOut, session.currency)}</strong></div><div><span>チップ</span><strong>{money(session.tips, session.currency)}</strong></div><div><span>プレー時間</span><strong>{duration(session, now)}</strong></div></div>
      {session.rate && <div className="detail-rate"><Globe2 size={17} /><div><strong>1 {session.currency} = ¥{session.rate.rate.toFixed(2)}</strong><span>{session.rate.date} 基準 · {session.rate.provider} · 記録時に固定</span>{currentRate && currentYen !== null && yen !== null && currentYen !== yen && <span>現在の参考評価 {formatYen(currentYen, true)}（評価差 {formatYen(currentYen - yen, true)}）</span>}</div></div>}
    </>}
    {session.note && <div className="detail-note"><Tag size={16} /><p>{session.note}</p></div>}
    <div className="modal-actions detail-actions"><button className="delete-button" onClick={onDelete}><Trash2 size={16} /> 削除</button><button className="secondary-button" onClick={onEdit}>基本情報を編集</button></div>
  </div></div>
}

export default App
