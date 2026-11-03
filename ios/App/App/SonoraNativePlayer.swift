import Foundation
import AVFoundation
import MediaPlayer
import UIKit

// Music playback must remain native: WebKit's JS callbacks cannot advance
// a queue reliably while the phone is locked or another app is foregrounded.
final class SonoraNativePlayer: NSObject {
    private let player = AVPlayer()
    private let locate: (String) -> URL?
    private let describe: (String) -> [String: Any]
    private let emit: ([String: Any]) -> Void
    private var queue: [String] = []
    private var currentID: String?
    private var repeatMode = "off"
    private var token: Any?
    private var interruptedWhilePlaying = false

    init(locate: @escaping (String) -> URL?,
         describe: @escaping (String) -> [String: Any],
         emit: @escaping ([String: Any]) -> Void) {
        self.locate = locate
        self.describe = describe
        self.emit = emit
        super.init()
        player.actionAtItemEnd = .pause
        NotificationCenter.default.addObserver(self, selector: #selector(didEnd(_:)),
            name: .AVPlayerItemDidPlayToEndTime, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance())
        token = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 1, preferredTimescale: 600),
            queue: .main) { [weak self] _ in self?.announce() }
        configureRemoteCommands()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        if let token = token { player.removeTimeObserver(token) }
    }

    private func seconds(_ time: CMTime) -> Double {
        let value = time.seconds
        return value.isFinite && value > 0 ? value : 0
    }

    func state() -> [String: Any] {
        return ["id": currentID ?? "", "playing": player.rate > 0,
                "time": seconds(player.currentTime()),
                "duration": player.currentItem.map { seconds($0.duration) } ?? 0,
                "repeat": repeatMode]
    }

    private func announce() {
        guard let id = currentID else { return }
        let metadata = describe(id)
        var now: [String: Any] = [
            MPMediaItemPropertyTitle: metadata["title"] as? String ?? "Unknown title",
            MPMediaItemPropertyArtist: metadata["artist"] as? String ?? "Unknown artist",
            MPMediaItemPropertyAlbumTitle: metadata["album"] as? String ?? "",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: seconds(player.currentTime()),
            MPNowPlayingInfoPropertyPlaybackRate: player.rate]
        if let item = player.currentItem {
            now[MPMediaItemPropertyPlaybackDuration] = seconds(item.duration)
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = now
        emit(state())
    }

    func setQueue(_ ordered: [String], repeatMode: String) {
        var seen = Set<String>()
        queue = ordered.filter { seen.insert($0).inserted && locate($0) != nil }
        self.repeatMode = ["one", "all"].contains(repeatMode) ? repeatMode : "off"
        if let id = currentID, !queue.contains(id) { queue.insert(id, at: 0) }
    }

    @discardableResult func load(_ id: String, time: Double = 0, autoplay: Bool) -> Bool {
        guard let url = locate(id), FileManager.default.fileExists(atPath: url.path) else { return false }
        if currentID != id || player.currentItem == nil {
            player.pause()
            currentID = id
            if !queue.contains(id) { queue.append(id) }
            player.replaceCurrentItem(with: AVPlayerItem(url: url))
        }
        if time.isFinite && time > 0 {
            player.seek(to: CMTime(seconds: time, preferredTimescale: 600))
        }
        if autoplay { play() } else { pause() }
        return true
    }

    func play() {
        guard player.currentItem != nil else { return }
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.playback, mode: .default, options: [.allowAirPlay])
            try audio.setActive(true)
        } catch { NSLog("Sonora AVAudioSession: %@", error.localizedDescription) }
        UIApplication.shared.beginReceivingRemoteControlEvents()
        if let item = player.currentItem {
            let length = seconds(item.duration)
            if length > 0 && seconds(player.currentTime()) >= length - 0.15 {
                player.seek(to: .zero)
            }
        }
        player.play()
        announce()
    }

    func pause() { player.pause(); announce() }

    func seek(_ time: Double) {
        guard player.currentItem != nil && time.isFinite else { return }
        player.seek(to: CMTime(seconds: max(0, time), preferredTimescale: 600))
        announce()
    }

    func volume(_ value: Double, muted: Bool) {
        player.volume = Float(max(0, min(1, value.isFinite ? value : 1)))
        player.isMuted = muted
    }

    func skip(_ direction: Int) {
        guard let id = currentID, let position = queue.firstIndex(of: id) else { return }
        if direction < 0 && seconds(player.currentTime()) > 3 {
            seek(0)
            return
        }
        var next = position + (direction < 0 ? -1 : 1)
        if next >= queue.count {
            if repeatMode == "all" { next = 0 }
            else { pause(); return }
        }
        if next < 0 { next = 0 }
        if next == position { seek(0); play() }
        else { _ = load(queue[next], autoplay: true) }
    }

    @objc private func didEnd(_ notification: Notification) {
        guard let item = notification.object as? AVPlayerItem,
              item === player.currentItem else { return }
        if repeatMode == "one" { seek(0); play() }
        else { skip(1) }
    }

    @objc private func interrupted(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let kind = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch kind {
        case .began:
            interruptedWhilePlaying = player.rate > 0
            pause()
        case .ended:
            let flags = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            if interruptedWhilePlaying &&
                AVAudioSession.InterruptionOptions(rawValue: flags).contains(.shouldResume) { play() }
            interruptedWhilePlaying = false
        @unknown default: break
        }
    }

    private func configureRemoteCommands() {
        let remote = MPRemoteCommandCenter.shared()
        remote.playCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { self?.play() }; return .success
        }
        remote.pauseCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { self?.pause() }; return .success
        }
        remote.nextTrackCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { self?.skip(1) }; return .success
        }
        remote.previousTrackCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { self?.skip(-1) }; return .success
        }
        remote.changePlaybackPositionCommand.addTarget { [weak self] command in
            guard let change = command as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            DispatchQueue.main.async { self?.seek(change.positionTime) }
            return .success
        }
    }
}
