# Contributing to pi-ralph

## Principle

Understand the runtime you change.
If you cannot explain how a Pi Ralph change affects iteration control, completion acceptance, target tracking, or UI behavior, the change is not ready.

## Scope guidance

`pi-ralph` should stay small and reusable.
Generic supervisor-loop behavior belongs here.
Host-specific prompts, runbooks, and workflow doctrine belong in host repos.

## Before submitting changes

At minimum:

```bash
pytest -q || true
```

And in a host repo with a shim wired up, run an interactive tmux smoke test for:
- `/pi-ralph status`
- a one-iteration completion smoke
- any UI/widget behavior changed by the patch

## Change review checklist

- does the runtime stay host-agnostic?
- does the shim model still work?
- are docs updated if behavior changed?
- is migration impact on host repos explicit?
- is interactive smoke evidence captured?
