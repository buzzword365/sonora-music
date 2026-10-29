import type { Track } from './store';

const searchKey = (value: string) => value.normalize('NFKD')
  .replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function matchesLibrarySearch(track: Track, query: string): boolean {
  const key = searchKey(query);
  return !key || [track.title, track.artist, track.album].some(value => searchKey(value).includes(key));
}
