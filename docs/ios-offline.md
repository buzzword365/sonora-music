# Sonora native iPhone music storage (experimental)

## Architecture

The iOS app uses a Capacitor 8 Swift plugin (SonoraMusicPlugin.swift) to open the native Files document picker and copy music directly into app-private Documents/SonoraAudio. Audio bytes do not pass through the JavaScript bridge or get newly stored as large IndexedDB blobs.

The plugin supports MP3, AAC, M4A, WAV, FLAC, OGG, Opus, AIFF and MP4 audio extensions, subject to the iOS decoder's actual supported formats. It reads available metadata and embedded cover art, keeps a small adjacent JSON sidecar for the original filename and metadata, and uses a random UUID for stored audio filenames.

The React interface keeps favourites, playlists, play counts and metadata edits in IndexedDB. On startup, Sonora enumerates native files, restoring missing metadata rows without losing existing user edits. Clearing WebKit storage could still erase preferences and playlists even though the private audio copies remain; a cross-store metadata backup is future work.

To play an imported file, Sonora requests a fresh native file URL and passes it through Capacitor.convertFileSrc, which maps the private file to a WebKit-accessible local source. It does not require a network connection.

## User experience

- Add music on an iPhone opens Apple's Files picker for multiple audio files.
- Imported songs appear in All Songs with available tags and album artwork.
- Re-importing a file with the same original name and size is skipped. A future update may use a content hash for stronger duplicate detection.
- Remove Song deletes Sonora's private copy, not the original in the Files provider.
- Uninstalling the app removes its private stored music. Keep the original files in a separate backup.
- Existing legacy IndexedDB-imported tracks remain readable but are not automatically migrated.

## Simulator verification

A synthetic five-second tagged MP3 was copied to the private Documents/SonoraAudio folder inside the iPhone 17 Pro Simulator. A temporary debug-only Swift probe, removed before the final build, verified:

1. Capacitor registered the SonoraMusic bridge.
2. The native file list discovered one file with its correct title and original filename.
3. Native file resolution produced a local URL.
4. A WebKit range request returned HTTP 206 with 128 bytes.
5. An HTML audio element loaded metadata and reported approximately 5.04 seconds of duration.
6. The app was rebuilt and relaunched and still showed a music-containing library.

No personal audio was used. Selecting and importing a file through the Files picker, interrupted imports, very large libraries, low-storage conditions, real-device playback, screen-lock continuity and background playback remain UNVERIFIED.

## Audio and security

UIBackgroundModes audio and the AVAudioSession playback category have been configured, but these alone do not guarantee that WebKit's audio continues while suspended. The plugin confines file operations to the app-private audio folder, checks allowed audio extensions, and uses security-scoped access to selected files when provided. Private copies use file protection until first user authentication to permit access after unlocking.

A valid Apple signing identity and explicit physical-device authorisation would be required for personal iPhone installation. This work does not include App Store deployment, device pairing or credential changes.


## Simulator UI regression coverage — 31 October 2026

An iOS UI-testing target (`SonoraUITests`) is included in the shared Xcode
`App` scheme. It launches the actual Sonora iPhone app, taps **Add music**,
verifies Apple's native Files picker exposes **Cancel**, and dismisses the
picker back to Sonora. This exercises the real picker presentation and
cancellation path; it does **not** test selecting an external file provider
or returning a selected file to the plugin.

Run in a booted iOS Simulator:

```sh
npm run ios:sync
xcodebuild test -project ios/App/App.xcodeproj -scheme App \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_UDID' \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO
```

A post-restart issue in duplicate detection was also fixed: the original
filename is now read correctly from sidecars containing both an original
filename and cached metadata. Imports with the same original filename and
file size are skipped across launches. Native audio copies are marked
excluded from iCloud device backups because originals must be kept outside
Sonora. No audio files or signing material are added to Git.

Still unverified: picking and importing a song end-to-end through Files,
large imports under storage pressure, locked-screen playback, system
interruptions and physical-device audio.
