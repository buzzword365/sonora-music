// macOS enters/leaves a dedicated fullscreen Space asynchronously.
// During the transition a helper/overlay activation can spuriously fire
// Electron's app "activate" event. Never call show/focus on the main window
// while the OS is moving that same window between Spaces.
export class FullscreenTransitionGuard {
  constructor() {
    this.active = false;
    this.expiresAt = 0;
  }
  begin(now = Date.now()) {
    this.active = true;
    // Failsafe: do not suppress focus forever if macOS fails to emit
    // enter/leave after a cancelled fullscreen transition.
    this.expiresAt = now + 6000;
  }
  end(now = Date.now()) {
    this.active = false;
    this.expiresAt = now + 950;
  }
  suppressesFocus(now = Date.now()) {
    return now < this.expiresAt;
  }
}
