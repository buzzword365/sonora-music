import { createHash } from 'node:crypto';

// Coalesces progress updates while the native helper's pipe is saturated.
// Full artwork is sent only on song/artwork changes or after recovery.
export function createNativeIslandSender(stream) {
  let lastKey = '';
  let lastArtworkKey = '';
  let blocked = false;
  let pending = null;
  let disposed = false;

  function write(state, force = false) {
    if (disposed || !stream?.writable || stream.destroyed) return false;
    const artHash = state.artwork ? createHash('sha1').update(state.artwork).digest('hex') : '';
    const artKey = String(state.trackId || '') + '|' + artHash;
    const key = [
      state.trackId, state.title, state.artist, state.playing,
      state.hasTrack, state.position, state.duration, artKey
    ].join('|');

    if (blocked) {
      pending = { state, force: true };
      return false;
    }
    if (!force && key === lastKey) return true;

    const payload = { ...state };
    if (!force && artKey === lastArtworkKey) delete payload.artwork;
    try {
      const accepted = stream.write(JSON.stringify(payload) + '\n');
      lastKey = key;
      lastArtworkKey = artKey;
      blocked = !accepted;
      return true;
    } catch {
      // The child may exit between checking writable and calling write.
      blocked = false;
      pending = null;
      return false;
    }
  }

  function onDrain() {
    if (disposed) return;
    blocked = false;
    const mostRecent = pending;
    pending = null;
    if (mostRecent) write(mostRecent.state, true);
  }
  stream.on('drain', onDrain);
  return {
    write,
    close() {
      disposed = true;
      pending = null;
      stream.off('drain', onDrain);
    }
  };
}
