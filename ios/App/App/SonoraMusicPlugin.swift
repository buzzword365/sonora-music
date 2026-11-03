import Foundation
import Capacitor
import UniformTypeIdentifiers
import AVFoundation
import UIKit

/// Imports user-selected audio via the Files picker into this app's Documents directory.
/// Files are copied by FileManager (not bridged through JavaScript/base64).
@objc(SonoraMusicPlugin)
public class SonoraMusicPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "SonoraMusicPlugin"
    public let jsName = "SonoraMusic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolveFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nativeLoad", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nativeQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nativePlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nativePause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nativeSkip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nativeSeek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nativeVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nativeState", returnType: CAPPluginReturnPromise)
    ]
    private var pendingCall: CAPPluginCall?
    private lazy var nativePlayer = SonoraNativePlayer(
        locate: { [weak self] id in
            guard let self = self else { return nil }
            return try? self.safeFile(id)
        },
        describe: { [weak self] id in
            guard let self = self, let url = try? self.safeFile(id) else { return [:] }
            return self.cachedMetadata(url) ?? self.metadata(url)
        },
        emit: { [weak self] state in
            self?.notifyListeners("sonoraNativeState", data: state)
        })

    private let allowed = Set(["mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus", "aiff", "aif", "mp4"])
    private var storage: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent("SonoraAudio", isDirectory: true)
    }
    private func ensureStorage() throws {
        try FileManager.default.createDirectory(at: storage, withIntermediateDirectories: true,
                                                 attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        // Imported copies can be recreated from the user's original files.
        // Avoid uploading full music libraries as part of iCloud device backup.
        var directory = storage
        var attributes = URLResourceValues()
        attributes.isExcludedFromBackup = true
        try directory.setResourceValues(attributes)
    }
    private func safeFile(_ id: String) throws -> URL {
        guard !id.isEmpty, id == (id as NSString).lastPathComponent,
              !id.contains("/") && !id.contains("\\") && !id.contains(".."),
              allowed.contains(URL(fileURLWithPath: id).pathExtension.lowercased()) else {
            throw NSError(domain: "SonoraMusic", code: 400,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid audio identifier"])
        }
        return storage.appendingPathComponent(id, isDirectory: false)
    }
    private func sidecar(_ url: URL) -> URL { url.appendingPathExtension("sonora.json") }
    private func originalName(_ url: URL) -> String {
        let sidecarURL = sidecar(url)
        if let content = try? Data(contentsOf: sidecarURL),
           let json = try? JSONSerialization.jsonObject(with: content) as? [String: Any],
           let name = json["original"] as? String, !name.isEmpty { return name }
        return url.lastPathComponent
    }
    private func cachedMetadata(_ url: URL) -> [String: Any]? {
        guard let content = try? Data(contentsOf: sidecar(url)),
              let json = try? JSONSerialization.jsonObject(with: content) as? [String: Any],
              let data = json["metadata"] as? [String: Any],
              let id = data["id"] as? String, id == url.lastPathComponent else { return nil }
        return data
    }
    private func metadata(_ url: URL, originalFilename: String? = nil) -> [String: Any] {
        let asset = AVURLAsset(url: url)
        let common = asset.commonMetadata
        let filename = originalFilename ?? originalName(url)
        let name = (filename as NSString).deletingPathExtension
        let durationValue = asset.duration.seconds
        var result: [String: Any] = [
            "id": url.lastPathComponent,
            "filename": filename,
            "title": common.first(where: {$0.commonKey == .commonKeyTitle})?.stringValue ?? name,
            "artist": common.first(where: {$0.commonKey == .commonKeyArtist})?.stringValue ?? "Unknown artist",
            "album": common.first(where: {$0.commonKey == .commonKeyAlbumName})?.stringValue ?? "Singles",
            "duration": durationValue.isFinite && durationValue > 0 ? durationValue : 0
        ]
        if let info = try? url.resourceValues(forKeys: [.fileSizeKey]) {
            result["size"] = info.fileSize ?? 0
        }
        if let artwork = common.first(where: { $0.commonKey == .commonKeyArtwork })?.dataValue,
           artwork.count > 0 && artwork.count < 500_000 {
            result["coverBase64"] = artwork.base64EncodedString()
            result["coverMime"] = artwork.starts(with: [0x89, 0x50, 0x4E, 0x47]) ? "image/png" : "image/jpeg"
        }
        return result
    }
    @objc public func pick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil else { call.reject("An import is already open"); return }
            guard let presenter = self.bridge?.viewController else {
                call.reject("Native document picker unavailable"); return
            }
            let types: [UTType] = [.audio, .mp3, .mpeg4Audio,
                UTType(filenameExtension: "flac"), UTType(filenameExtension: "ogg"),
                UTType(filenameExtension: "opus")].compactMap { $0 }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
            picker.allowsMultipleSelection = true
            picker.delegate = self
            self.pendingCall = call
            presenter.present(picker, animated: true)
        }
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingCall?.resolve(["files": [], "canceled": true])
        pendingCall = nil
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        DispatchQueue.global(qos: .userInitiated).async {
            var imported: [[String: Any]] = []
            var errors: [String] = []
            var skipped = 0
            do { try self.ensureStorage() }
            catch { call.reject("Cannot create private audio directory: \(error.localizedDescription)"); return }
            let oldURLs = (try? FileManager.default.contentsOfDirectory(at: self.storage,
                   includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles])) ?? []
            var existing = Set(oldURLs.filter { self.allowed.contains($0.pathExtension.lowercased()) }.map {
                let size = (try? $0.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
                return self.originalName($0).lowercased() + "|" + String(size)
            })
            for url in urls {
                let extensionName = url.pathExtension.lowercased()
                guard self.allowed.contains(extensionName) else {
                    errors.append("Unsupported audio format: \(url.lastPathComponent)"); continue
                }
                let granted = url.startAccessingSecurityScopedResource()
                defer { if granted { url.stopAccessingSecurityScopedResource() } }
                let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
                let duplicateKey = url.lastPathComponent.lowercased() + "|" + String(size)
                if existing.contains(duplicateKey) { skipped += 1; continue }
                // Do not trust user-controlled paths; imported destination is random.
                let destination = self.storage.appendingPathComponent(UUID().uuidString + "." + extensionName)
                do {
                    try FileManager.default.copyItem(at: url, to: destination)
                    try FileManager.default.setAttributes(
                        [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                        ofItemAtPath: destination.path)
                    let indexed = self.metadata(destination, originalFilename: url.lastPathComponent)
                    let sidecarData = try JSONSerialization.data(withJSONObject:
                        ["original": url.lastPathComponent, "metadata": indexed])
                    try sidecarData.write(to: self.sidecar(destination), options: .atomic)
                    imported.append(indexed)
                    existing.insert(duplicateKey)
                } catch {
                    try? FileManager.default.removeItem(at: destination)
                    try? FileManager.default.removeItem(at: self.sidecar(destination))
                    errors.append("Could not import \(url.lastPathComponent): \(error.localizedDescription)")
                }
            }
            call.resolve(["files": imported, "errors": errors, "duplicates": skipped, "canceled": false])
        }
    }
    @objc public func list(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.ensureStorage()
                let urls = try FileManager.default.contentsOfDirectory(at: self.storage,
                                includingPropertiesForKeys: [.isRegularFileKey],
                                options: [.skipsHiddenFiles])
                let files = urls.filter { self.allowed.contains($0.pathExtension.lowercased()) }
                    .map { self.cachedMetadata($0) ?? self.metadata($0) }
                call.resolve(["files": files])
            } catch { call.reject("Cannot read native library: \(error.localizedDescription)") }
        }
    }
    @objc public func resolveFile(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing ID"); return }
        do {
            let file = try safeFile(id)
            guard FileManager.default.fileExists(atPath: file.path) else {
                call.reject("Audio file no longer exists");return
            }
            call.resolve(["url": file.absoluteString])
        } catch { call.reject(error.localizedDescription) }
    }
    @objc public func removeFile(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing ID");return }
        do {
            let file = try safeFile(id)
            if FileManager.default.fileExists(atPath: file.path) {
                try FileManager.default.removeItem(at: file)
            }
            try? FileManager.default.removeItem(at: sidecar(file))
            call.resolve()
        } catch { call.reject(error.localizedDescription) }
    }

    // MARK: Native audio bridge (never routes audio through IndexedDB/WebKit)
    @objc public func nativeLoad(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing ID"); return }
        let time = call.getDouble("time") ?? 0
        let play = call.getBool("play") ?? true
        DispatchQueue.main.async {
            if self.nativePlayer.load(id, time: time, autoplay: play) {
                call.resolve(self.nativePlayer.state())
            } else {
                call.reject("Local audio file missing or invalid")
            }
        }
    }
    @objc public func nativeQueue(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids") ?? []).compactMap { $0 as? String }
        let repeatMode = call.getString("repeat") ?? "off"
        DispatchQueue.main.async {
            self.nativePlayer.setQueue(ids, repeatMode: repeatMode)
            call.resolve(self.nativePlayer.state())
        }
    }
    @objc public func nativePlay(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.nativePlayer.play()
            call.resolve(self.nativePlayer.state())
        }
    }
    @objc public func nativePause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.nativePlayer.pause()
            call.resolve(self.nativePlayer.state())
        }
    }
    @objc public func nativeSkip(_ call: CAPPluginCall) {
        let direction = call.getInt("direction") ?? 1
        DispatchQueue.main.async {
            self.nativePlayer.skip(direction)
            call.resolve(self.nativePlayer.state())
        }
    }
    @objc public func nativeSeek(_ call: CAPPluginCall) {
        guard let time = call.getDouble("time"), time.isFinite else {
            call.reject("Invalid position"); return
        }
        DispatchQueue.main.async {
            self.nativePlayer.seek(time)
            call.resolve(self.nativePlayer.state())
        }
    }
    @objc public func nativeVolume(_ call: CAPPluginCall) {
        let volume = call.getDouble("volume") ?? 1
        let muted = call.getBool("muted") ?? false
        DispatchQueue.main.async {
            self.nativePlayer.volume(volume, muted: muted)
            call.resolve(self.nativePlayer.state())
        }
    }
    @objc public func nativeState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.nativePlayer.state()) }
    }

}
