import AppKit
import SwiftUI
import Foundation

// Independent original macOS helper for Sonora.
// Reads playback-state JSON lines from stdin; sends JSON actions on stdout.
// The main app never changes Spaces, focus or Dock activation because of it.
struct MusicPacket: Decodable {
    let title: String
    let artist: String
    let artwork: String?
    let trackId: String?
    let playing: Bool
    let hasTrack: Bool
    let position: Double
    let duration: Double
}
func action(_ name: String, position: Double? = nil) {
    var message: [String:Any] = ["action":name]
    if let position, position.isFinite { message["position"] = position }
    if let data = try? JSONSerialization.data(withJSONObject: message),
       let text = String(data: data, encoding: .utf8) {
        print(text); fflush(stdout)
    }
}

@MainActor final class Model: ObservableObject {
    @Published var title = "Nothing playing"
    @Published var artist = ""
    @Published var artwork: NSImage?
    @Published var playing = false
    @Published var hasTrack = false
    @Published var position = 0.0
    @Published var duration = 0.0
    private var lastArtwork = ""
    private var lastTrackID = ""
    func update(_ state: MusicPacket) {
        if (state.trackId ?? "") != lastTrackID {
            lastTrackID = state.trackId ?? ""
            lastArtwork = ""
            artwork = nil
        }
        let nextTitle = String(state.title.prefix(180))
        let nextArtist = String(state.artist.prefix(120))
        let nextPosition = max(0, state.position.isFinite ? state.position : 0)
        let nextDuration = max(0, state.duration.isFinite ? state.duration : 0)
        // Avoid rebuilding the complete SwiftUI view on every unchanged field.
        if title != nextTitle { title = nextTitle }
        if artist != nextArtist { artist = nextArtist }
        if playing != state.playing { playing = state.playing }
        if hasTrack != state.hasTrack { hasTrack = state.hasTrack }
        if position != nextPosition { position = nextPosition }
        if duration != nextDuration { duration = nextDuration }
        // Progress arrives many times a second. The Electron bridge omits
        // unchanged artwork rather than sending and decoding it every tick.
        if let encoded = state.artwork, encoded != lastArtwork {
            lastArtwork = encoded
            if encoded.hasPrefix("data:image/"),
               let comma = encoded.firstIndex(of: ","),
               let bytes = Data(base64Encoded: String(encoded[encoded.index(after:comma)...])) {
                artwork = NSImage(data: bytes)
            } else { artwork = nil }
        }
        if !state.hasTrack { artwork = nil; lastArtwork = "" }
    }
}

struct Player: View {
    @ObservedObject var model: Model
    @State private var seeking = false
    @State private var seekPosition = 0.0
    var currentPosition: Double { seeking ? seekPosition : model.position }
    func stamp(_ seconds: Double) -> String {
        let total = max(0,Int(seconds.isFinite ? seconds : 0))
        return "\(total/60):" + String(format:"%02d",total%60)
    }
    var body: some View {
        VStack(spacing:9) {
            HStack(spacing:10) {
                Group {
                    if let img = model.artwork { Image(nsImage:img).resizable().scaledToFill() }
                    else { Image(systemName:"music.note").frame(maxWidth:.infinity,maxHeight:.infinity).background(.purple.opacity(0.3)) }
                }.frame(width:42,height:42).clipShape(RoundedRectangle(cornerRadius:10))
                VStack(alignment:.leading,spacing:3) {
                    Text(model.title).font(.system(size:13,weight:.semibold)).lineLimit(1)
                    Text(model.artist).font(.system(size:11)).foregroundStyle(.white.opacity(0.57)).lineLimit(1)
                }
                Spacer(minLength:2)
                Image(systemName:model.playing ? "waveform" : "ellipsis").foregroundStyle(.white.opacity(0.4))
            }
            HStack(spacing:8) {
                Text(stamp(currentPosition))
                Slider(value:Binding(get:{seeking ? seekPosition : model.position},
                                     set:{seekPosition=$0}),
                       in:0...max(1,model.duration),onEditingChanged:{editing in
                    if editing {
                        if !seeking { seekPosition=model.position }
                        seeking=true
                    }
                    else {
                        action("seek",position:min(model.duration,max(0,seekPosition)))
                        seeking=false
                    }
                })
                .tint(.blue.opacity(0.85)).controlSize(.mini)
                .disabled(!model.hasTrack || model.duration <= 0)
                Text("-" + stamp(max(0,model.duration-currentPosition)))
            }.font(.system(size:10).monospacedDigit()).foregroundStyle(.white.opacity(0.62))
            HStack(spacing:22) {
                Text(model.playing ? "PLAYING" : "PAUSED")
                    .font(.system(size:8,weight:.bold)).tracking(1.1)
                    .frame(maxWidth:.infinity,alignment:.leading).foregroundStyle(.white.opacity(0.45))
                Button { action("previous") } label: { Image(systemName:"backward.end.fill") }
                    .disabled(!model.hasTrack)
                Button { action("toggle") } label: { Image(systemName:model.playing ? "pause.fill" : "play.fill").font(.system(size:17)) }
                    .disabled(!model.hasTrack)
                Button { action("next") } label: { Image(systemName:"forward.end.fill") }
                    .disabled(!model.hasTrack)
                Button { action("open") } label: { Image(systemName:"rectangle.on.rectangle") }
            }.buttonStyle(.plain).font(.system(size:14))
        }
        .padding(.horizontal,15).padding(.top,37).padding(.bottom,11)
        .frame(width:308,height:163)
        .background {
            RoundedRectangle(cornerRadius:23)
                .fill(.ultraThinMaterial)
                .environment(\.colorScheme,.dark)
                .overlay(RoundedRectangle(cornerRadius:23).stroke(.white.opacity(0.25),lineWidth:1))
        }
        .foregroundStyle(.white)
    }
}

