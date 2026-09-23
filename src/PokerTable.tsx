import { useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Settings2, Trash2, UserRound, X } from 'lucide-react'
import { activeTableSeats, defaultPokerTable, defaultTableSettings, effectiveButtonSeat, forcedPokerActions, movePokerSeat, nextPokerHand, tablePositionFor, type Player, type PokerAction, type PokerTableSettings, type PokerTableState, type Session, type TablePlayer, type TableSeatCount } from './domain'
import { HandRecorder } from './HandRecorder'

const tagChoices = ['タイト', 'ルーズ', 'アグレッシブ', 'パッシブ', '常連', 'ショート']

type Props = {
  session: Session
  savedPlayers: Player[]
  onChange: (session: Session, message?: string) => void
  onSavePlayer: (player: Player) => void
}

export function PokerTable({ session, savedPlayers, onChange, onSavePlayer }: Props) {
  const table = session.table || defaultPokerTable()
  const [editingSeat, setEditingSeat] = useState<number | null>(null)
  const [movingButton, setMovingButton] = useState(false)
  const [editingSettings, setEditingSettings] = useState(false)
  const [recordingHand, setRecordingHand] = useState(false)
  const [draftActions, setDraftActions] = useState<PokerAction[] | null>(null)
  const [draggingSeat, setDraggingSeat] = useState<number | null>(null)
  const [dragTargetSeat, setDragTargetSeat] = useState<number | null>(null)
  const dragRef = useRef<{ from: number; target: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressSeatClick = useRef(false)
  const seated = useMemo(() => new Map(table.players.map(player => [player.seat, player])), [table.players])
  const activeSeats = activeTableSeats(table)
  const dealerSeat = effectiveButtonSeat(table)
  const updateTable = (next: PokerTableState, message?: string) => onChange({ ...session, table: next, updatedAt: new Date().toISOString() }, message)
  const changeSeatCount = (seatCount: TableSeatCount) => { setDraftActions(null); updateTable({
    ...table, seatCount, heroSeat: Math.min(table.heroSeat, seatCount), buttonSeat: Math.min(table.buttonSeat, seatCount), players: table.players.filter(player => player.seat <= seatCount),
  }) }
  const openHandRecorder = () => { if (!draftActions) setDraftActions(forcedPokerActions(table)); setRecordingHand(true) }
  const moveSeat = (from: number, to: number) => {
    if (from === to) return
    const targetPlayer = table.players.find(player => player.seat === to)
    const draft = movePokerSeat(table, from, to)
    setDraftActions(null)
    updateTable(draft, targetPlayer || to === table.heroSeat ? `${from}番席と${to}番席を入れ替えました` : `${from}番席を${to}番席へ移動しました`)
  }

  return <section className="table-notes">
    <div className="table-notes-head">
      <div><span>LIVE TABLE NOTES</span><h3>テーブルメモ</h3><p>席をタップして相手を記録</p></div>
      <div className="table-head-controls"><button className="table-settings-button" onClick={() => setEditingSettings(true)} aria-label="卓設定"><Settings2 size={15} /></button><button className={`move-button-control ${movingButton ? 'active' : ''}`} onClick={() => setMovingButton(value => !value)}><span>D</span>{movingButton ? '席を選択' : 'BTNを移動'}</button><div className="table-size-picker" aria-label="テーブル最大席数">
        {([6, 8, 9] as TableSeatCount[]).map(count => <button key={count} className={table.seatCount === count ? 'active' : ''} onClick={() => changeSeatCount(count)}>{count}席</button>)}
      </div>
      </div>
    </div>

    <div className={`table-live-count ${movingButton ? 'moving' : ''}`}><span>{movingButton ? 'BTNを置く着席中の席をタップ' : `現在 ${activeSeats.length}人 / ${table.seatCount}席`}</span><small>{table.seatCount - activeSeats.length}席 空席</small></div>

    <div className={`poker-table-stage ${movingButton ? 'button-move-mode' : ''}`}>
      <div className="poker-felt"><div className="felt-center"><span>HAND</span><strong>#{table.handNumber}</strong><small>{session.stakes || 'RIVERLOG'}</small></div></div>
      {Array.from({ length: table.seatCount }, (_, index) => {
        const seat = index + 1
        const angle = -Math.PI / 2 + index / table.seatCount * Math.PI * 2
        const player = seated.get(seat)
        const occupied = activeSeats.includes(seat)
        const position = tablePositionFor(table, seat)
        return <button
          key={seat}
          className={`poker-seat ${occupied ? 'occupied' : ''} ${seat === table.heroSeat ? 'hero' : ''} ${movingButton && occupied ? 'button-target' : ''} ${draggingSeat === seat ? 'dragging' : ''} ${draggingSeat !== null && dragTargetSeat === seat && draggingSeat !== seat ? 'drag-target' : ''}`}
          style={{ left: `${50 + Math.cos(angle) * 42}%`, top: `${50 + Math.sin(angle) * 39}%` }}
          data-seat={seat}
          onPointerDown={event => {
            if (!occupied || movingButton) return
            dragRef.current = { from: seat, target: seat, x: event.clientX, y: event.clientY, moved: false }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            const drag = dragRef.current
            if (!drag) return
            if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 9) return
            drag.moved = true; setDraggingSeat(drag.from)
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-seat]')
            const nextTarget = Number(target?.dataset.seat || drag.target)
            if (nextTarget >= 1 && nextTarget <= table.seatCount) { drag.target = nextTarget; setDragTargetSeat(nextTarget) }
          }}
          onPointerUp={() => {
            const drag = dragRef.current
            if (drag?.moved) { suppressSeatClick.current = true; moveSeat(drag.from, drag.target); window.setTimeout(() => { suppressSeatClick.current = false }, 0) }
            dragRef.current = null; setDraggingSeat(null); setDragTargetSeat(null)
          }}
          onPointerCancel={() => { dragRef.current = null; setDraggingSeat(null); setDragTargetSeat(null) }}
          onClick={() => {
            if (suppressSeatClick.current) return
            if (movingButton && occupied) { setDraftActions(null); updateTable({ ...table, buttonSeat: seat }, `BTNを${seat}番席へ移動しました`); setMovingButton(false); return }
            setEditingSeat(seat)
          }}
          aria-label={`${seat}番席 ${position} ${player?.name || (seat === table.heroSeat ? '自分' : '空席')}`}
        >
          {seat === dealerSeat && <i className="dealer-chip">D</i>}
          <span className="seat-position">{position || '空席'}</span>
          <strong>{player?.name || (seat === table.heroSeat ? '自分' : `${seat}番席`)}</strong>
          <small>{player?.stackBb !== undefined ? `${player.stackBb} BB` : player ? 'スタック未入力' : 'タップして追加'}</small>
        </button>
      })}
    </div>

    <button className="next-hand-button" onClick={openHandRecorder}>
      <span>#{table.handNumber}</span><span><small>ACTION TRACKER</small><strong>ハンドを記録して次へ</strong></span><ChevronRight size={20} />
    </button>
    <p className="table-help">席は指でそのまま移動できます。相手の席へ重ねると入れ替わります。</p>

    {(table.hands?.length || 0) > 0 && <div className="hand-history"><div><strong>最近のハンド</strong><span>{table.hands?.length} hands</span></div>{[...(table.hands || [])].reverse().slice(0, 3).map(hand => <article key={hand.id}><span>#{hand.number}</span><strong>{hand.potBb.toFixed(1)} BB</strong><small>Rake {hand.rakeBb.toFixed(2)} · {hand.actions.length} actions</small></article>)}</div>}

    {editingSeat !== null && <SeatEditor
      seat={editingSeat}
      table={table}
      current={seated.get(editingSeat)}
      savedPlayers={savedPlayers}
      venue={session.venue}
      onClose={() => setEditingSeat(null)}
      onSave={(player, makeHero, makeButton) => {
        const matchingPlayer = savedPlayers.find(item => item.name.toLocaleLowerCase() === player.name.toLocaleLowerCase())
        const playerId = player.name === '自分' ? undefined : player.playerId || matchingPlayer?.id || crypto.randomUUID()
        const seatedPlayer = { ...player, playerId }
        let players = [...table.players.filter(item => item.seat !== editingSeat), seatedPlayer]
        if (makeHero) players = players.filter(item => item.seat === editingSeat || item.name !== '自分')
        const draft = { ...table, players, heroSeat: makeHero ? editingSeat : table.heroSeat, buttonSeat: makeButton ? editingSeat : table.buttonSeat }
        updateTable({ ...draft, buttonSeat: effectiveButtonSeat(draft) }, `${editingSeat}番席を保存しました`)
        if (playerId) onSavePlayer({ id: playerId, name: player.name, venue: session.venue, tags: player.tags, note: player.note, updatedAt: new Date().toISOString() })
        setDraftActions(null)
        setMovingButton(false)
        setEditingSeat(null)
      }}
      onClear={() => { const draft = { ...table, players: table.players.filter(item => item.seat !== editingSeat) }; setDraftActions(null); updateTable({ ...draft, buttonSeat: effectiveButtonSeat(draft) }, `${editingSeat}番席を退席にしました`); setMovingButton(false); setEditingSeat(null) }}
    />}
    {editingSettings && <TableSettingsEditor initial={table.settings || defaultTableSettings()} onClose={() => setEditingSettings(false)} onSave={settings => { setDraftActions(null); updateTable({ ...table, settings }, '卓設定を保存しました'); setEditingSettings(false) }} />}
    {recordingHand && draftActions && <HandRecorder table={table} actions={draftActions} onActionsChange={setDraftActions} onBack={() => setRecordingHand(false)} onSkip={() => { updateTable(nextPokerHand(table), `ハンド #${table.handNumber + 1}へ進みました`); setDraftActions(null); setRecordingHand(false) }} onComplete={next => { updateTable(next, `ハンド #${table.handNumber}を記録しました`); setDraftActions(null); setRecordingHand(false) }} />}
  </section>
}

function TableSettingsEditor({ initial, onClose, onSave }: { initial: PokerTableSettings; onClose: () => void; onSave: (settings: PokerTableSettings) => void }) {
  const [smallBlindBb, setSmallBlindBb] = useState(String(initial.smallBlindBb)); const [anteBb, setAnteBb] = useState(String(initial.anteBb)); const [rakePercent, setRakePercent] = useState(String(initial.rakePercent)); const [rakeCapBb, setRakeCapBb] = useState(String(initial.rakeCapBb))
  const [straddleMode, setStraddleMode] = useState(initial.straddleMode || 'none'); const [straddleBb, setStraddleBb] = useState(String(initial.straddleBb || 2))
  const number = (value: string) => Math.max(0, Number(value) || 0)
  return <div className="seat-editor-backdrop" onMouseDown={onClose}><div className="seat-editor table-settings-editor" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="卓設定"><div className="seat-editor-grip" /><div className="seat-editor-head"><div><span>TABLE SETTINGS</span><h3>ブラインド・レーキ設定</h3></div><button className="icon-button" onClick={onClose} aria-label="閉じる"><X size={20} /></button></div><p className="settings-lead">設定値はBB単位です。ハンド開始時にSB・BB・アンティ・既定ストラドルを自動で反映します。</p><form onSubmit={event => { event.preventDefault(); onSave({ smallBlindBb: number(smallBlindBb), anteBb: number(anteBb), rakePercent: number(rakePercent), rakeCapBb: number(rakeCapBb), straddleMode, straddleBb: number(straddleBb) }) }}><div className="seat-editor-row"><label className="field">SB（BB）<input required type="number" inputMode="decimal" min="0" step="0.01" value={smallBlindBb} onChange={event => setSmallBlindBb(event.target.value)} /></label><label className="field">アンティ（BB / 人）<input required type="number" inputMode="decimal" min="0" step="0.01" value={anteBb} onChange={event => setAnteBb(event.target.value)} /></label></div><div className="straddle-default-setting"><span>既定ストラドル</span><div>{([{ id: 'none', label: 'なし' }, { id: 'utg', label: 'UTG' }, { id: 'button', label: 'ボタン' }] as const).map(option => <button type="button" key={option.id} className={straddleMode === option.id ? 'active' : ''} onClick={() => setStraddleMode(option.id)}>{option.label}</button>)}</div>{straddleMode !== 'none' && <label>金額<input required type="number" inputMode="decimal" min="0" step="0.5" value={straddleBb} onChange={event => setStraddleBb(event.target.value)} /><span>BB</span></label>}<small>各ハンドの入力画面で任意席へ変更・解除できます。</small></div><div className="seat-editor-row"><label className="field">レーキ率（%）<input required type="number" inputMode="decimal" min="0" max="100" step="0.1" value={rakePercent} onChange={event => setRakePercent(event.target.value)} /></label><label className="field">レーキ上限（BB）<input required type="number" inputMode="decimal" min="0" step="0.01" value={rakeCapBb} onChange={event => setRakeCapBb(event.target.value)} /><small>0なら上限なし</small></label></div><div className="rake-preview"><span>例: 20 BBのポット</span><strong>レーキ {Math.min(20 * number(rakePercent) / 100, number(rakeCapBb) > 0 ? number(rakeCapBb) : Number.POSITIVE_INFINITY).toFixed(2)} BB</strong></div><div className="seat-editor-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit"><Check size={17} /> 設定を保存</button></div></form></div></div>
}

function SeatEditor({ seat, table, current, savedPlayers, venue, onClose, onSave, onClear }: {
  seat: number; table: PokerTableState; current?: TablePlayer; savedPlayers: Player[]; venue: string
  onClose: () => void; onSave: (player: TablePlayer, makeHero: boolean, makeButton: boolean) => void; onClear: () => void
}) {
  const [playerId, setPlayerId] = useState(current?.playerId || '')
  const [name, setName] = useState(current?.name || (seat === table.heroSeat ? '自分' : ''))
  const [stack, setStack] = useState(current?.stackBb?.toString() || '')
  const [tags, setTags] = useState<string[]>(current?.tags || [])
  const [note, setNote] = useState(current?.note || '')
  const [makeHero, setMakeHero] = useState(seat === table.heroSeat)
  const [makeButton, setMakeButton] = useState(seat === table.buttonSeat)
  const recentPlayers = [...savedPlayers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
  const choosePlayer = (player: Player) => { setPlayerId(player.id); setName(player.name); setTags(player.tags); setNote(player.note); setMakeHero(false) }
  const toggleTag = (tag: string) => setTags(currentTags => currentTags.includes(tag) ? currentTags.filter(item => item !== tag) : [...currentTags, tag])

  return <div className="seat-editor-backdrop" onMouseDown={onClose}>
    <div className="seat-editor" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${seat}番席のプレイヤー`}>
      <div className="seat-editor-grip" />
      <div className="seat-editor-head"><div><span>SEAT {seat} · {tablePositionFor(table, seat) || '空席'}</span><h3>{current || seat === table.heroSeat ? '席の情報を編集' : '途中参加を追加'}</h3></div><button className="icon-button" onClick={onClose} aria-label="閉じる"><X size={20} /></button></div>
      {recentPlayers.length > 0 && <div className="saved-player-picker"><span>保存済みから選ぶ</span><div>{recentPlayers.map(player => <button key={player.id} onClick={() => choosePlayer(player)} className={playerId === player.id ? 'active' : ''}><UserRound size={14} /> {player.name}</button>)}</div></div>}
      <form onSubmit={event => { event.preventDefault(); const cleanName = name.trim() || (makeHero ? '自分' : ''); if (!cleanName) return; onSave({ seat, playerId: playerId || undefined, name: cleanName, stackBb: stack === '' ? undefined : Math.max(0, Number(stack)), tags, note: note.trim() }, makeHero, makeButton) }}>
        <div className="seat-editor-row"><label className="field">名前・仮名<input required={!makeHero} value={name} maxLength={120} onChange={event => { setName(event.target.value); if (event.target.value !== '自分') setMakeHero(false) }} placeholder="例: Michael" /></label><label className="field">スタック（BB）<input inputMode="decimal" type="number" min="0" step="0.5" value={stack} onChange={event => setStack(event.target.value)} placeholder="例: 166" /></label></div>
        <div className="seat-role-buttons"><button type="button" className={makeHero ? 'active hero' : ''} onClick={() => { setMakeHero(value => !value); if (!makeHero && !name) setName('自分') }}><UserRound size={16} /> 自分の席</button><button type="button" className={makeButton ? 'active dealer' : ''} onClick={() => setMakeButton(value => !value)}><span>D</span> BTNをここへ</button></div>
        <div className="tag-picker"><span>特徴タグ</span><div>{tagChoices.map(tag => <button type="button" key={tag} className={tags.includes(tag) ? 'active' : ''} onClick={() => toggleTag(tag)}>{tags.includes(tag) && <Check size={12} />}{tag}</button>)}</div></div>
        <label className="field full">特徴・テル・攻略メモ<textarea rows={4} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="例: リバーの大きいベットは強め。BTNから広くオープン。" /></label>
        <div className="seat-editor-actions">{current && seat !== table.heroSeat && <button type="button" className="delete-button" onClick={onClear}><Trash2 size={16} /> 退席にする</button>}<button type="submit" className="primary-button"><Check size={17} /> 席に保存</button></div>
      </form>
      <p className="seat-save-hint">相手の情報はプレイヤーメモにも保存され、次のセッションで呼び出せます。{venue && ` · ${venue}`}</p>
    </div>
  </div>
}
