# GitHub Workflows

Pinforge CI helpers. All bot comments and docs are English.

## Layout

```
.github/
├── actions/                 # Composite actions for GPT workflows
│   ├── gather-pr-diff/
│   ├── read-file-contents/
│   └── call-openai/
└── workflows/
    ├── pr-checks.yml        # Format + typecheck (+ optional GPT)
    ├── build-manual.yml     # Manual multi-platform builds
    ├── release.yml          # Tag → GitHub Release assets
    ├── gpt-review.yml
    ├── gpt-pr-assessment.yml
    ├── issue-triage.yml
    └── discussion-triage.yml
```

## GPT workflows

| | GPT Review | GPT PR Assessment |
| --- | --- | --- |
| Purpose | Code quality (bugs, security, process boundaries) | Maintainer merge priority |
| Trigger | PR checks when `ENABLE_GPT_REVIEW=true`, or manual | Same; also external contributors after quality |
| Output | PR review | PR comment (updated in place) |
| Language | English only | English only |

Requires secret `OPENAI_API_KEY`.

### Composite actions

1. **gather-pr-diff** — Diff + changed file list  
2. **read-file-contents** — Prioritized file bodies for cross-file analysis  
3. **call-openai** — Chat Completions with retries  

File read priority (high → low):

1. `packages/core/` — providers, download, enhance  
2. `apps/desktop/src/process/`, `apps/desktop/src/index.ts` — main process  
3. `apps/desktop/src/preload/`  
4. `apps/desktop/src/common/`  
5. `apps/desktop/src/renderer/`  
6. Other `.ts`/`.tsx`  
7. Remaining files  

## Manual build

Actions → **Manual Build** → pick platform (`windows-x64`, `macos-arm64`, `macos-x64`, `linux-x64`, or `all`).

Artifacts upload as `pinforge-<platform>`.

## Releases

Push a `v*` tag (for example `v0.1.0`). `release.yml` runs `scripts/build-with-builder.js` and uploads installers via `softprops/action-gh-release`.

## Changing GPT behavior

- Model / retries: `.github/actions/call-openai/action.yml`
- File priority: `.github/actions/read-file-contents/action.yml`
- Review prompt: `gpt-review.yml` → Construct GPT prompts
- Assessment prompt: `gpt-pr-assessment.yml` → Construct GPT prompts
