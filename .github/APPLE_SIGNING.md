# Apple signing & notarization — step by step

Use this so macOS Intel/Apple Silicon releases open **without** the Gatekeeper “Apple could not verify Pinforge” dialog.

You need a paid **[Apple Developer Program](https://developer.apple.com/programs/)** membership ($99/year).

---

## Step 1 — Apple Developer account

1. Sign in at [developer.apple.com](https://developer.apple.com) with your Apple ID.
2. Note your **Team ID**:  
   **Account → Membership details → Team ID** (10 characters, e.g. `AB12CD34EF`).
3. Keep that Apple ID email handy (used for notarization).

---

## Step 2 — Create a Developer ID Application certificate

This cert signs apps distributed **outside** the Mac App Store (DMG / ZIP from GitHub Releases).

1. Open **[Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list)**.
2. Click **+** → **Developer ID Application** → Continue.  
   (Not “Mac App Distribution” — that’s for the App Store.)
3. On a Mac, create a CSR if prompted:
   ```bash
   # Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority
   # Or follow Apple’s CSR instructions in the portal
   ```
4. Upload the CSR, download the `.cer`, double-click to install into **Keychain Access**.
5. Confirm it appears under **My Certificates** as  
   `Developer ID Application: Your Name (TEAMID)`.

---

## Step 3 — Export a `.p12` for GitHub Actions

CI needs the cert + private key as a password-protected `.p12`.

1. On the Mac where the cert was installed, open **Keychain Access**.
2. Find **Developer ID Application: …** (under _My Certificates_).
3. Expand it → select the cert **and** the private key.
4. Right-click → **Export 2 items…** → save as `developer-id.p12`.
5. Set a strong export password (you will store this as `CSC_KEY_PASSWORD`).
6. Base64-encode the file for GitHub (run on Mac/Linux):

```bash
base64 -i developer-id.p12 -o developer-id.p12.base64
# or: base64 developer-id.p12 | tr -d '\n' > developer-id.p12.base64
```

On Windows (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("developer-id.p12")) | Set-Content developer-id.p12.base64
```

Keep the `.p12` and password offline; do not commit them.

---

## Step 4 — App-specific password (notarization)

Notarytool uses an app-specific password, not your normal Apple ID password.

1. Go to [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security** → **App-Specific Passwords**.
2. Generate one named e.g. `Pinforge Notary`.
3. Copy the `xxxx-xxxx-xxxx-xxxx` value → this is `APPLE_APP_SPECIFIC_PASSWORD`.

---

## Step 5 — GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret                        | Value                                                 |
| ----------------------------- | ----------------------------------------------------- |
| `CSC_LINK`                    | Full contents of `developer-id.p12.base64` (one line) |
| `CSC_KEY_PASSWORD`            | Password you set when exporting the `.p12`            |
| `APPLE_ID`                    | Your Apple ID email                                   |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from Step 4                     |
| `APPLE_TEAM_ID`               | Team ID from Step 1                                   |

Optional (electron-builder):

| Secret     | Purpose                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| `CSC_NAME` | Exact cert Common Name if auto-detect fails, e.g. `Developer ID Application: Name (TEAMID)` |

---

## Step 6 — Local macOS build (optional smoke test)

On a Mac with the cert in Keychain:

```bash
pnpm install
pnpm --filter @pinforge/core exec playwright install chromium

export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="AB12CD34EF"
# Leave CSC_IDENTITY_AUTO_DISCOVERY unset so Keychain cert is used

pnpm dist:mac:x64    # Intel
# or
pnpm dist:mac:arm64  # Apple Silicon
```

Check signing:

```bash
codesign --verify --deep --strict --verbose=2 apps/desktop/release/mac*/Pinforge.app
spctl --assess --type execute --verbose apps/desktop/release/mac*/Pinforge.app
```

Artifacts land in `apps/desktop/release/` (`.dmg` + `.zip`).

---

## Step 7 — CI release build

1. Ensure secrets from Step 5 are set.
2. `release.yml` enables signing when `CSC_LINK` is present (see workflow).
3. Tag a release (version must match `apps/desktop/package.json`):

```bash
git tag v0.1.2
git push origin v0.1.2
```

4. Watch **Actions → Release**. macOS jobs should log code sign + notarization (not “Skipping notarization”).
5. Download the `*-x64.dmg` / `*-arm64.dmg` from the GitHub Release and open on a clean Mac — Gatekeeper should accept it.

---

## Environment checklist

| Environment     | What you need                                                                   |
| --------------- | ------------------------------------------------------------------------------- |
| Local Mac build | Cert in Keychain + `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` |
| GitHub Actions  | All 5 secrets above; macOS runners (`macos-14`)                                 |
| End users       | Nothing — signed + notarized app opens normally                                 |
| Without secrets | Ad-hoc / unsigned build; users need `xattr -cr Pinforge.app` (see root README)  |

---

## Troubleshooting

| Symptom                                     | Fix                                                          |
| ------------------------------------------- | ------------------------------------------------------------ |
| “Apple could not verify…” after CI          | Secrets missing or notarization skipped — check release logs |
| `errSecInternalComponent` / unlock keychain | CI: ensure `CSC_LINK` is valid base64 `.p12`                 |
| Notarytool auth failed                      | Regenerate app-specific password; confirm `APPLE_TEAM_ID`    |
| Wrong arch dialog / crash                   | Use `x64` DMG on Intel, `arm64` on Apple Silicon             |
| `afterSign` “Skipping notarization”         | Missing `APPLE_*` env/secrets                                |

Related code: `scripts/afterSign.js`, `apps/desktop/electron-builder.yml`, `apps/desktop/resources/entitlements.mac.plist`, `.github/workflows/release.yml`.
