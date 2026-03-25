# migration from host repos

This note explains how a host repo should consume `pi-ralph` once it is published separately.

## Host responsibilities

A host repo should provide:
- a thin extension entrypoint or shim
- host-specific prompt files
- host-specific runbooks
- host-specific examples and workflow conventions

A host repo should not own:
- the canonical Pi Ralph runtime logic
- generic supervisor-loop docs
- generic release/version policy for Pi Ralph

## Current Voice Forge state

Current shim:
- `.pi/extensions/pi-ralph-runtime.ts`

Current canonical runtime path:
- `~/projects/pi-ralph/src/pi-ralph-runtime.ts`

Current GitHub repo:
- `https://github.com/Banon-Labs/pi-ralph`

## Desired post-publish state

Voice Forge keeps:
- `.pi/extensions/pi-ralph-runtime.ts`
- `docs/pi-ralph-integration.md`
- Voice Forge-specific Ralph prompts/runbooks

Dedicated repo keeps:
- runtime source
- standalone README/docs
- tests/examples
- release/version history
- repo scaffolding such as AGENTS/CONTRIBUTING/LICENSE/package metadata

## Host migration recipe

Current recommended host-consumption mode is a sibling git checkout.

1. clone `https://github.com/Banon-Labs/pi-ralph` as a sibling repo, typically at `~/projects/pi-ralph`
2. add a tiny shim in the host repo's `.pi/extensions/` directory that re-exports from `../../../pi-ralph/src/pi-ralph-runtime`
3. keep host-specific prompts in the host repo
4. run interactive tmux smoke test to verify command loading and widget behavior
5. remove stale duplicated runtime copies after the shim works

Package-install consumption can be added later once `pi-ralph` is published as an installable package.
