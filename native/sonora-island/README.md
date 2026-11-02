# Sonora native island helper (macOS)

This is the source for Sonora's independent, nonactivating macOS notch music panel. It is compiled locally from `IslandHelper.swift` using:

```sh
npm run native:island
```

The resulting `sonora-island-helper` is a generated arm64/macOS executable, not committed to GitHub. `npm run pack:mac` and `npm run app:mac` compile it before electron-builder packages the app. The helper receives newline-delimited JSON playback state from Electron over standard input and sends control actions over standard output. It is designed not to activate the main window or change macOS Spaces.

The normal Electron notch fallback stays hidden during a native fullscreen transition, preventing an auxiliary window from stealing focus.
