# Experimental Sonora native notch helper

This folder is an **uncompiled development experiment**, not the installed
Sonora notch player. It demonstrates how Boring.Notch's native macOS panel
and animated notch shape might work with Sonora's playback state.

## Source, attribution and licensing

- `BoringNotchWindow.swift` is adapted from [Boring.Notch](https://github.com/TheBoredTeam/boring.notch),
  originally by Harsh Vardhan Goswami and contributors.
- `NotchShape.swift` is adapted from Boring.Notch's `components/Notch/NotchShape.swift`.
  Its source also credits Kai Azim's
  [DynamicNotchKit](https://github.com/MrKai77/DynamicNotchKit).
- These files are **GPL-3.0**, with licence text in `COPYING`.
- `SonoraNativeNotch.swift` is a new experimental integration around these
  components. Treat the combined native helper as **GPL-3.0** when
  distributing it. Sonora's existing MIT-licensed Electron source and release
  are separate and unchanged by this branch.
- Do not copy this helper into the shipped Sonora application or redistribute
  a combined derivative until the project's overall licensing has been
  reviewed and compatible source distribution arranged.

## Prototype scope

The helper uses a non-activating AppKit panel and SwiftUI. It provides:

- Native notch shape and non-focus-stealing panel behaviour
- Two visual layouts, compact and expanded on hover
- Song title, artist, progress display and three playback buttons
- A JSON-lines input/output design to eventually communicate with Sonora

The helper **does not yet** connect to Electron's playback events, display
real album artwork, seek audio, or launch automatically from Sonora. It has
not been built or run on the user's Mac.

## Local development

Once Mac command access is available, compile only as an independent
experiment. A possible initial command (subject to compilation fixes and
review) is:

```bash
cd native/boring-notch-helper
swiftc -o sonora-native-notch \
  BoringNotchWindow.swift NotchShape.swift SonoraNativeNotch.swift \
  -framework AppKit -framework SwiftUI
```

If compilation succeeds, a separate process will eventually need to keep
stdin open and pass the current playback state as JSON:

```json
{"title":"Example Song","artist":"Example Artist","playing":true,"duration":180,"position":42}
```

The helper emits `{"action":"toggle"}`, `{"action":"next"}`, or
`{"action":"previous"}` on stdout when the corresponding control is tapped.
A secure Electron main-process bridge, lifecycle manager, and quit/fallback
behaviour must be implemented **before** enabling it in Sonora.

## Acceptance gates

1. Verify Swift build without compiler warnings or unexpected permissions.
2. Verify hover and cursor tracking on the internal MacBook display.
3. Verify window position and both actual notch sizes at different scales.
4. Verify actions, artwork and progress against Sonora's real audio engine.
5. Verify non-focus-stealing behaviour, full-screen Spaces and Reduce Motion.
6. Run all Sonora existing regressions and package a test-only build.
7. Review GPL-3.0 obligations before merging into public `main`.
8. Preserve original music files, installed application and user settings.

The public production release must continue to use the existing Electron
notch until these checks pass.
