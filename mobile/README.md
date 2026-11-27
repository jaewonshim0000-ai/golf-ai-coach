# Golf AI Coach on phones

Both apps open the live site, https://golf-ai-coach-alpha.vercel.app. A web
deploy updates the apps too, with no app-store release needed.

| | How | Why |
|---|---|---|
| Android | Trusted Web Activity, built with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (`mobile/android`) | The site runs in the phone's own Chrome, so sign-in, camera, uploads, MediaPipe and Stripe work exactly as they do in Chrome. |
| iOS | [Capacitor](https://capacitorjs.com) shell pointing at the live URL (`mobile/ios`) | iOS has no TWA. Capacitor wraps the site in WKWebView. It needs a Mac with Xcode to build. |
| iOS today | Add to Home Screen from Safari | Free, no Mac or Apple account, and it opens full screen. |

## Android

### Install the APK

1. Copy `golf-ai-coach-1.0.0.apk` to the phone. It was built on 2026-11-26 into
   `C:\Users\New Owner\Desktop\Golf AI Coach Android\`.
2. Open it on the phone and allow "Install unknown apps" for the app you opened it with.
3. Launch **Golf Coach**. The app opens without a browser bar once
   `https://golf-ai-coach-alpha.vercel.app/.well-known/assetlinks.json` is live (it ships
   in this repo under `public/.well-known/`). If you see a thin URL bar, that file or the
   fingerprint in it doesn't match the key that signed the APK.

Chrome (or another browser that supports TWAs, such as Edge or Samsung Internet) must be
installed. If none is, the app falls back to a Custom Tab.

### Signing key

The key is **not** in git. It lives at
`C:\Users\New Owner\Documents\Golf AI Coach signing\`:

- `golf-ai-coach.keystore`: alias `golf-ai-coach`, PKCS12
- `README.txt`: the password (one password for both the keystore and the key)

Back that folder up. Updates to an installed app must be signed with the same key.

### Rebuild (Windows)

You need Node, JDK 17+ (JDK 21 at `C:\Program Files\Java\jdk-21.0.10` works) and the
Android SDK with build-tools 36.1.0.

```powershell
npm i -g @bubblewrap/cli
cd mobile\android
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = "<password from README.txt>"
$env:BUBBLEWRAP_KEY_PASSWORD = $env:BUBBLEWRAP_KEYSTORE_PASSWORD
bubblewrap build --skipPwaValidation --signingKeyPath=C:\Users\NEWOWN~1\DOCUME~1\GOLFAI~1\GOLF-A~1.KEY
```

This writes `app-release-signed.apk` and `app-release-bundle.aab`. Both are git-ignored.

Before shipping an update, raise `appVersionCode` (and `appVersionName`) in
`twa-manifest.json`, then run `bubblewrap update` before `bubblewrap build`.

Traps on this machine:

- **Paths with spaces break Bubblewrap's signing step.** Set `jdkPath` in
  `%USERPROFILE%\.bubblewrap\config.json` to the short path `C:/PROGRA~1/Java/JDK-21~1.10`,
  and pass the keystore's short path as shown above.
- **Bubblewrap rejects a standard SDK folder.** It wants `bin/` or `tools/` at the SDK
  root, so point `androidSdkPath` at a folder of junctions: `bin` and `lib` linked to
  `cmdline-tools\latest\{bin,lib}`, and `build-tools`, `platforms`, `platform-tools`,
  `licenses` linked to the real SDK.
- **Java fails with "Unable to establish loopback connection"** when the temp path is
  long. Set `$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=C:\Temp"`, pointing at
  any short folder that exists.

### Google Play

Upload `app-release-bundle.aab`. With Play App Signing (the default), Google re-signs the
app with its own key. Copy the **app signing key** SHA-256 from Play Console → Setup → App
signing into `public/.well-known/assetlinks.json` next to the current fingerprint, or the
Play-installed app will show a URL bar.

Moving to a custom domain: change `host` in `twa-manifest.json`, run `bubblewrap update`,
rebuild, and serve the same `assetlinks.json` from the new domain.

## iOS

### Today, without a Mac: Add to Home Screen

In Safari on the iPhone, open the site, then tap **Share → Add to Home Screen**. The
site already ships what iOS needs:

- a 180×180 opaque `apple-touch-icon`
- `apple-mobile-web-app-capable` and the title "Golf Coach"
- a `black-translucent` status bar with `viewport-fit=cover`
- a manifest with `display: standalone`

Camera recording, uploads and MediaPipe work there as they do in Safari.

### The App Store app: needs a Mac and an Apple account

`mobile/ios` holds a Capacitor 8 project. It loads `/practice` on the live site and keeps
the site and `*.stripe.com` inside the app. It has camera, microphone and photo-library
permission text, the app icon and a launch screen, and it uses Swift Package Manager, so
no CocoaPods are needed. CI builds an unsigned iPhone `.ipa` whenever `mobile/ios` changes
(`.github/workflows/ios.yml`).

On a Mac with Xcode 16 or newer:

```sh
cd mobile/ios
npm ci
npx cap sync ios
npx cap open ios
```

In Xcode, select the **App** target → Signing & Capabilities, and choose your Team.

- **Free Apple ID:** plug in the iPhone and press Run. The install expires after 7 days.
- **Apple Developer Program ($99/yr):** use Product → Archive → Distribute App → App
  Store Connect, then TestFlight or App Review.

No Mac? A cloud Mac service such as Codemagic, Ionic Appflow, or a GitHub Actions
`macos` runner with your signing certificate and provisioning profile stored as secrets
can run the same steps. Either way you need the developer account to sign.

### Your own iPhone from Windows, with a free Apple ID

CI builds an unsigned `golf-ai-coach-unsigned.ipa`. Find it in GitHub → Actions → **iOS
shell** → the latest run → Artifacts. To build a fresh one, use **Run workflow** on the
same page. [Sideloadly](https://sideloadly.io) signs it with your Apple ID as it
installs it:

1. On the PC, install iTunes and iCloud from apple.com (not the Microsoft Store
   versions), then Sideloadly.
2. Plug in the iPhone, unlock it and tap **Trust**.
3. In Sideloadly, pick the `.ipa`, enter your Apple ID and press Start. Sideloadly is a
   third-party tool, so a spare Apple ID is the safer choice.
4. On the iPhone, open Settings → General → VPN & Device Management and trust your
   Apple ID. On iOS 16+, also turn on Settings → Privacy & Security → Developer Mode
   (the phone restarts).

A free Apple ID's install stops opening after **7 days**. Re-run Sideloadly to renew
it; nothing in the app is lost. A free ID can hold 3 such apps at a time.

### Before submitting to the App Store

- **Guideline 4.2, minimum functionality.** Apple rejects apps that are "just a
  website". The camera-driven swing analysis helps, but expect questions.
- **Guideline 3.1.1, in-app purchase.** Selling Premium through Stripe inside the iOS
  app is allowed on the US storefront, as an external purchase link. Most other
  storefronts need in-app purchase, or Premium has to be unavailable for purchase inside
  the app. Decide this before you submit.
- **Email links.** Sign-up confirmation and password-reset links open in Safari, not the
  app. The player then signs in inside the app with their password. Making them open the
  app needs Universal Links (an `apple-app-site-association` file plus an Associated
  Domains entitlement).
