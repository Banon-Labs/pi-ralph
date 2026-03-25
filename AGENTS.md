# pi-ralph scoped instructions

The repository-root `/home/choza/projects/voice-forge/AGENTS.md` remains the canonical shared contract.
This file is a scoped supplement for the `pi-ralph/` subtree and should be carried forward into the dedicated repo as a starting point.

## Purpose

`pi-ralph` is a reusable Pi-native supervisor-loop extension, not a Voice Forge-specific workflow bundle.
Keep generic runtime logic, docs, tests, and examples here.
Keep host-specific prompts and runbooks in host repos.

## Scaffolding posture

Prefer the conventions already visible in sibling Pi-oriented projects under `~/projects`, especially:
- package metadata with `pi` extension discovery fields
- small host shims instead of runtime duplication
- explicit docs for integration and migration
- reusable examples instead of repo-local assumptions

## Runtime change rules

- Keep the canonical runtime in `src/pi-ralph-runtime.ts`.
- Treat host-repo extension files as adapter shims only.
- Favor minimal core behavior; host-specific workflow policy belongs outside the generic runtime.
- Preserve interactive tmux smoke evidence for UI/runtime changes.

## Publication goal

This subtree is a staging scaffold for a dedicated `pi-ralph` repo.
When adding files, prefer structures that can move cleanly into a standalone repo without Voice Forge-specific assumptions.
