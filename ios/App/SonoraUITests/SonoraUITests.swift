import XCTest

final class SonoraUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testFilesPickerOpensAndCancels() throws {
        let app = XCUIApplication()
        app.launch()
        let addMusic = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Add music")).firstMatch
        XCTAssertTrue(addMusic.waitForExistence(timeout: 25), "Sonora home should show Add music")
        addMusic.tap()

        // Files is presented natively, not a WebKit <input type=file> element.
        let cancel = app.buttons["Cancel"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 15), "iOS Files picker should expose Cancel")
        cancel.tap()

        XCTAssertTrue(addMusic.waitForExistence(timeout: 10), "Closing Files should return to Sonora")
        XCTAssertFalse(cancel.exists, "Picker should be dismissed")
    }
}
