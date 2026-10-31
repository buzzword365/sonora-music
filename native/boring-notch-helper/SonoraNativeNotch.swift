import AppKit
import SwiftUI

// Sonora experiment: a native macOS panel built around Boring.Notch's
// GPLv3-licensed BoringNotchWindow and NotchShape components.
// Input: one JSON object per line from stdin. Output: action JSON per line
// on stdout. No music files, libraries, or tokens are opened by this helper.
struct SongState: Decodable {
    var title: String
    var artist: String
    var playing: Bool
    var duration: Double
    var position: Double
}

@MainActor
final class NotchModel: ObservableObject {
    @Published var title = "Nothing playing"
    @Published var artist = "Sonora"
    @Published var playing = false
    @Published var duration = 0.0
    @Published var position = 0.0

    func update(_ state: SongState) {
        title = String(state.title.prefix(180))
        artist = String(state.artist.prefix(120))
        playing = state.playing
        duration = max(0, state.duration.isFinite ? state.duration : 0)
        position = max(0, state.position.isFinite ? state.position : 0)
    }
}

@MainActor
func sendAction(_ name: String, position: Double? = nil) {
    var payload: [String: Any] = ["action": name]
    if let position { payload["position"] = position }
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let text = String(data: data, encoding: .utf8) else { return }
    print(text)
    fflush(stdout)
}

struct NativeNotchPlayer: View {
    @ObservedObject var model: NotchModel
    @State private var expanded = false

    private var progress: Double {
        guard model.duration > 0 else { return 0 }
        return min(max(model.position / model.duration, 0), 1)
    }

    private func timeLabel(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.isFinite ? seconds : 0))
        return "\(total / 60):" + String(format: "%02d", total % 60)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 13)
                    .fill(.white.opacity(0.12))
                    .overlay(Image(systemName: "music.note").foregroundStyle(.white.opacity(0.8)))
                    .frame(width: expanded ? 76 : 56, height: expanded ? 76 : 56)
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white).lineLimit(1)
                    Text(model.artist)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.58)).lineLimit(1)
                    if !expanded {
                        controls
                    }
                }
                Spacer(minLength: 0)
                if expanded {
                    Image(systemName: "waveform")
                        .foregroundStyle(.white.opacity(model.playing ? 0.9 : 0.35))
                }
            }
            if expanded {
                HStack(spacing: 10) {
                    Text(timeLabel(model.position))
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.white.opacity(0.20))
                            Capsule().fill(.white.opacity(0.9))
                                .frame(width: proxy.size.width * progress)
                        }
                    }.frame(height: 5)
                    Text("-" + timeLabel(max(0, model.duration - model.position)))
                }
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.6))
                controls
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding(.horizontal, expanded ? 24 : 16)
        .padding(.vertical, expanded ? 21 : 15)
        .frame(width: expanded ? 490 : 350, height: expanded ? 215 : 116)
        .background {
            NotchShape(topCornerRadius: 18, bottomCornerRadius: 30)
                .fill(Color.black)
        }
        .onHover { isHovering in
            withAnimation(.spring(response: 0.34, dampingFraction: 0.83)) {
                expanded = isHovering
            }
        }
        .accessibilityLabel("Sonora native notch music player")
    }

    private var controls: some View {
        HStack(spacing: expanded ? 31 : 18) {
            control("backward.end.fill", name: "previous")
            control(model.playing ? "pause.fill" : "play.fill", name: "toggle")
            control("forward.end.fill", name: "next")
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }

    private func control(_ symbol: String, name: String) -> some View {
        Button { sendAction(name) } label: {
            Image(systemName: symbol)
                .font(.system(size: name == "toggle" ? 21 : 15, weight: .semibold))
                .frame(width: name == "toggle" ? 34 : 28, height: 30)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(name)
    }
}

@MainActor
final class NativeNotchApp: NSObject, NSApplicationDelegate {
    private let model = NotchModel()
    private var panel: BoringNotchWindow?
    private var mouseTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        guard let screen = NSScreen.main else { return }
        let size = CGSize(width: 490, height: 215)
        let x = screen.frame.midX - size.width / 2
        let y = screen.frame.maxY - size.height
        let panel = BoringNotchWindow(
            contentRect: CGRect(origin: CGPoint(x: x, y: y), size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered, defer: false
        )
        panel.contentView = NSHostingView(rootView: NativeNotchPlayer(model: model))
        panel.orderOut(nil)
        self.panel = panel
        mouseTimer = Timer.scheduledTimer(withTimeInterval: 0.16, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.checkHover() }
        }
        // Keep stdin reading off the UI thread.
        DispatchQueue.global(qos: .utility).async { [weak self] in
            while let line = readLine() {
                guard let data = line.data(using: .utf8),
                      let state = try? JSONDecoder().decode(SongState.self, from: data) else { continue }
                DispatchQueue.main.async { self?.model.update(state) }
            }
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }

    private func checkHover() {
        guard let panel, let screen = NSScreen.main else { return }
        let mouse = NSEvent.mouseLocation
        let notchZone = CGRect(x: screen.frame.midX - 110,
                               y: screen.frame.maxY - 42, width: 220, height: 42)
        let nearby = panel.frame.insetBy(dx: -8, dy: -8).contains(mouse)
        if notchZone.contains(mouse) || (panel.isVisible && nearby) {
            if !panel.isVisible { panel.orderFrontRegardless() }
        } else if panel.isVisible {
            panel.orderOut(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        mouseTimer?.invalidate()
    }
}

@main
struct SonoraNativeNotch {
    static func main() {
        let app = NSApplication.shared
        let delegate = NativeNotchApp()
        app.delegate = delegate
        app.run()
    }
}
