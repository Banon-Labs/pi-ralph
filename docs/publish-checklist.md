# publish checklist

This checklist is for moving `pi-ralph` from the in-repo extraction scaffold to a truly dedicated standalone repository/package.

## Goal state

- `pi-ralph` lives in its own repo
- the standalone repo owns the canonical runtime, README, docs, prompts, tests, and release process
- host repos such as Voice Forge keep only a thin extension shim plus host-specific workflow docs

## Repository shape

Recommended dedicated repo layout:

```text
pi-ralph/
  README.md
  package.json
  src/
    pi-ralph-runtime.ts
  docs/
    integration.md
    publish-checklist.md
    migration-from-host-repos.md
  examples/
    host-shim/
  tests/
```

## Move list

Move into the dedicated repo:
- `pi-ralph/src/pi-ralph-runtime.ts`
- `pi-ralph/README.md`
- `pi-ralph/package.json`
- `pi-ralph/AGENTS.md`
- `pi-ralph/CONTRIBUTING.md`
- `pi-ralph/LICENSE`
- `pi-ralph/.gitignore`
- `pi-ralph/examples/host-shim/pi-ralph-runtime.ts`
- `pi-ralph/docs/integration.md`
- `pi-ralph/docs/extraction-notes.md`
- `pi-ralph/docs/publish-checklist.md`
- `pi-ralph/docs/migration-from-host-repos.md`
- `pi-ralph/docs/first-external-commit-plan.md`

Keep in Voice Forge as host-specific assets:
- `.pi/extensions/pi-ralph-runtime.ts` (shim only)
- `docs/pi-ralph-integration.md`
- `docs/pi-ralph-hardening-prompt.md`
- `docs/ralph-objective-correlation-*.md`
- `docs/ralph-objective-correlation-runbook.md`
- `docs/ralph-whitepaper-prompt.md`

## Host shim target shape

Voice Forge should eventually keep only a tiny shim such as:

```ts
export { default } from "<installed-pi-ralph-package-or-local-vendor-path>";
```

If direct import from installed package is not supported by the host Pi environment, vendor a pinned copy under a third-party path and keep the shim stable.

## Pre-publish checks

- confirm the runtime no longer depends on Voice Forge-only paths
- separate generic Pi Ralph prompts from Voice Forge prompts
- add standalone tests for arg parsing, completion logic, target tracking, and UI update behavior where practical
- document install/update workflow for host repos
- choose versioning/release policy

## Voice Forge migration checks

After the dedicated repo exists:
1. update `.pi/extensions/pi-ralph-runtime.ts` to import from the dedicated source path
2. update `docs/pi-ralph-integration.md` to point at the dedicated repo URL
3. keep Voice Forge docs only for host-specific usage patterns
4. re-run interactive tmux smoke test in Voice Forge

## Smoke-test requirement after migration

In Voice Forge tmux:
- `/pi-ralph status`
- `/pi-ralph "Reply with COMPLETE and stop." --max-iterations 1 --completion-promise COMPLETE`
- verify the shim still loads the extracted runtime and the widget appears once
