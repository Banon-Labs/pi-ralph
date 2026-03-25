# first external repo commit plan

This is the concrete first-commit plan for creating the dedicated external `pi-ralph` repository from the current in-repo scaffold.

## Objective

Create a new standalone `pi-ralph` repository that starts with:
- the canonical runtime
- reusable Pi package scaffolding
- generic docs
- host-shim example

Leave Voice Forge with:
- the thin shim at `.pi/extensions/pi-ralph-runtime.ts`
- Voice Forge-specific Ralph prompts/runbooks/docs

## Recommended new repo path during bootstrap

Example local bootstrap path before pushing anywhere:

```bash
cd /home/choza/projects
mkdir -p ./pi-ralph
```

## Exact initial file set for commit 1

Copy these files from `voice-forge/pi-ralph/` into the new repo unchanged for the first commit:

```text
AGENTS.md
CONTRIBUTING.md
LICENSE
.gitignore
README.md
package.json
src/pi-ralph-runtime.ts
docs/integration.md
docs/extraction-notes.md
docs/publish-checklist.md
docs/migration-from-host-repos.md
examples/host-shim/pi-ralph-runtime.ts
```

## Exact first-commit directory tree

```text
pi-ralph/
  AGENTS.md
  CONTRIBUTING.md
  LICENSE
  README.md
  package.json
  .gitignore
  src/
    pi-ralph-runtime.ts
  docs/
    integration.md
    extraction-notes.md
    publish-checklist.md
    migration-from-host-repos.md
    first-external-commit-plan.md
  examples/
    host-shim/
      pi-ralph-runtime.ts
```

## Bootstrap copy commands

From `~/projects`:

```bash
cd /home/choza/projects
mkdir -p pi-ralph/{src,docs,examples/host-shim}
cp voice-forge/pi-ralph/AGENTS.md pi-ralph/
cp voice-forge/pi-ralph/CONTRIBUTING.md pi-ralph/
cp voice-forge/pi-ralph/LICENSE pi-ralph/
cp voice-forge/pi-ralph/.gitignore pi-ralph/
cp voice-forge/pi-ralph/README.md pi-ralph/
cp voice-forge/pi-ralph/package.json pi-ralph/
cp voice-forge/pi-ralph/src/pi-ralph-runtime.ts pi-ralph/src/
cp voice-forge/pi-ralph/docs/integration.md pi-ralph/docs/
cp voice-forge/pi-ralph/docs/extraction-notes.md pi-ralph/docs/
cp voice-forge/pi-ralph/docs/publish-checklist.md pi-ralph/docs/
cp voice-forge/pi-ralph/docs/migration-from-host-repos.md pi-ralph/docs/
cp voice-forge/pi-ralph/docs/first-external-commit-plan.md pi-ralph/docs/
cp voice-forge/pi-ralph/examples/host-shim/pi-ralph-runtime.ts pi-ralph/examples/host-shim/
```

## Recommended first commit message

```text
Initial standalone pi-ralph scaffold
```

## New repo immediate follow-up edits after copy

Before or immediately after the first commit, update these placeholders:

1. `README.md`
   - replace Voice Forge extraction language with standalone repo language
   - add real install instructions once the repo URL exists

2. `docs/extraction-notes.md`
   - change from extraction-phase language to migration-history note

3. `examples/host-shim/pi-ralph-runtime.ts`
   - replace the relative dev-path example with the real published-consumption example once package/install path is known

4. `package.json`
   - flip `private` to `false` only when publish-ready
   - add repository URL once created
   - add versioning/release scripts if desired

## Voice Forge post-move edits

After the external repo exists, make these changes in Voice Forge:

### 1. Repoint the shim

Current shim:

```ts
export { default } from "../../pi-ralph/src/pi-ralph-runtime";
```

Target shape after externalization:

```ts
export { default } from "<installed-pi-ralph-package-or-vendored-path>";
```

### 2. Update docs

Update:
- `docs/pi-ralph-integration.md`
- `README.md`
- any Ralph prompt/runbook docs that should point at the dedicated repo

### 3. Keep only host-specific assets in Voice Forge

Do not move these into the generic repo as-is:
- `docs/pi-ralph-hardening-prompt.md`
- `docs/ralph-objective-correlation-aggressive-prompt.md`
- `docs/ralph-objective-correlation-strict-prompt.md`
- `docs/ralph-objective-correlation-runbook.md`
- `docs/ralph-whitepaper-prompt.md`

These are host/workflow-specific.

## First validation pass in the new repo

Once the new repo exists locally, validate:

```bash
cd /home/choza/projects/pi-ralph
ls
```

Verify the expected files exist.

## Host validation pass in Voice Forge after repointing the shim

Required tmux smoke in Voice Forge:

```text
/pi-ralph status
/pi-ralph "Reply with COMPLETE and stop." --max-iterations 1 --completion-promise COMPLETE
```

Expected proof:
- `[pi-ralph]`
- `pi binary: pi`
- `No active Pi Ralph loop.`
- `Started Pi Ralph in background.`
- `pi-ralph running`

## Recommended second-phase issues in the new repo

After repo creation, open or track:
1. add standalone tests for arg parsing and completion logic
2. split generic prompts from host prompts
3. define install/update instructions for host repos
4. decide release/version policy

## Notes on workspace policy

This plan intentionally follows the reusable scaffolding patterns seen in sibling Pi-oriented projects under `~/projects`, including:
- package-level `pi` discovery metadata
- scoped `AGENTS.md`
- contribution guidance
- explicit host-shim example
- migration docs rather than implicit assumptions
