import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Music2, X } from 'lucide-react';
import type { Track } from './store';
import { matchesLibrarySearch } from './librarySearch';
import './playlist-editor.css';

type Props = {
  mode: 'create' | 'rename' | 'edit';
  initialName: string;
  initialIds: string[];
  tracks: Track[];
  coverUrls: Record<string, string>;
  ready: boolean;
  onSave: (name: string, ids: string[]) => Promise<void>;
  onClose: () => void;
};
export default function PlaylistEditor({mode, initialName, initialIds, tracks, coverUrls, ready, onSave, onClose}: Props) {
  const [name, setName] = useState(initialName);
  const [ids, setIds] = useState(() => [...new Set(initialIds)]);
  const [query, setQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const closeRef = useRef(onClose);
  const dragRef = useRef<null | {pointerId: number; startIndex: number; startX: number; startY: number; adding: boolean; baseline: string[]; lastIndex: number; active: boolean}>(null);
  const suppressDragClickRef = useRef(false);
  closeRef.current = onClose;
  const trackMap = useMemo(() => new Map(tracks.map(track => [track.id, track])), [tracks]);
  const selected = useMemo(() => new Set(ids), [ids]);
  const selectedTracks = ids.flatMap(id => { const track = trackMap.get(id); return track ? [track] : []; });
  const matches = (track: Track) => matchesLibrarySearch(track, query);
  const visible = (selectedOnly ? selectedTracks : tracks).filter(matches);
  const title = mode === 'create' ? 'Create playlist' : mode === 'rename' ? 'Rename playlist' : 'Edit playlist';
  const startDrag = (event: React.PointerEvent<HTMLDivElement>, index: number) => {
    // Normal clicks remain native checkbox/label interactions; only a deliberate drag paints a range.
    if (event.button !== 0 || event.pointerType === 'touch' || selectedOnly || saving) return;
    suppressDragClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId, startIndex: index, startX: event.clientX, startY: event.clientY,
      adding: !selected.has(visible[index].id), baseline: ids, lastIndex: -1, active: false,
    };
  };
  const paintDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || selectedOnly || saving) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7) return;
    if (!drag.active) {
      drag.active = true;
      suppressDragClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const row = element?.closest<HTMLElement>('.playlist-picker-row');
    if (!row || !event.currentTarget.contains(row)) return;
    const endIndex = Number(row.dataset.index);
    if (!Number.isInteger(endIndex) || endIndex < 0 || endIndex >= visible.length || endIndex === drag.lastIndex) return;
    drag.lastIndex = endIndex;
    const next = new Set(drag.baseline);
    for (let i = Math.min(drag.startIndex, endIndex); i <= Math.max(drag.startIndex, endIndex); i++) {
      if (drag.adding) next.add(visible[i].id);
      else next.delete(visible[i].id);
    }
    setIds([...next]);
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    form.current?.querySelector<HTMLInputElement>('input')?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      if (!savingRef.current) closeRef.current();
    };
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('keydown', escape, true);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    if (!saving && form.current && !form.current.contains(document.activeElement))
      form.current.querySelector<HTMLInputElement>('input')?.focus();
  }, [saving]);
  const close = () => { if (!savingRef.current) onClose(); };
  const toggle = (id: string) => setIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  const move = (id: string, offset: number) => setIds(previous => {
    const next = previous.slice(), from = next.indexOf(id), to = from + offset;
    if (from < 0 || to < 0 || to >= next.length) return previous;
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
  const save = async () => {
    if (savingRef.current || !ready) return;
    if (!name.trim()) { setError('Enter a playlist name.'); return; }
    savingRef.current = true; setSaving(true); setError('');
    try { await onSave(name.trim(), ids); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save playlist. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <form ref={form} className={'edit-dialog playlist-editor ' + (mode === 'rename' ? 'playlist-rename' : '')}
      role="dialog" aria-modal="true" aria-labelledby="playlist-editor-title" aria-busy={saving}
      onSubmit={event => { event.preventDefault(); void save(); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === 'Tab') {
          const elements = [...(form.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || [])];
          const first = elements[0], last = elements[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <div className="dialog-top"><h2 id="playlist-editor-title">{title}</h2><button type="button" className="icon-btn" aria-label="Close playlist editor" disabled={saving} onClick={close}><X size={20}/></button></div>
      <label className="dialog-label" htmlFor="playlist-name">Playlist name</label>
      <input id="playlist-name" maxLength={120} disabled={saving} value={name} onChange={event => { setName(event.target.value); setError(''); }} placeholder="Name your playlist" />
      {mode !== 'rename' && <>
        <p className="dialog-hint">Choose songs already in your library. Your selections stay checked while you search.</p>
        <label className="dialog-label" htmlFor="playlist-search">Search library</label>
        <input id="playlist-search" type="search" disabled={saving} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); } }} placeholder="Song, artist or album" />
        <div className="playlist-picker-toolbar">
          <div className="playlist-picker-views" aria-label="Song view">
            <button type="button" disabled={saving} aria-pressed={!selectedOnly} onClick={() => setSelectedOnly(false)}>Library</button>
            <button type="button" disabled={saving} aria-pressed={selectedOnly} onClick={() => setSelectedOnly(true)}>Selected songs ({selectedTracks.length})</button>
          </div>
          {!selectedOnly && <button type="button" className="text-button" disabled={saving || !visible.length || visible.every(track => selected.has(track.id))}
            onClick={() => setIds(previous => [...new Set([...previous, ...visible.map(track => track.id)])])}>Select all results</button>}
        </div>
        {!selectedOnly && <p className="dialog-hint playlist-drag-hint">Tip: drag across songs to select or deselect multiple tracks.</p>}
        <p className="dialog-hint" role="status">{visible.length} songs {selectedOnly ? 'in this selection' : 'found in your library'}</p>
        <div className="playlist-picker-list" aria-label={selectedOnly ? 'Selected songs' : 'Library songs'}
          onPointerMove={paintDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          onClickCapture={event => { if (suppressDragClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressDragClickRef.current = false; } }}
          onDragStart={event => event.preventDefault()}>
          {!ready ? <p className="dialog-hint" role="status">Loading your library…</p> : !tracks.length ? <p className="dialog-hint">Your library is empty. You can save an empty playlist now, then use Add music to import songs.</p> : !visible.length ? <p className="dialog-hint">{query ? 'No songs match your search.' : 'No songs selected. Choose songs from Library.'}</p> :
          visible.map((track, index) => <div className="playlist-picker-row" key={track.id} data-index={index}
            onPointerDown={event => startDrag(event, index)}>
            <label className="playlist-picker-song">
              <input type="checkbox" disabled={saving} checked={selected.has(track.id)} onChange={() => toggle(track.id)} aria-label={'Include ' + track.title + ' by ' + track.artist}/>
              <span className="playlist-picker-cover" aria-hidden="true">{coverUrls[track.id] ? <img src={coverUrls[track.id]} alt="" loading="lazy" /> : <Music2 size={18} strokeWidth={1.5} />}</span>
              <span className="playlist-picker-details"><strong>{track.title}</strong><small>{track.artist} · {track.album}</small></span>
            </label>
            {selectedOnly && <div className="playlist-picker-order">
              <button type="button" className="icon-btn" aria-label={'Move ' + track.title + ' up'} disabled={saving || ids.indexOf(track.id) === 0} onClick={() => move(track.id, -1)}><ArrowUp size={16}/></button>
              <button type="button" className="icon-btn" aria-label={'Move ' + track.title + ' down'} disabled={saving || ids.indexOf(track.id) === ids.length - 1} onClick={() => move(track.id, 1)}><ArrowDown size={16}/></button>
            </div>}
          </div>)}
        </div>
        <p className="dialog-hint" role="status">{selectedTracks.length} selected · Use Selected songs to reorder. Uncheck to remove.</p>
      </>}
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="outline-button" disabled={saving} onClick={close}>Cancel</button><button type="submit" className="play-all" disabled={saving || !ready}>{saving ? 'Saving…' : mode === 'create' ? 'Create playlist' : 'Save changes'}</button></div>
    </form>
  </div>;
}
