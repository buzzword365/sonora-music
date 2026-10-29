/** Create deterministic, synthetic tracks in the isolated Electron test profile.
 * No user's music, filesystem index, artwork, or personal metadata are used.
 */
export async function seedArtistFixture(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('sonora-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const cover = await new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 24;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#b790de';
      ctx.fillRect(0, 0, 24, 24);
      ctx.fillStyle = '#48529b';
      ctx.fillRect(6, 6, 12, 12);
      canvas.toBlob(resolve, 'image/png');
    });
    if (!cover) throw new Error('Unable to create synthetic cover art');
    const tx = db.transaction('tracks', 'readwrite');
    for (let i = 0; i < 22; i++) {
      const artist = i < 15 ? 'Alex G' : i < 21 ? 'alexgoffline' : 'Alex G, Example Collaborator';
      tx.objectStore('tracks').put({
        id: `fixture-${i}`, title: `Fixture track ${String(i + 1).padStart(2, '0')}`,
        artist, album: 'Synthetic test album', duration: 20,
        size: 0, filename: `fixture-${i}.wav`, fingerprint: `fixture-${i}`,
        addedAt: 22 - i, liked: false, mime: 'audio/wav', cover,
      });
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.locator('.app').waitFor();
}
