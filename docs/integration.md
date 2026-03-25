# pi-ralph integration

Canonical runtime source:
- `pi-ralph/src/pi-ralph-runtime.ts`

Host-repo shim in Voice Forge:
- `.pi/extensions/pi-ralph-runtime.ts`

## Behavior summary

For each iteration, `pi-ralph`:
1. reads the inline prompt or prompt file
2. appends a supervisor contract
3. optionally snapshots a target file
4. runs `pi -p --no-session ...`
5. records output and loop-health metrics
6. either continues or accepts completion

## Target-file hardening

When a target file is configured, `pi-ralph` tracks:
- file existence
- raw and normalized hashes
- file size
- line count
- word count
- markdown headings when applicable
- approximate changed-line count
- unchanged streak
- low-delta streak

Completion with a target file requires:
- completion promise detected
- minimum iterations satisfied
- target file exists
- target file materially changed during the run

## UI behavior

`pi-ralph` uses a widget surface for live status.
The runtime intentionally avoids mirroring the same state into both widget and bottom status surfaces, which previously caused duplicate display in Pi.
