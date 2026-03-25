# pi-ralph

`pi-ralph` is a Pi-native iterative supervisor loop extension.

It runs `pi` iteratively in print mode, tracks loop progress, and accepts completion only when the configured promise and any hardening checks pass.

## Purpose

This extracted project exists so `pi-ralph` can evolve as its own reusable unit rather than remaining tightly coupled to Voice Forge.

Current host in this repo:
- canonical source: `pi-ralph/src/pi-ralph-runtime.ts`
- Voice Forge adapter shim: `.pi/extensions/pi-ralph-runtime.ts`

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

## Docs

- `docs/integration.md`
- `docs/extraction-notes.md`
- `docs/publish-checklist.md`
- `docs/migration-from-host-repos.md`
- `docs/first-external-commit-plan.md`

## Repo scaffolding

This scaffold now includes standalone-repo starter materials modeled after other Pi-oriented projects under `~/projects`, including:
- `package.json` with Pi package discovery fields
- `AGENTS.md`
- `CONTRIBUTING.md`
- `LICENSE`
- `examples/host-shim/pi-ralph-runtime.ts`

## Publication status

This is currently an in-repo standalone scaffold, not yet a separately published repository/package.
The next migration step is to move this directory into its own dedicated repo and leave Voice Forge with only a host shim.

## Voice Forge-specific note

Voice Forge still contains repo-specific Ralph prompts and runbooks under `docs/`.
Those remain host-workflow assets rather than part of the generic `pi-ralph` core.
