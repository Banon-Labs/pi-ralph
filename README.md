# pi-ralph

`pi-ralph` is a Pi-native iterative supervisor loop extension.

It runs `pi` iteratively in print mode, tracks loop progress, and accepts completion only when the configured promise and any hardening checks pass.

## Purpose

`pi-ralph` now lives in its own dedicated repo so it can evolve as a reusable Pi extension rather than remaining tightly coupled to Voice Forge.

Current known host:
- canonical source: `src/pi-ralph-runtime.ts`
- Voice Forge adapter shim: `voice-forge/.pi/extensions/pi-ralph-runtime.ts`
- host repo: `https://github.com/Banon-Labs/voice-forge`

## Command

```text
/pi-ralph
```

Supported patterns:

```text
/pi-ralph status
/pi-ralph stop
/pi-ralph --prompt-file <path> --target-file <path> --max-iterations <n> --completion-promise <token>
/pi-ralph "<inline prompt>" --target-file <path> --max-iterations <n> --completion-promise <token>
```

## Features

- iterative `pi -p --no-session` worker supervision
- completion promise detection
- minimum/maximum iteration control
- target-file artifact tracking
- stagnation / low-delta detection
- widget-based live status in Pi UI
- status snapshots with recent history
- bundled shared web helpers for broader retrieval workflows:
  - `fetch_web` tool and `/fetch-web` command
  - `search_web` tool and `/search-web` command
  - `/authoritative-web` command

## Docs

- `docs/integration.md`
- `docs/extraction-notes.md`
- `docs/publish-checklist.md`
- `docs/migration-from-host-repos.md`
- `docs/first-external-commit-plan.md`

## Bundled web capability

This repo now vendors the shared Pi web helpers under `.pi/extensions/`:
- `.pi/extensions/web-content.ts`
- `.pi/extensions/web-search.ts`

These provide the same broader-web retrieval/search helpers used in the shared `~/projects/.pi/extensions/` workspace layer.

## Repo scaffolding

This scaffold now includes standalone-repo starter materials modeled after other Pi-oriented projects under `~/projects`, including:
- `package.json` with Pi package discovery fields
- `AGENTS.md`
- `CONTRIBUTING.md`
- `LICENSE`
- `examples/host-shim/pi-ralph-runtime.ts`

## Publication status

The dedicated GitHub repo now exists at:
- `https://github.com/Banon-Labs/pi-ralph`

Current host-consumption mode is:
- git-based sibling checkout under `~/projects/pi-ralph`
- host shim re-export from the host repo's `.pi/extensions/` directory

`pi-ralph` is not yet published as an npm package.

## Voice Forge-specific note

Voice Forge still contains repo-specific Ralph prompts and runbooks under `docs/`.
Those remain host-workflow assets rather than part of the generic `pi-ralph` core.
