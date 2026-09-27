import ExpoModulesCore
import ProximityReader
import UIKit

/**
 Apple's own Tap to Pay on iPhone merchant education (checklist 4.1).

 On iOS 18 and later Apple publishes the education content itself, through
 `ProximityReaderDiscovery`, and requires apps to use it: it covers contactless
 cards, Apple Pay and other wallets, and the regional PIN and fallback wording
 (4.4 to 4.8) in one place, kept current by Apple. The Stripe Terminal SDK does
 not wrap it, hence this module. Earlier iOS versions fall back to the app's own
 screens (`components/payments/TapToPayEducationContent`).
 */
public class TapToPayEducationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TapToPayEducation")

    /// True where Apple provides the education content (iOS 18+).
    Function("isAvailable") { () -> Bool in
      if #available(iOS 18.0, *) {
        return true
      }
      return false
    }

    /// Presents Apple's "how to tap" education over the current screen.
    AsyncFunction("showHowToTapAsync") { () async throws in
      guard #available(iOS 18.0, *) else {
        throw EducationUnavailableException()
      }
      try await self.presentHowToTap()
    }
  }

  @available(iOS 18.0, *)
  @MainActor
  private func presentHowToTap() async throws {
    guard let viewController = appContext?.utilities?.currentViewController() else {
      throw MissingViewControllerException()
    }
    let discovery = ProximityReaderDiscovery()
    let content = try await discovery.content(for: .payment(.howToTap))
    try await discovery.presentContent(content, from: viewController)
  }
}

internal final class EducationUnavailableException: Exception {
  override var reason: String {
    "Apple's Tap to Pay on iPhone education needs iOS 18 or later"
  }
}

internal final class MissingViewControllerException: Exception {
  override var reason: String {
    "Could not find the current view controller"
  }
}
