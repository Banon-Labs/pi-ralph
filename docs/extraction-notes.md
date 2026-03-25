# extraction notes

This directory is the first standalone extraction pass for `pi-ralph`.

## Included here

- canonical runtime source
- standalone README
- generic integration notes
- standalone package metadata with Pi package discovery fields
- starter repo scaffolding (`AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`, `.gitignore`)
- host-shim example under `examples/host-shim/`

## Still host-specific in Voice Forge

These files remain in Voice Forge because they are tied to repo-local workflows rather than the generic `pi-ralph` core:
- `docs/pi-ralph-integration.md`
- `docs/pi-ralph-hardening-prompt.md`
- `docs/ralph-objective-correlation-*.md`
- `docs/ralph-objective-correlation-runbook.md`
- `docs/ralph-whitepaper-prompt.md`

## Next extraction steps

1. separate generic prompts from Voice Forge prompts
2. create a dedicated repo for `pi-ralph`
3. move the canonical files listed in `docs/publish-checklist.md`
4. update install instructions to point at the dedicated repo/package
5. leave only a thin adapter shim in host repos
