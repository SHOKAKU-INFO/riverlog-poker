import { useMemo, useState } from 'react'
import { Check, ChevronRight, RotateCw, Trash2, UserRound, X } from 'lucide-react'
import { defaultPokerTable, nextPokerHand, tablePosition, type Player, type PokerTableState, type Session, type TablePlayer, type TableSeatCount } from './domain'

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
  const seated = useMemo(() => new Map(table.players.map(player => [player.seat, player])), [table.players])
  const updateTable = (next: PokerTableState, message?: string) => onChange({ ...session, table: next, updatedAt: new Date().toISOString() }, message)
  const changeSeatCount = (seatCount: TableSeatCount) => updateTable({
    ...table,
    seatCount,
    heroSeat: Math.min(table.heroSeat, seatCount),
    buttonSeat: Math.min(table.buttonSeat, seatCount),
    players: table.players.filter(player => player.seat <= seatCount),
  })

  return <section className="table-notes">
    <div className="table-notes-head">
      <div><span>LIVE TABLE NOTES</span><h3>テーブルメモ</h3><p>席をタップして相手を記録</p></div>
      <div className="table-size-picker" aria-label="テーブル人数">
        {([6, 8, 9] as TableSeatCount[]).map(count => <button key={count} className={table.seatCount === count ? 'active' : ''} onClick={() => changeSeatCount(count)}>{count}人</button>)}
      </div>
    </div>

    <div className="poker-table-stage">
      <div className="poker-felt"><div className="felt-center"><span>HAND</span><strong>#{table.handNumber}</strong><small>{session.stakes || 'RIVERLOG'}</small></div></div>
      {Array.from({ length: table.seatCount }, (_, index) => {
        const seat = index + 1
        const angle = -Math.PI / 2 + index / table.seatCount * Math.PI * 2
        const player = seated.get(seat)
        const position = tablePosition(seat, table.buttonSeat, table.seatCount)
        return <button
          key={seat}
          className={`poker-seat ${player ? 'occupied' : ''} ${seat === table.heroSeat ? 'hero' : ''}`}
          style={{ left: `${50 + Math.cos(angle) * 42}%`, top: `${50 + Math.sin(angle) * 39}%` }}
          onClick={() => setEditingSeat(seat)}
          aria-label={`${seat}番席 ${position} ${player?.name || '空席'}`}
        >
          {position === 'BTN' && <i className="dealer-chip">D</i>}
          <span className="seat-position">{position}</span>
          <strong>{player?.name || (seat === table.heroSeat ? '自分' : `${seat}番席`)}</strong>
          <small>{player?.stackBb !== undefined ? `${player.stackBb} BB` : player ? 'スタック未入力' : 'タップして追加'}</small>
        </button>
      })}
    </div>

    <button className="next-hand-button" onClick={() => updateTable(nextPokerHand(table), `ハンド #${table.handNumber + 1}へ進みました`)}>
      <span><RotateCw size={21} /></span><span><small>BUTTON & POSITIONS</small><strong>次のハンド</strong></span><ChevronRight size={20} />
    </button>
    <p className="table-help">全員のメモと席はそのまま、ディーラーボタンとポジションだけを1席進めます。</p>

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
        const players = [...table.players.filter(item => item.seat !== editingSeat), seatedPlayer]
        updateTable({ ...table, players, heroSeat: makeHero ? editingSeat : table.heroSeat, buttonSeat: makeButton ? editingSeat : table.buttonSeat }, `${editingSeat}番席を保存しました`)
        if (playerId) onSavePlayer({ id: playerId, name: player.name, venue: session.venue, tags: player.tags, note: player.note, updatedAt: new Date().toISOString() })
        setEditingSeat(null)
      }}
      onClear={() => { updateTable({ ...table, players: table.players.filter(item => item.seat !== editingSeat) }, `${editingSeat}番席を空席にしました`); setEditingSeat(null) }}
    />}
  </section>
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
      <div className="seat-editor-head"><div><span>SEAT {seat} · {tablePosition(seat, table.buttonSeat, table.seatCount)}</span><h3>{current ? '席の情報を編集' : 'この席にプレイヤーを追加'}</h3></div><button className="icon-button" onClick={onClose} aria-label="閉じる"><X size={20} /></button></div>
      {recentPlayers.length > 0 && <div className="saved-player-picker"><span>保存済みから選ぶ</span><div>{recentPlayers.map(player => <button key={player.id} onClick={() => choosePlayer(player)} className={playerId === player.id ? 'active' : ''}><UserRound size={14} /> {player.name}</button>)}</div></div>}
      <form onSubmit={event => { event.preventDefault(); const cleanName = name.trim() || (makeHero ? '自分' : ''); if (!cleanName) return; onSave({ seat, playerId: playerId || undefined, name: cleanName, stackBb: stack === '' ? undefined : Math.max(0, Number(stack)), tags, note: note.trim() }, makeHero, makeButton) }}>
        <div className="seat-editor-row"><label className="field">名前・仮名<input required={!makeHero} value={name} maxLength={120} onChange={event => { setName(event.target.value); if (event.target.value !== '自分') setMakeHero(false) }} placeholder="例: Michael" /></label><label className="field">スタック（BB）<input inputMode="decimal" type="number" min="0" step="0.5" value={stack} onChange={event => setStack(event.target.value)} placeholder="例: 166" /></label></div>
        <div className="seat-role-buttons"><button type="button" className={makeHero ? 'active hero' : ''} onClick={() => { setMakeHero(value => !value); if (!makeHero && !name) setName('自分') }}><UserRound size={16} /> 自分の席</button><button type="button" className={makeButton ? 'active dealer' : ''} onClick={() => setMakeButton(value => !value)}><span>D</span> BTNをここへ</button></div>
        <div className="tag-picker"><span>特徴タグ</span><div>{tagChoices.map(tag => <button type="button" key={tag} className={tags.includes(tag) ? 'active' : ''} onClick={() => toggleTag(tag)}>{tags.includes(tag) && <Check size={12} />}{tag}</button>)}</div></div>
        <label className="field full">特徴・テル・攻略メモ<textarea rows={4} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="例: リバーの大きいベットは強め。BTNから広くオープン。" /></label>
        <div className="seat-editor-actions">{current && <button type="button" className="delete-button" onClick={onClear}><Trash2 size={16} /> 空席にする</button>}<button type="submit" className="primary-button"><Check size={17} /> 席に保存</button></div>
      </form>
      <p className="seat-save-hint">相手の情報はプレイヤーメモにも保存され、次のセッションで呼び出せます。{venue && ` · ${venue}`}</p>
    </div>
  </div>
}
