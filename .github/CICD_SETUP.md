# CI/CD Setup Guide

## Overview

Pinforge uses GitHub Actions for PR checks, optional GPT review, manual builds, and tagged releases.

## Workflows

| Workflow                | Trigger                            | Purpose                                                   |
| ----------------------- | ---------------------------------- | --------------------------------------------------------- |
| `pr-checks.yml`         | PR / push to main, master, dev     | `pnpm format:check` + `pnpm typecheck`; optional GPT jobs |
| `build-manual.yml`      | workflow_dispatch                  | Build installers for selected platforms                   |
| `release.yml`           | Tag `v*`                           | Build + upload assets to GitHub Release                   |
| `gpt-review.yml`        | Called from PR checks or manual    | Code review (requires `OPENAI_API_KEY`)                   |
| `gpt-pr-assessment.yml` | External contributor PRs or manual | Merge-priority assessment                                 |
| `issue-triage.yml`      | New issues                         | Label + assign from Module dropdown                       |
| `discussion-triage.yml` | New discussions                    | Welcome comment                                           |

## Secrets and variables

Configure under **Settings → Secrets and variables → Actions**.

### Secrets

| Secret                                   | Required         | Purpose                                 |
| ---------------------------------------- | ---------------- | --------------------------------------- |
| `GITHUB_TOKEN`                           | Built-in         | Releases and PR comments                |
| `OPENAI_API_KEY`                         | Optional         | GPT review / assessment                 |
| `appleId` / `appleIdPassword` / `teamId` | Optional (macOS) | Notarization via `scripts/afterSign.js` |

### Variables

| Variable            | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `ENABLE_GPT_REVIEW` | Set to `true` to run GPT jobs from `pr-checks.yml` |

## Local packaging

```bash
pnpm install
pnpm --filter @pinterest-desktop/core exec playwright install chromium

pnpm dist:win    # Windows NSIS → apps/desktop/release/
pnpm dist:mac    # macOS DMG + zip
pnpm dist:linux  # AppImage
```

See [scripts/README.md](../scripts/README.md).

## Release flow

1. Bump `apps/desktop/package.json` version.
2. Commit and tag: `git tag v0.1.0 && git push origin v0.1.0`
3. `release.yml` builds per OS and uploads artifacts to the GitHub Release.

## Artifacts

| Platform | Typical files                                      |
| -------- | -------------------------------------------------- |
| Windows  | `Pinforge-*-Setup.exe`                             |
| macOS    | `.dmg`, `.zip` (zip required for electron-updater) |
| Linux    | `.AppImage`                                        |

## Troubleshooting

1. **Release upload empty** — Confirm `apps/desktop/release/` contains installers; check build logs for electron-builder errors.
2. **macOS notarization skipped** — Expected without Apple credentials; ad-hoc sign only.
3. **sharp / native module issues** — Ensure `asarUnpack` includes sharp/`@img`; see `scripts/afterPack.js`.
4. **Playwright fail at runtime** — Chromium is not bundled; run `playwright install chromium` for local/dev.

## Notes

- Package manager is **pnpm** (not bun/npm).
- App source lives under `apps/desktop/`, shared logic under `packages/core/`.
- User-facing copy and CI comments are **English**.
