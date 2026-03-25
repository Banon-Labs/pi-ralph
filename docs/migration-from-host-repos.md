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

Current canonical runtime path during the scaffold phase:
- `pi-ralph/src/pi-ralph-runtime.ts`

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

1. add the dedicated `pi-ralph` source to the host repo's Pi extension loading path
2. replace any copied runtime implementation with a tiny shim import/export
3. keep host-specific prompts in the host repo
4. run interactive tmux smoke test to verify command loading and widget behavior
5. remove stale duplicated runtime copies after the shim works
