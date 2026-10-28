# Sonora Music

An independent macOS music player for your own local music collection, featuring dynamic album-art colour themes, a light/dark appearance studio, music-library management, media controls, and an optional local-network phone companion.

**Version 0.2.0 — More colourful Light mode (28 October 2026)**

## What's new

Sonora extracts a palette from your current song's embedded cover artwork and applies it throughout the app, including the sidebar, background, player, settings, and queue.

In **Settings → Appearance** you can choose:

- **Automatic** — let the artwork decide whether its theme is light or dark.
- **Light** — use vibrant, coordinated pastel album colours, with noticeably different shades for the background, sidebar, cards, controls, and player. Black covers now take their accent from the illustration instead of accidentally picking a near-black pixel's hue.
- **Dark** — use deeper, artwork-tinted surfaces with lighter matching controls.

Switches animate smoothly (650 ms); the macOS reduced-motion setting is respected. Your selection is saved between launches. Missing or monochrome artwork has an accessible fallback. All colour analysis happens **on the device**.

### Other features

- Local-folder library scanning for MP3, M4A/AAC, WAV, FLAC, OGG and other supported formats; music stays in its original folder.
- Search, favourites, playlists, queue reordering and metadata edits.
- Play/pause, skip, keyboard and native macOS media controls.
- Equaliser presets, adjustable crossfade and a lyrics interface when available.
- Optional phone companion over your local Wi-Fi, including PS5 Gaming Remote controls for music played on the Mac (not PS5 music playback).
- No commercial streaming catalogue or music downloads.

## Install and run

The app targets Apple Silicon macOS and is **unsigned and not notarised**. Download the packaged app from [GitHub Releases](https://github.com/buzzword365/sonora-music/releases), unzip it and open **Sonora Music.app**. macOS may require a manual approval in Privacy & Security.

Back up your previous app before replacing it. Sonora stores its library, playlists and settings in your user's application-data directory rather than inside the app bundle. Keep your original music files in place.

## Build from source

The editable **React + TypeScript source is included** in this repository (unlike the initial public release).

Prerequisites: Node.js 24+, npm, macOS and the usual Apple build tools.

```sh
git clone https://github.com/buzzword365/sonora-music.git
cd sonora-music
npm ci
npm run dev             # Vite UI development server
npm run build           # Type-check and compile the renderer
npm run check           # Check native Electron scripts
npm run test:palette    # Colour and accessibility regression tests
npm run pack:mac        # Package the macOS app
```

Run `npm start` to open the built Electron desktop app, or `npm run desktop:dev` alongside `npm run dev` to work on the UI. An optional isolated-profile Electron UI test can be run with `npm run test:e2e`; it uses synthetic fixture tracks and tests the theme transitions and persistence.

## Source layout

| Path | Role |
|---|---|
| `src/artworkTheme.ts` | Album-art sampling, colour clustering, light/dark palettes and contrast adjustment |
| `src/artwork-theme.css` | Component colours, transitions and illustrated appearance selector |
| `src/App.tsx` | App interface, settings and playback |
| `src/store.ts` | On-device music metadata and preferences |
| `src/audioMixer.ts` | Audio mixing, equaliser and crossfading |
| `electron/` | Native desktop host, secure media access, local phone companion |
| `tests/` | Pure palette tests and isolated Electron UI regression |
| `dist/` | Precompiled renderer for convenience |

## Privacy and distribution

No personal tracks, album-cover collections, listening history, playlists, account tokens, music-folder indexes, or runtime phone pairing credentials are checked in. The phone companion uses your local network and should only be paired on a network you trust; it is not a remote internet music service. Source files are editable under the repository's MIT licence, subject to third-party notices in [THIRD_PARTY.md](THIRD_PARTY.md).

Sonora is an independent personal project, not an official Apple Music or Spotify application.
