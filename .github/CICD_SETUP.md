# CI/CD Setup Guide

## Overview

Pinforge uses GitHub Actions for PR checks, optional GPT review, manual builds, and tagged releases.

## Workflows

| Workflow                                     | Trigger                        | Purpose                                         |
| -------------------------------------------- | ------------------------------ | ----------------------------------------------- |
| `pr-checks.yml`                              | PR / push to main, master, dev | Format, typecheck, unit + e2e harness           |
| `gpt-pr-checks.yml`                          | PRs only                       | Optional GPT review (needs `ENABLE_GPT_REVIEW`) |
| `build-manual.yml`                           | workflow_dispatch              | Build installers for selected platforms         |
| `release.yml`                                | Tag `v*`                       | Cross-platform build + GitHub Release           |
| `issue-triage.yml` / `discussion-triage.yml` | Issues / discussions           | Labels / welcome                                |

## Secrets and variables

Configure under **Settings → Secrets and variables → Actions**.

### Secrets

| Secret                        | Required         | Purpose                                |
| ----------------------------- | ---------------- | -------------------------------------- |
| `GITHUB_TOKEN`                | Built-in         | Releases and PR comments               |
| `OPENAI_API_KEY`              | Optional         | GPT review / assessment                |
| `CSC_LINK`                    | Optional (macOS) | Base64 Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD`            | Optional (macOS) | Password for that `.p12`               |
| `CSC_NAME`                    | Optional (macOS) | Exact cert name if auto-detect fails   |
| `APPLE_ID`                    | Optional (macOS) | Apple ID email for notarytool          |
| `APPLE_APP_SPECIFIC_PASSWORD` | Optional (macOS) | App-specific password                  |
| `APPLE_TEAM_ID`               | Optional (macOS) | 10-character Team ID                   |

**Full Apple walkthrough:** [APPLE_SIGNING.md](./APPLE_SIGNING.md)

### Variables

| Variable            | Purpose                       |
| ------------------- | ----------------------------- |
| `ENABLE_GPT_REVIEW` | Set to `true` to run GPT jobs |

## Local packaging

```bash
pnpm install
pnpm --filter @pinforge/core exec playwright install chromium

pnpm dist:win    # Windows NSIS → apps/desktop/release/
pnpm dist:mac    # macOS DMG + zip
pnpm dist:linux  # AppImage
```

See [scripts/README.md](../scripts/README.md).

## Release flow

1. Bump versions in `apps/desktop`, `apps/cli`, `packages/core`.
2. Ensure **PR Checks** is green.
3. Commit, tag, push: `git tag v0.1.2 && git push origin v0.1.2`
4. `release.yml` builds all platforms and publishes the GitHub Release.

## Artifacts

| Platform | Typical files                                          |
| -------- | ------------------------------------------------------ |
| Windows  | `Pinforge-*-Setup-x64.exe`                             |
| macOS    | `Pinforge-*-x64.dmg` / `*-arm64.dmg` + matching `.zip` |
| Linux    | `Pinforge-*-x64.AppImage`                              |

## Troubleshooting

1. **Release upload empty** — Check `apps/desktop/release/` and electron-builder logs.
2. **macOS “Apple could not verify…”** — Unsigned build; follow [APPLE_SIGNING.md](./APPLE_SIGNING.md) or use `xattr -cr Pinforge.app`.
3. **sharp / native module issues** — See `scripts/afterPack.js`.
4. **Playwright at runtime** — Chromium is not bundled; run `playwright install chromium` locally.

## Notes

- Package manager is **pnpm**.
- App source: `apps/desktop/`; shared logic: `packages/core/`.
- User-facing copy and CI comments are **English**.
