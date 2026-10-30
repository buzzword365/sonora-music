import Foundation
import Capacitor

/// Registers app-local, Swift-backed music storage with the Capacitor bridge.
class SonoraBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SonoraMusicPlugin())
    }
}
