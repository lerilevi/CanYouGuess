const { withAppDelegate } = require('expo/config-plugins');

const DECLARATION_MARKER = '// CanYouGuess: synchronous RCTFatal persistence';
const INSTALL_MARKER = '// CanYouGuess: install RCTFatal persistence before React starts';

const SWIFT_DECLARATION = `
${DECLARATION_MARKER}
private enum CanYouGuessFatalReporter {
  private static var installed = false
  private static let filename = "canyouguess-native-fatal.json"

  static func install() {
    guard !installed else { return }
    installed = true

    let previousHandler = RCTGetFatalHandler()
    RCTSetFatalHandler { error in
      persist(error)

      // Restore and invoke React Native's prior handler so release behavior is
      // unchanged: the error is still fatal after the synchronous write.
      RCTSetFatalHandler(previousHandler)
      if let previousHandler {
        previousHandler(error)
      } else {
        RCTFatal(error)
      }
    }
  }

  private static func persist(_ error: NSError) {
    do {
      guard let directory = FileManager.default.urls(
        for: .documentDirectory,
        in: .userDomainMask
      ).first else { return }

      let rawFrames = error.userInfo["RCTJSStackTraceKey"] as? [[String: Any]] ?? []
      let stack = rawFrames.map(formatFrame).joined(separator: "\\n")
      var details: [String: Any] = [
        "domain": error.domain,
        "code": error.code,
        "jsStack": rawFrames,
      ]
      if let extraData = error.userInfo["RCTJSExtraDataKey"] {
        details["extraData"] = extraData
      }

      let record: [String: Any] = [
        "id": UUID().uuidString,
        "message": error.localizedDescription,
        "stack": stack.isEmpty ? NSNull() : stack,
        "isFatal": true,
        "at": ISO8601DateFormatter().string(from: Date()),
        "source": "native-rctfatal",
        "details": details,
      ]
      let data = try JSONSerialization.data(
        withJSONObject: record,
        options: [.prettyPrinted, .sortedKeys]
      )
      try data.write(to: directory.appendingPathComponent(filename), options: .atomic)
    } catch {
      NSLog("[CanYouGuessFatalReporter] Could not persist RCTFatal: %@", error.localizedDescription)
    }
  }

  private static func formatFrame(_ frame: [String: Any]) -> String {
    let method = frame["methodName"] as? String ?? "<unknown>"
    let file = (frame["file"] as? String) ?? (frame["fileName"] as? String) ?? "<unknown>"
    let line = frame["lineNumber"].map { String(describing: $0) } ?? "?"
    let column = frame["column"].map { String(describing: $0) } ?? "?"
    return "\\(method)@\\(file):\\(line):\\(column)"
  }
}
`;

function patchAppDelegate(contents) {
  if (contents.includes(DECLARATION_MARKER) && contents.includes(INSTALL_MARKER)) {
    return contents;
  }
  if (contents.includes(DECLARATION_MARKER) || contents.includes(INSTALL_MARKER)) {
    throw new Error('Found a partial CanYouGuess RCTFatal patch; refusing to duplicate it.');
  }

  const classAnnotation = /^(?:@main|@UIApplicationMain)$/m;
  if (!classAnnotation.test(contents)) {
    throw new Error('Could not find the Swift AppDelegate class annotation.');
  }
  let patched = contents.replace(classAnnotation, `${SWIFT_DECLARATION}\n$&`);

  const didFinish = /(public override func application\([\s\S]*?didFinishLaunchingWithOptions[\s\S]*?\)\s*->\s*Bool\s*\{)/m;
  if (!didFinish.test(patched)) {
    throw new Error('Could not find AppDelegate didFinishLaunchingWithOptions.');
  }
  patched = patched.replace(
    didFinish,
    `$1\n    ${INSTALL_MARKER}\n    CanYouGuessFatalReporter.install()`,
  );
  return patched;
}

function withNativeFatalReporter(config) {
  return withAppDelegate(config, (appDelegateConfig) => {
    if (appDelegateConfig.modResults.language !== 'swift') {
      throw new Error('CanYouGuess RCTFatal reporter requires a Swift AppDelegate.');
    }
    appDelegateConfig.modResults.contents = patchAppDelegate(appDelegateConfig.modResults.contents);
    return appDelegateConfig;
  });
}

module.exports = withNativeFatalReporter;
module.exports.patchAppDelegate = patchAppDelegate;
