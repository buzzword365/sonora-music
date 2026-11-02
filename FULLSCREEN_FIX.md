# macOS native fullscreen fix — 2 November 2026

This source branch packages the fullscreen behaviour installed and restarted on the user's Mac. The previous main window explicitly set `fullscreenable:false`, making the green traffic-light button zoom rather than entering a dedicated macOS fullscreen Space.

The main window now has `fullscreenable:true` and a bounded focus-transition guard. While macOS animates a fullscreen Space change, Sonora will not show or refocus its main window due to a secondary activate event, and the legacy Electron notch fallback will not spawn or reappear. The native Swift accessory panel stays independently available. When leaving fullscreen, the Electron fallback can recover without pulling the user into another Space.

## Build and tests

```sh
npm ci
npm run check
npm run test:fullscreen
npm run build
npm run pack:mac
```

On macOS, `pack:mac` compiles the Swift helper from source, ad-hoc signs the output for local use, and includes it as `Contents/Resources/sonora-island-helper`. Do not commit the helper binary, music files, caches, local user profiles or generated application packages.

The source and build have been checked, including bundled Electron resource verification and Swift helper protocol self-test. **Interactive fullscreen Space switching was not automated on the user's live desktop** because that would interrupt their screen; it remains a manual acceptance step.
