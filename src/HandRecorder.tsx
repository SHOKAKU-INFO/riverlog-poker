import { useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, RotateCcw, Trophy, X } from 'lucide-react'
import { activeTableSeats, currentStreetBet, defaultTableSettings, settlePokerHand, streetContributionFor, tablePositionFor, totalContributionFor, type PokerAction, type PokerActionType, type PokerStreet, type PokerTableState } from './domain'

const streets: { id: PokerStreet; label: string }[] = [{ id: 'preflop', label: 'プリフロップ' }, { id: 'flop', label: 'フロップ' }, { id: 'turn', label: 'ターン' }, { id: 'river', label: 'リバー' }]
const actionLabels: Record<PokerActionType, string> = { ante: 'アンティ', 'small-blind': 'SB', 'big-blind': 'BB', fold: 'フォールド', check: 'チェック', call: 'コール', bet: 'ベット', raise: 'レイズ', 'all-in': 'オールイン' }

type Props = {
  table: PokerTableState
  actions: PokerAction[]
  onActionsChange: (actions: PokerAction[]) => void
  onBack: () => void
  onComplete: (table: PokerTableState) => void
  onSkip: () => void
}

export function HandRecorder({ table, actions, onActionsChange, onBack, onComplete, onSkip }: Props) {
  const [street, setStreet] = useState<PokerStreet>('preflop')
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [resultMode, setResultMode] = useState(false)
  const [winnerSeats, setWinnerSeats] = useState<number[]>([])
  const activeSeats = activeTableSeats(table)
  const players = new Map(table.players.map(player => [player.seat, player]))
  const missingStacks = activeSeats.filter(seat => players.get(seat)?.stackBb === undefined)
  const foldedSeats = new Set(actions.filter(action => action.type === 'fold').map(action => action.seat))
  const selectedPlayer = selectedSeat === null ? undefined : players.get(selectedSeat)
  const remaining = selectedPlayer?.stackBb === undefined || selectedSeat === null ? null : Math.max(0, selectedPlayer.stackBb - totalContributionFor(actions, selectedSeat))
  const currentBet = currentStreetBet(actions, street)
  const alreadyPaid = selectedSeat === null ? 0 : streetContributionFor(actions, selectedSeat, street)
  const callAmount = remaining === null ? Math.max(0, currentBet - alreadyPaid) : Math.min(remaining, Math.max(0, currentBet - alreadyPaid))
  const settings = table.settings || defaultTableSettings()
  const pot = actions.reduce((sum, action) => sum + action.amountBb, 0)
  const rake = Math.min(pot * settings.rakePercent / 100, settings.rakeCapBb > 0 ? settings.rakeCapBb : Number.POSITIVE_INFINITY)
  const userActions = actions.filter(action => !['ante', 'small-blind', 'big-blind'].includes(action.type))
  const selectedStreetIndex = streets.findIndex(item => item.id === street)
  const availableWinners = activeSeats.filter(seat => !foldedSeats.has(seat))
  const addAction = (type: PokerActionType, paid = 0, toBb?: number) => {
    if (selectedSeat === null) return
    onActionsChange([...actions, { id: crypto.randomUUID(), street, seat: selectedSeat, type, amountBb: Math.round(paid * 100) / 100, toBb, createdAt: new Date().toISOString() }])
    setAmount('')
  }
  const addTargetAction = (type: 'bet' | 'raise') => {
    const target = Number(amount)
    if (!Number.isFinite(target) || target <= alreadyPaid) return
    const wanted = target - alreadyPaid
    const paid = remaining === null ? wanted : Math.min(wanted, remaining)
    addAction(type, paid, Math.round((alreadyPaid + paid) * 100) / 100)
  }
  const timeline = useMemo(() => actions.map(action => ({ ...action, player: players.get(action.seat) })), [actions, table.players])

  return <div className="hand-recorder-backdrop"><div className="hand-recorder" role="dialog" aria-modal="true" aria-label={`ハンド ${table.handNumber} の記録`}>
    <header className="hand-recorder-header"><button className="icon-button" onClick={onBack} aria-label="卓へ戻る"><ArrowLeft size={21} /></button><div><span>HAND #{table.handNumber}</span><h2>{resultMode ? '結果を確定' : 'アクションを記録'}</h2></div><button className="icon-button" onClick={onBack} aria-label="閉じる"><X size={21} /></button></header>

    {!resultMode ? <>
      <div className="street-tabs">{streets.map(item => <button key={item.id} className={street === item.id ? 'active' : ''} onClick={() => setStreet(item.id)}>{item.label}<small>{actions.filter(action => action.street === item.id && !['ante', 'small-blind', 'big-blind'].includes(action.type)).length}</small></button>)}</div>
      <section className="action-pot-bar"><span>現在のポット<strong>{pot.toFixed(1)} BB</strong></span><span>現在のベット<strong>{currentBet.toFixed(1)} BB</strong></span><span>記録<strong>{userActions.length} actions</strong></span></section>
      {missingStacks.length > 0 && <button className="stack-warning" onClick={onBack}><ArrowLeft size={16} /><span><strong>スタック未入力の席があります</strong><small>{missingStacks.join('・')}番席を卓画面から入力してください</small></span><ChevronRight size={16} /></button>}
      <div className="action-layout">
        <section className="actor-panel"><div className="action-section-title"><span>1</span><div><strong>アクションした人</strong><small>席を選択</small></div></div><div className="actor-grid">{activeSeats.map(seat => { const player = players.get(seat); const seatRemaining = player?.stackBb === undefined ? null : Math.max(0, player.stackBb - totalContributionFor(actions, seat)); return <button key={seat} className={`${selectedSeat === seat ? 'active' : ''} ${foldedSeats.has(seat) ? 'folded' : ''}`} disabled={foldedSeats.has(seat)} onClick={() => setSelectedSeat(seat)}><span>{tablePositionFor(table, seat)}</span><strong>{player?.name || '自分'}</strong><small>{seatRemaining === null ? '— BB' : `${seatRemaining.toFixed(1)} BB`}</small></button> })}</div></section>
        <section className={`action-picker ${selectedSeat === null ? 'disabled' : ''}`}><div className="action-section-title"><span>2</span><div><strong>{selectedPlayer?.name || (selectedSeat === table.heroSeat ? '自分' : 'アクション')}</strong><small>{selectedSeat === null ? '先に席を選択' : `${tablePositionFor(table, selectedSeat)} · 残り ${remaining === null ? '—' : remaining.toFixed(1)} BB`}</small></div></div><div className="quick-actions"><button disabled={selectedSeat === null} onClick={() => addAction('fold')}>フォールド</button><button disabled={selectedSeat === null || callAmount > 0} onClick={() => addAction('check')}>チェック</button><button disabled={selectedSeat === null || callAmount <= 0} onClick={() => addAction('call', callAmount, currentBet)}>コール<small>{callAmount.toFixed(1)} BB</small></button>{remaining !== null && <button disabled={selectedSeat === null || remaining <= 0} className="allin" onClick={() => addAction('all-in', remaining, alreadyPaid + remaining)}>オールイン<small>{remaining.toFixed(1)} BB</small></button>}</div><div className="target-action"><div><label>合計</label><input type="number" inputMode="decimal" min={alreadyPaid} step="0.5" value={amount} onChange={event => setAmount(event.target.value)} placeholder={currentBet > 0 ? `例: ${Math.max(currentBet * 2, currentBet + 1)}` : '例: 3'} /><span>BBまで</span></div><button disabled={selectedSeat === null || !amount} onClick={() => addTargetAction(currentBet > 0 ? 'raise' : 'bet')}>{currentBet > 0 ? 'レイズを追加' : 'ベットを追加'}</button></div></section>
      </div>
      <section className="action-timeline"><div className="action-timeline-head"><div><strong>アクション履歴</strong><small>{streets.find(item => item.id === street)?.label}</small></div>{userActions.length > 0 && <button onClick={() => onActionsChange(actions.filter((_, index) => index !== actions.length - 1))}><RotateCcw size={14} /> 1つ戻す</button>}</div><div>{timeline.filter(action => action.street === street).map(action => <span key={action.id} className={`timeline-action ${action.type}`}><b>{tablePositionFor(table, action.seat)} {action.player?.name || '自分'}</b>{actionLabels[action.type]}{action.amountBb > 0 && ` ${action.toBb !== undefined && ['bet','raise','all-in'].includes(action.type) ? `${action.toBb} BBまで` : `${action.amountBb} BB`}`}</span>)}{!timeline.some(action => action.street === street) && <em>まだアクションがありません</em>}</div></section>
      <footer className="hand-recorder-actions"><button className="skip-hand" onClick={onSkip}>記録せず次へ</button>{selectedStreetIndex < streets.length - 1 && <button className="secondary-button" onClick={() => setStreet(streets[selectedStreetIndex + 1].id)}>次のストリート <ChevronRight size={16} /></button>}<button className="primary-button" onClick={() => setResultMode(true)}><Trophy size={17} /> ハンド結果へ</button></footer>
    </> : <>
      <section className="hand-result-summary"><span>計算ポット</span><strong>{pot.toFixed(1)} BB</strong><div><span>レーキ {rake.toFixed(2)} BB</span><span>勝者へ {(pot - rake).toFixed(2)} BB</span></div></section>
      <section className="winner-picker"><div className="action-section-title"><span><Trophy size={15} /></span><div><strong>勝者を選択</strong><small>チョップは複数選択</small></div></div><div>{availableWinners.map(seat => { const player = players.get(seat); return <button key={seat} className={winnerSeats.includes(seat) ? 'active' : ''} onClick={() => setWinnerSeats(current => current.includes(seat) ? current.filter(item => item !== seat) : [...current, seat])}><span>{tablePositionFor(table, seat)}</span><strong>{player?.name || '自分'}</strong>{winnerSeats.includes(seat) && <Check size={17} />}</button> })}</div></section>
      {missingStacks.length > 0 && <button className="stack-warning" onClick={onBack}><ArrowLeft size={16} /><span><strong>自動計算には全員のスタックが必要です</strong><small>戻って{missingStacks.join('・')}番席を入力</small></span><ChevronRight size={16} /></button>}
      <section className="stack-preview"><strong>記録後のスタック</strong>{activeSeats.map(seat => { const player = players.get(seat); const contribution = totalContributionFor(actions, seat); const win = winnerSeats.includes(seat) && winnerSeats.length ? (pot - rake) / winnerSeats.length : 0; return <div key={seat}><span>{player?.name || '自分'}<small>{contribution.toFixed(1)} BB 投入</small></span><b>{player?.stackBb === undefined ? '—' : `${(player.stackBb - contribution + win).toFixed(1)} BB`}</b></div> })}</section>
      <footer className="hand-recorder-actions"><button className="secondary-button" onClick={() => setResultMode(false)}><ArrowLeft size={16} /> アクションへ戻る</button><button className="primary-button" disabled={winnerSeats.length === 0 || missingStacks.length > 0} onClick={() => onComplete(settlePokerHand(table, actions, winnerSeats).table)}><Check size={17} /> 確定して次のハンド</button></footer>
    </>}
  </div></div>
}
