# Release checklist

Release from a known commit, not a leftover generated folder.

- [ ] Record the exact Git commit, version, changelog and intended platform.
- [ ] Review uncommitted changes; preserve any unrelated work.
- [ ] Pass npm ci, npm run check, npm run build, and relevant synthetic-data tests.
- [ ] Test local import, playlist persistence, playback, media keys and app relaunch.
- [ ] Test fullscreen/Spaces, notch/mini-player focus, Dock and window controls on an actual Mac.
- [ ] For iPhone, separately verify device installation, offline file import, background playback and lock-screen behavior.
- [ ] Inspect the release artifact for personal audio, credentials and local runtime data.
- [ ] Confirm third-party notices, license, checksums, version and known limitations.
- [ ] Before mainstream macOS distribution, verify Developer ID signature, hardened runtime and Apple notarisation.
- [ ] Publish accurate release notes and tested platform details.

As of 2 November 2026 the installed 0.3.0 app is ad-hoc signed, without a Team ID. Do not represent it as notarised. Local source syntax/build checks and three notch/native-policy unit tests passed, but this is not full release QA.