@MainActor final class Island: NSObject, NSApplicationDelegate {
    let model = Model()
    var panel: NSPanel?
    var timer: Timer?
    var displayObserver: NSObjectProtocol?
    var lastInside = Date.distantPast
    var target: NSScreen? {
        NSScreen.screens.first(where:{$0.localizedName.localizedCaseInsensitiveContains("built-in")}) ?? NSScreen.main
    }
    func applicationDidFinishLaunching(_ event:Notification) {
        NSApp.setActivationPolicy(.accessory)
        guard let screen = target else { return }
        let bounds = NSRect(x:screen.frame.midX-154,y:screen.frame.maxY-163,width:308,height:163)
        let p = NSPanel(contentRect:bounds,styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
        p.isOpaque=false; p.backgroundColor = .clear; p.hasShadow=false
        p.isMovable=false; p.hidesOnDeactivate=false
        p.level = .mainMenu + 2
        p.collectionBehavior = [.canJoinAllSpaces,.fullScreenAuxiliary,.stationary,.ignoresCycle]
        p.contentView=NSHostingView(rootView:Player(model:model))
        p.orderOut(nil)
        panel=p
        displayObserver=NotificationCenter.default.addObserver(
            forName:NSApplication.didChangeScreenParametersNotification,
            object:nil,queue:.main
        ){[weak self] _ in MainActor.assumeIsolated { self?.reposition() } }
        print("{\"event\":\"ready\"}");fflush(stdout)
        timer=Timer.scheduledTimer(withTimeInterval:0.16,repeats:true){ [weak self] _ in
            MainActor.assumeIsolated { self?.updateHover() }
        }
        DispatchQueue.global(qos:.utility).async { [weak self] in
            while let line=readLine() {
                guard let data=line.data(using:.utf8),
                      let state=try? JSONDecoder().decode(MusicPacket.self,from:data) else { continue }
                DispatchQueue.main.async { self?.model.update(state) }
            }
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }
    func reposition() {
        guard let panel,let screen=target else { return }
        let next=NSRect(x:screen.frame.midX-154,y:screen.frame.maxY-163,
                        width:308,height:163)
        if panel.frame != next { panel.setFrame(next,display:false) }
    }
    func updateHover() {
        guard let panel,let screen=target else { return }
        let mouse=NSEvent.mouseLocation
        let open=NSRect(x:screen.frame.midX-120,y:screen.frame.maxY-85,width:240,height:85)
        let hover=model.hasTrack && (open.contains(mouse) || (panel.isVisible && panel.frame.insetBy(dx:-12,dy:-12).contains(mouse)))
        if hover {
            lastInside=Date()
            if !panel.isVisible { panel.orderFrontRegardless() }
        } else if panel.isVisible && Date().timeIntervalSince(lastInside)>1.0 {
            panel.orderOut(nil)
        }
    }
    func applicationWillTerminate(_ event:Notification){
        timer?.invalidate()
        if let displayObserver { NotificationCenter.default.removeObserver(displayObserver) }
        panel?.orderOut(nil)
    }
}

@main enum SonoraIsland {
    static func main() {
        if CommandLine.arguments.contains("--self-test") {
            let json = #"{"title":"Test","artist":"QA","artwork":"","playing":true,"hasTrack":true,"position":30,"duration":180}"#.data(using:.utf8)!
            let state=try! JSONDecoder().decode(MusicPacket.self,from:json)
            assert(state.position==30 && state.hasTrack)
            let delta = #"{"title":"Test","artist":"QA","playing":true,"hasTrack":true,"position":31,"duration":180,"trackId":"native-test"}"#.data(using:.utf8)!
            let update=try! JSONDecoder().decode(MusicPacket.self,from:delta)
            assert(update.artwork == nil && update.position == 31)
            print("PASS: native Sonora island state protocol (full and delta packets)")
            return
        }
        let app=NSApplication.shared
        let delegate=Island()
        app.delegate=delegate
        app.run()
    }
}
