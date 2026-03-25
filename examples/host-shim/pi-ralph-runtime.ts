// Example host-repo shim for a sibling checkout layout such as:
//   ~/projects/voice-forge/.pi/extensions/pi-ralph-runtime.ts
//   ~/projects/pi-ralph/src/pi-ralph-runtime.ts
//
// If the host repo clones `pi-ralph` as a sibling under ~/projects,
// this relative import shape works from the host repo's `.pi/extensions/` dir.

export { default } from "../../../pi-ralph/src/pi-ralph-runtime";
