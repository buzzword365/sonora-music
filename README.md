# Sonora Music

A macOS music player for your own local audio collection, with an expressive desktop interface, smart library scanning, media-key controls, and an optional phone companion.

**Public-source edition.** This repository was reconstructed from the installed Sonora desktop application. Electron's main process, preload bridge, LAN server, and phone UI are provided as editable source. The React/Vite renderer is included as a **precompiled distribution**, because the original development source (JSX/TSX) was not present in the app package. This isn't a complete React source release.

## Features

- Scans selected folders for your own MP3, AAC, M4A, FLAC, WAV, OGG and other supported audio files.
- Library, queue, playlists, metadata, covers, player controls and keyboard media shortcuts.
- Reads available lyrics from supported local music metadata.
- Optional phone interface on the same LAN, using a QR pairing link.
- Electron macOS desktop application.

**No music, downloaded songs, personal playlists, listening history, or private music library data are included.** Sonora is intended for files you have the rights to use.

## Getting started

Requires macOS, Node.js and npm. Clone this repository and run:

    git clone https://github.com/buzzword365/sonora-music.git
    cd sonora-music
    npm install
    npm start

To compile an unpackaged desktop app directory, run:

    npm run pack:mac

The app is not notarized or signed for distribution. You may need to build and run it locally.

## Project layout

| Directory | Contents |
|---|---|
| electron/main.mjs | Desktop lifecycle, local library, media protocols and playback bridge |
| electron/preload.cjs | Isolated renderer bridge |
| electron/phone-server.mjs | Local network companion and device pairing |
| electron/phone-ui.html | Companion web UI |
| electron/lyrics.mjs | Lyrics extracted from local files |
| dist/ | Built renderer JavaScript, CSS and static assets |

The npm packages used by the app are declared in package.json. Dependency folders and app bundles are intentionally not checked in.

## Privacy and security

- Scanned music folders and library indexes are stored locally at runtime, not in the repository.
- Phone pairing credentials are generated when you run the app and are saved in your computer's application data.
- **The phone server may listen on your local network.** Pair only on a network you trust; don't publicly share the QR code or pairing URL.
- No cloud account, music-streaming password, API token, user email, or personal file path is present in this source release.
- Other than optional connectivity features, the player's core library and playback are local.

The app is a personal project, not an official Apple Music or Spotify client. No copyrighted music catalogue or DRM credentials are distributed.

## Attribution and license

MIT for the original application code. Third-party libraries and components retain their separate copyrights and license terms; see THIRD_PARTY.md.

**Frontend note:** the distribution includes Vite-built React assets rather than the editable React project source.
