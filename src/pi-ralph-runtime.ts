import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type PiRalphCommandContext = {
  cwd: string;
  ui: {
    notify: (message: string, level: "info" | "success" | "warning" | "error") => void;
    setStatus: (id: string, text: string) => void;
    setWidget?: (id: string, lines: string[]) => void;
  };
};

type PiRalphOptions = {
  prompt?: string;
  promptFile?: string;
  minIterations: number;
  maxIterations?: number;
  completionPromise: string;
  model?: string;
  thinking?: string;
  tools?: string;
  appendSystemPrompt?: string;
  targetFile?: string;
};

type TargetFileSnapshot = {
  path: string;
  exists: boolean;
  rawHash: string | null;
  normalizedHash: string | null;
  size: number;
  lineCount: number;
  wordCount: number;
  headings: string[];
  rawContent: string | null;
  normalizedContent: string | null;
};

type TargetChangeSummary = {
  path: string;
  changed: boolean;
  normalizedChanged: boolean;
  changedLineCount: number;
  headingChanged: boolean;
  existenceChanged: boolean;
  lowDelta: boolean;
  meaningfulChange: boolean;
  previous: TargetFileSnapshot;
  current: TargetFileSnapshot;
};

type IterationHistoryItem = {
  iteration: number;
  exitCode: number | null;
  durationMs: number;
  promiseDetected: boolean;
  targetChange?: TargetChangeSummary;
  completionRejectedReasons?: string[];
};

type RunningPiRalph = {
  cwd: string;
  startedAt: number;
  iteration: number;
  iterationStartedAt?: number;
  options: PiRalphOptions;
  cancelled: boolean;
  currentProc?: ChildProcessWithoutNullStreams;
  workerPid?: number;
  workerState: "starting" | "waiting_for_first_output" | "actively_receiving_output" | "finished_iteration";
  lastOutputAt?: number;
  lastStream?: "stdout" | "stderr";
  stdoutBytes: number;
  stderrBytes: number;
  stdoutLineCount: number;
  stderrLineCount: number;
  recentLines: string[];
  currentOutput: string;
  history: IterationHistoryItem[];
  initialTargetState?: TargetFileSnapshot;
  latestTargetState?: TargetFileSnapshot;
  lastTargetChange?: TargetChangeSummary;
  lastMeaningfulChangeIteration?: number;
  unchangedStreak: number;
  lowDeltaStreak: number;
  hasMaterialTargetChange: boolean;
  heartbeat?: ReturnType<typeof setInterval>;
};

const COMMAND_NAME = "pi-ralph";
const STATUS_WIDGET_ID = "pi-ralph";
const MAX_RECENT_LINES = 20;
const DEFAULT_COMPLETION_PROMISE = "COMPLETE";
const DEFAULT_TOOLS = "read,bash,edit,write,grep,find,ls";
const DEFAULT_MIN_ITERATIONS = 1;
const LOW_DELTA_LINE_THRESHOLD = 3;
const STREAK_WARNING_THRESHOLD = 2;

function getPiBinary(): string {
  return process.env.PI_RALPH_BINARY ?? "pi";
}

function hashText(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeText(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .trim();
}

function extractMarkdownHeadings(filePath: string, content: string): string[] {
  const extension = extname(filePath).toLowerCase();
  if (![".md", ".markdown", ".mdx"].includes(extension)) return [];
  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^\s{0,3}(#{1,6})\s+(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => `${match[1]} ${match[2].trim()}`);
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.split(/\r?\n/).length;
}

function countWords(content: string): number {
  return content.match(/\S+/g)?.length ?? 0;
}

function captureTargetFileState(targetPath: string): TargetFileSnapshot {
  if (!existsSync(targetPath)) {
    return {
      path: targetPath,
      exists: false,
      rawHash: null,
      normalizedHash: null,
      size: 0,
      lineCount: 0,
      wordCount: 0,
      headings: [],
      rawContent: null,
      normalizedContent: null,
    };
  }

  const rawContent = readFileSync(targetPath, "utf8");
  const normalizedContent = normalizeText(rawContent);
  const stats = statSync(targetPath);
  return {
    path: targetPath,
    exists: true,
    rawHash: hashText(rawContent),
    normalizedHash: hashText(normalizedContent),
    size: stats.size,
    lineCount: countLines(rawContent),
    wordCount: countWords(rawContent),
    headings: extractMarkdownHeadings(targetPath, rawContent),
    rawContent,
    normalizedContent,
  };
}

function approxChangedLineCount(previousContent: string | null, currentContent: string | null): number {
  const before = previousContent?.split("\n") ?? [];
  const after = currentContent?.split("\n") ?? [];
  const max = Math.max(before.length, after.length);
  let changed = 0;
  for (let index = 0; index < max; index += 1) {
    if ((before[index] ?? "") !== (after[index] ?? "")) changed += 1;
  }
  return changed;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function summarizeHash(hash: string | null): string {
  return hash ? hash.slice(0, 12) : "missing";
}

function summarizeHeadings(headings: string[]): string {
  if (headings.length === 0) return "(none)";
  return headings.join(" | ");
}

function summarizeTargetSnapshot(snapshot?: TargetFileSnapshot): string {
  if (!snapshot) return "target: not configured";
  if (!snapshot.exists) return `target: ${snapshot.path} (missing)`;
  const headingSuffix = snapshot.headings.length > 0 ? ` headings=${snapshot.headings.length}` : "";
  return `target: ${snapshot.path} size=${snapshot.size}B lines=${snapshot.lineCount} words=${snapshot.wordCount} raw=${summarizeHash(snapshot.rawHash)} norm=${summarizeHash(snapshot.normalizedHash)}${headingSuffix}`;
}

function computeTargetChange(previous: TargetFileSnapshot, current: TargetFileSnapshot): TargetChangeSummary {
  const existenceChanged = previous.exists !== current.exists;
  const changed = previous.rawHash !== current.rawHash || existenceChanged;
  const normalizedChanged = previous.normalizedHash !== current.normalizedHash || existenceChanged;
  const headingChanged = !arraysEqual(previous.headings, current.headings);
  const changedLineCount = approxChangedLineCount(previous.normalizedContent, current.normalizedContent);
  const lowDelta = normalizedChanged && !headingChanged && !existenceChanged && changedLineCount < LOW_DELTA_LINE_THRESHOLD;
  const meaningfulChange = normalizedChanged || headingChanged || existenceChanged;

  return {
    path: current.path,
    changed,
    normalizedChanged,
    changedLineCount,
    headingChanged,
    existenceChanged,
    lowDelta,
    meaningfulChange,
    previous,
    current,
  };
}

function formatTargetChangeSummary(change?: TargetChangeSummary): string {
  if (!change) return "target change: not tracked";
  return [
    `target file: ${change.path}`,
    `changed: ${change.changed ? "yes" : "no"}`,
    `normalized changed: ${change.normalizedChanged ? "yes" : "no"}`,
    `changed lines: ${change.changedLineCount}`,
    `heading structure changed: ${change.headingChanged ? "yes" : "no"}`,
    `headings: ${summarizeHeadings(change.previous.headings)} -> ${summarizeHeadings(change.current.headings)}`,
    `existence changed: ${change.existenceChanged ? "yes" : "no"}`,
    `low delta: ${change.lowDelta ? "yes" : "no"}`,
    `size bytes: ${change.previous.size} -> ${change.current.size}`,
    `line count: ${change.previous.lineCount} -> ${change.current.lineCount}`,
    `word count: ${change.previous.wordCount} -> ${change.current.wordCount}`,
    `raw hash: ${summarizeHash(change.previous.rawHash)} -> ${summarizeHash(change.current.rawHash)}`,
    `normalized hash: ${summarizeHash(change.previous.normalizedHash)} -> ${summarizeHash(change.current.normalizedHash)}`,
  ].join("\n");
}

function targetWarnings(running: RunningPiRalph): string[] {
  if (!running.options.targetFile) return [];
  const warnings: string[] = [];
  if (running.unchangedStreak >= STREAK_WARNING_THRESHOLD) {
    warnings.push(`warning: target normalized hash unchanged for ${running.unchangedStreak} consecutive iteration(s)`);
  }
  if (running.lowDeltaStreak >= STREAK_WARNING_THRESHOLD) {
    warnings.push(`warning: target low-delta streak is ${running.lowDeltaStreak} iteration(s) (< ${LOW_DELTA_LINE_THRESHOLD} changed lines)`);
  }
  return warnings;
}

function evaluateCompletion(running: RunningPiRalph, promisePresent: boolean): { accepted: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!promisePresent) reasons.push("completion promise not detected");
  if (running.iteration < running.options.minIterations) {
    reasons.push(`minimum iterations not yet satisfied (${running.iteration}/${running.options.minIterations})`);
  }

  if (running.options.targetFile) {
    if (!running.latestTargetState?.exists) {
      reasons.push(`target file does not exist: ${running.options.targetFile}`);
    }
    if (!running.hasMaterialTargetChange) {
      reasons.push(`target file has not changed materially during this run: ${running.options.targetFile}`);
    }
  }

  return { accepted: reasons.length === 0, reasons };
}

function formatDuration(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remain}s` : `${remain}s`;
}

function formatDurationMs(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remain}s` : `${remain}s`;
}

function currentSilenceDuration(running: RunningPiRalph): string {
  const anchor = running.lastOutputAt ?? running.iterationStartedAt ?? running.startedAt;
  return formatDuration(anchor);
}

function shellSplit(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (quote) throw new Error(`Unterminated ${quote} quote in arguments.`);
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function parseArgs(rawArgs: string, cwd: string): PiRalphOptions | "status" | "stop" | "help" {
  const trimmed = rawArgs.trim();
  if (!trimmed || trimmed === "status") return "status";
  if (trimmed === "stop" || trimmed === "cancel") return "stop";
  if (trimmed === "help" || trimmed === "--help" || trimmed === "-h") return "help";

  const tokens = shellSplit(trimmed);
  const options: PiRalphOptions = {
    minIterations: DEFAULT_MIN_ITERATIONS,
    completionPromise: DEFAULT_COMPLETION_PROMISE,
    tools: DEFAULT_TOOLS,
  };
  const positional: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = () => {
      const value = tokens[i + 1];
      if (value === undefined) throw new Error(`Missing value for ${token}`);
      i += 1;
      return value;
    };

    switch (token) {
      case "--prompt-file":
      case "--file":
      case "-f":
        options.promptFile = resolve(cwd, next());
        break;
      case "--target-file":
      case "--target":
        options.targetFile = resolve(cwd, next());
        break;
      case "--max-iterations": {
        const value = Number.parseInt(next(), 10);
        if (!Number.isFinite(value) || value < 0) throw new Error("--max-iterations must be >= 0");
        options.maxIterations = value === 0 ? undefined : value;
        break;
      }
      case "--min-iterations": {
        const value = Number.parseInt(next(), 10);
        if (!Number.isFinite(value) || value < 1) throw new Error("--min-iterations must be >= 1");
        options.minIterations = value;
        break;
      }
      case "--completion-promise":
        options.completionPromise = next();
        break;
      case "--model":
        options.model = next();
        break;
      case "--thinking":
        options.thinking = next();
        break;
      case "--tools":
        options.tools = next();
        break;
      case "--append-system-prompt":
        options.appendSystemPrompt = next();
        break;
      default:
        positional.push(token);
        break;
    }
  }

  if (options.promptFile && !existsSync(options.promptFile)) {
    throw new Error(`Prompt file not found: ${options.promptFile}`);
  }
  if (!options.promptFile && positional.length === 0) {
    throw new Error("Provide either a prompt string or --prompt-file <path>.");
  }
  if (options.promptFile && positional.length > 0) {
    throw new Error("Use either a prompt string or --prompt-file, not both.");
  }
  if (positional.length > 0) {
    options.prompt = positional.join(" ");
  }
  return options;
}

function readPrompt(options: PiRalphOptions): string {
  if (options.promptFile) return readFileSync(options.promptFile, "utf8");
  return options.prompt ?? "";
}

function buildIterationPrompt(basePrompt: string, options: PiRalphOptions, iteration: number): string {
  return [
    basePrompt.trim(),
    "",
    "Supervisor contract for this Pi Ralph loop iteration:",
    `- This is iteration ${iteration}${options.maxIterations ? ` of at most ${options.maxIterations}` : ""}.`,
    `- The completion promise token is: ${options.completionPromise}`,
    `- Only output exactly <promise>${options.completionPromise}</promise> if the task is genuinely complete.`,
    options.targetFile ? `- The supervisor is tracking this target file for real artifact progress: ${options.targetFile}` : "- No explicit target file is configured for artifact-level progress checks.",
    "- If a target file is configured, a promise alone is not enough: the file must exist and materially change during the run.",
    "- Work autonomously and make concrete repo-local progress when tools are available.",
    "- If blocked, explain the blocker clearly and specifically.",
  ].join("\n");
}

function pushRecentLines(running: RunningPiRalph, chunk: string, stream: "stdout" | "stderr") {
  const lines = chunk
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  for (const line of lines) {
    running.recentLines.push(`[${stream}] ${line}`);
    if (running.recentLines.length > MAX_RECENT_LINES) {
      running.recentLines.splice(0, running.recentLines.length - MAX_RECENT_LINES);
    }
  }
}

function updateUi(ctx: PiRalphCommandContext, running?: RunningPiRalph) {
  // Use the widget surface only. Mirroring the same state into setStatus()
  // causes Pi Ralph to appear twice in the UI: once above the prompt bar as
  // a widget and once again in the bottom status area.
  ctx.ui.setStatus(STATUS_WIDGET_ID, "");

  if (!running) {
    ctx.ui.setWidget?.(STATUS_WIDGET_ID, ["pi-ralph ready"]);
    return;
  }

  const targetLine = running.options.targetFile
    ? `target: ${running.lastTargetChange?.normalizedChanged ? "changed" : "steady"} • unchanged ${running.unchangedStreak} • low-delta ${running.lowDeltaStreak}`
    : "target: not configured";
  const workerLine = `worker: pid=${running.workerPid ?? "pending"} state=${running.workerState}`;
  const outputLine = `output: stdout=${running.stdoutLineCount}/${running.stdoutBytes}B stderr=${running.stderrLineCount}/${running.stderrBytes}B silence=${currentSilenceDuration(running)}`;
  ctx.ui.setWidget?.(STATUS_WIDGET_ID, [
    "pi-ralph running",
    `iteration: ${running.iteration}${running.options.maxIterations ? `/${running.options.maxIterations}` : ""}`,
    `elapsed: ${formatDuration(running.startedAt)}`,
    workerLine,
    outputLine,
    targetLine,
    `recent: ${running.recentLines.at(-1) ?? "none yet"}`,
  ]);
}

function buildStatusText(running?: RunningPiRalph): string {
  if (!running) {
    return [
      `pi binary: ${getPiBinary()}`,
      `default tools: ${DEFAULT_TOOLS}`,
      `default completion promise: ${DEFAULT_COMPLETION_PROMISE}`,
      "No active Pi Ralph loop.",
    ].join("\n");
  }

  const history = running.history.length > 0
    ? running.history.slice(-5).map((item) => {
      const targetPart = item.targetChange
        ? ` changed=${item.targetChange.changed ? "yes" : "no"} norm=${item.targetChange.normalizedChanged ? "yes" : "no"} lines=${item.targetChange.changedLineCount} heading=${item.targetChange.headingChanged ? "yes" : "no"}`
        : "";
      const rejectedPart = item.completionRejectedReasons && item.completionRejectedReasons.length > 0
        ? ` rejected=${item.completionRejectedReasons.join("; ")}`
        : "";
      return `#${item.iteration} ${formatDurationMs(item.durationMs)} exit=${item.exitCode ?? "null"} promise=${item.promiseDetected ? "yes" : "no"}${targetPart}${rejectedPart}`;
    }).join("\n")
    : "none yet";
  const recent = running.recentLines.length > 0 ? running.recentLines.slice(-8).join("\n") : "none yet";
  const warnings = targetWarnings(running);
  const recentHashes = running.history
    .filter((item) => item.targetChange)
    .slice(-3)
    .map((item) => {
      const change = item.targetChange as TargetChangeSummary;
      return `#${item.iteration} raw ${summarizeHash(change.previous.rawHash)} -> ${summarizeHash(change.current.rawHash)} | norm ${summarizeHash(change.previous.normalizedHash)} -> ${summarizeHash(change.current.normalizedHash)} | lines=${change.changedLineCount} | size=${change.previous.size}->${change.current.size} | words=${change.previous.wordCount}->${change.current.wordCount}${change.headingChanged ? ` | headings=${summarizeHeadings(change.previous.headings)} -> ${summarizeHeadings(change.current.headings)}` : ""}`;
    })
    .join("\n") || "none yet";

  return [
    `Pi Ralph running for ${formatDuration(running.startedAt)}`,
    `cwd: ${running.cwd}`,
    `iteration: ${running.iteration}${running.options.maxIterations ? `/${running.options.maxIterations}` : ""}`,
    `iteration state: ${running.workerState === "waiting_for_first_output" ? "waiting for first output" : running.workerState === "actively_receiving_output" ? "actively receiving output" : running.workerState}`,
    `worker pid: ${running.workerPid ?? "pending"}`,
    `iteration started: ${running.iterationStartedAt ? new Date(running.iterationStartedAt).toISOString() : "unknown"}`,
    `last output timestamp: ${running.lastOutputAt ? new Date(running.lastOutputAt).toISOString() : "none yet"}`,
    `last output stream: ${running.lastStream ?? "none yet"}`,
    `silence duration: ${currentSilenceDuration(running)}`,
    `stdout lines/bytes: ${running.stdoutLineCount}/${running.stdoutBytes}`,
    `stderr lines/bytes: ${running.stderrLineCount}/${running.stderrBytes}`,
    `completion promise: ${running.options.completionPromise}`,
    `prompt file: ${running.options.promptFile ?? "(inline prompt)"}`,
    `model: ${running.options.model ?? "default"}`,
    `target file: ${running.options.targetFile ?? "(not configured)"}`,
    `target current state: ${summarizeTargetSnapshot(running.latestTargetState)}`,
    `changed this iteration: ${running.lastTargetChange ? (running.lastTargetChange.changed ? "yes" : "no") : "n/a"}`,
    `normalized change this iteration: ${running.lastTargetChange ? (running.lastTargetChange.normalizedChanged ? "yes" : "no") : "n/a"}`,
    `last meaningful change iteration: ${running.lastMeaningfulChangeIteration ?? "none yet"}`,
    `unchanged streak: ${running.unchangedStreak}`,
    `low-delta streak: ${running.lowDeltaStreak}`,
    `low-delta threshold: < ${LOW_DELTA_LINE_THRESHOLD} changed lines`,
    `material target change seen this run: ${running.hasMaterialTargetChange ? "yes" : "no"}`,
    `current headings: ${summarizeHeadings(running.latestTargetState?.headings ?? [])}`,
    "",
    `recent diff/hash summary:\n${recentHashes}`,
    warnings.length > 0 ? `\nloop-health warnings:\n${warnings.join("\n")}` : "\nloop-health warnings:\nnone",
    "",
    `recent iterations:\n${history}`,
    "",
    `recent output:\n${recent}`,
  ].join("\n");
}

async function runOneIteration(pi: ExtensionAPI, running: RunningPiRalph, options: PiRalphOptions, iterationPrompt: string): Promise<{ output: string; exitCode: number | null }> {
  return new Promise((resolvePromise, reject) => {
    running.workerState = "starting";
    running.lastOutputAt = undefined;
    running.lastStream = undefined;
    running.stdoutBytes = 0;
    running.stderrBytes = 0;
    running.stdoutLineCount = 0;
    running.stderrLineCount = 0;
    running.iterationStartedAt = Date.now();
    const args = ["-p", "--no-session", "--tools", options.tools ?? DEFAULT_TOOLS];
    if (options.model) args.push("--model", options.model);
    if (options.thinking) args.push("--thinking", options.thinking);
    if (options.appendSystemPrompt) args.push("--append-system-prompt", options.appendSystemPrompt);
    args.push(iterationPrompt);

    const proc = spawn(getPiBinary(), args, {
      cwd: running.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    running.currentProc = proc;
    running.workerPid = proc.pid;
    running.workerState = "waiting_for_first_output";
    let combined = "";

    proc.stdout.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      combined += text;
      running.workerState = "actively_receiving_output";
      running.lastOutputAt = Date.now();
      running.lastStream = "stdout";
      running.stdoutBytes += Buffer.byteLength(text);
      running.stdoutLineCount += text.split(/\r?\n/).filter((line) => line.length > 0).length;
      pushRecentLines(running, text, "stdout");
    });

    proc.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      combined += text;
      running.workerState = "actively_receiving_output";
      running.lastOutputAt = Date.now();
      running.lastStream = "stderr";
      running.stderrBytes += Buffer.byteLength(text);
      running.stderrLineCount += text.split(/\r?\n/).filter((line) => line.length > 0).length;
      pushRecentLines(running, text, "stderr");
    });

    proc.on("error", (error) => {
      running.currentProc = undefined;
      running.workerState = "finished_iteration";
      reject(error);
    });

    proc.on("close", (code) => {
      running.currentProc = undefined;
      running.workerState = "finished_iteration";
      running.currentOutput = combined.trim();
      resolvePromise({ output: running.currentOutput, exitCode: code });
    });
  });
}

function promiseDetected(output: string, completionPromise: string): boolean {
  const escaped = completionPromise.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagged = new RegExp(`<promise>\\s*${escaped}\\s*</promise>`, "i");
  return tagged.test(output);
}

export default function piRalphRuntime(pi: ExtensionAPI) {
  let running: RunningPiRalph | undefined;

  function stopHeartbeat() {
    if (running?.heartbeat) {
      clearInterval(running.heartbeat);
      running.heartbeat = undefined;
    }
  }

  function startHeartbeat(commandCtx: PiRalphCommandContext) {
    stopHeartbeat();
    if (!running) return;
    running.heartbeat = setInterval(() => {
      if (!running) {
        stopHeartbeat();
        return;
      }
      updateUi(commandCtx, running);
    }, 1000);
  }

  async function startLoop(commandCtx: PiRalphCommandContext, options: PiRalphOptions) {
    const initialTargetState = options.targetFile ? captureTargetFileState(options.targetFile) : undefined;
    running = {
      cwd: commandCtx.cwd,
      startedAt: Date.now(),
      iteration: 0,
      iterationStartedAt: undefined,
      options,
      cancelled: false,
      recentLines: [],
      currentOutput: "",
      history: [],
      initialTargetState,
      latestTargetState: initialTargetState,
      unchangedStreak: 0,
      lowDeltaStreak: 0,
      hasMaterialTargetChange: false,
      workerState: "starting",
      lastOutputAt: undefined,
      lastStream: undefined,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutLineCount: 0,
      stderrLineCount: 0,
    };
    updateUi(commandCtx, running);
    startHeartbeat(commandCtx);
    pi.sendMessage({
      customType: COMMAND_NAME,
      content: `Started Pi Ralph in background.\n\n${options.promptFile ? `prompt file: ${options.promptFile}` : "inline prompt"}\ncompletion promise: ${options.completionPromise}\nmax iterations: ${options.maxIterations ?? "unlimited"}\ntarget file: ${options.targetFile ?? "(not configured)"}\n${options.targetFile ? `${summarizeTargetSnapshot(initialTargetState)}` : ""}\n\nUse /pi-ralph status to inspect progress or /pi-ralph stop to interrupt.`,
      display: true,
    });
    commandCtx.ui.notify("Pi Ralph started in background", "success");

    const basePrompt = readPrompt(options);

    while (running && !running.cancelled) {
      const nextIteration = running.iteration + 1;
      if (options.maxIterations !== undefined && nextIteration > options.maxIterations) {
        break;
      }
      running.iteration = nextIteration;
      updateUi(commandCtx, running);
      const iterationStartedAt = Date.now();
      const iterationPrompt = buildIterationPrompt(basePrompt, options, running.iteration);

      let result: { output: string; exitCode: number | null };
      try {
        result = await runOneIteration(pi, running, options, iterationPrompt);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pi.sendMessage({ customType: COMMAND_NAME, content: `Pi Ralph iteration ${running.iteration} failed to start\n${message}`, display: true });
        commandCtx.ui.notify(`Pi Ralph failed: ${message}`, "error");
        stopHeartbeat();
        running = undefined;
        updateUi(commandCtx, undefined);
        return;
      }

      const detected = promiseDetected(result.output, options.completionPromise);
      const durationMs = Date.now() - iterationStartedAt;
      const previousTargetState = options.targetFile ? (running.latestTargetState ?? captureTargetFileState(options.targetFile)) : undefined;
      const currentTargetState = options.targetFile ? captureTargetFileState(options.targetFile) : undefined;
      const targetChange = previousTargetState && currentTargetState
        ? computeTargetChange(previousTargetState, currentTargetState)
        : undefined;

      if (targetChange) {
        running.latestTargetState = currentTargetState;
        running.lastTargetChange = targetChange;
        running.unchangedStreak = targetChange.normalizedChanged ? 0 : running.unchangedStreak + 1;
        running.lowDeltaStreak = targetChange.lowDelta ? running.lowDeltaStreak + 1 : 0;
        if (targetChange.meaningfulChange) {
          running.hasMaterialTargetChange = true;
          running.lastMeaningfulChangeIteration = running.iteration;
        }
      }

      const completion = evaluateCompletion(running, detected);
      const completionRejectedReasons = detected && !completion.accepted ? completion.reasons : undefined;
      running.history.push({
        iteration: running.iteration,
        exitCode: result.exitCode,
        durationMs,
        promiseDetected: detected,
        targetChange,
        completionRejectedReasons,
      });
      pi.sendMessage({
        customType: COMMAND_NAME,
        content: [
          `Pi Ralph iteration ${running.iteration} finished.`,
          `elapsed: ${formatDurationMs(durationMs)}`,
          `exit: ${result.exitCode ?? "null"}`,
          `promise detected: ${detected ? "yes" : "no"}`,
          ...(targetChange ? ["", formatTargetChangeSummary(targetChange)] : []),
          ...(completionRejectedReasons ? ["", `completion rejected: ${completionRejectedReasons.join("; ")}`] : []),
          "",
          result.output || "(no output)",
        ].join("\n"),
        display: true,
      });
      updateUi(commandCtx, running);

      if (completion.accepted) {
        const completed = running;
        pi.sendMessage({
          customType: COMMAND_NAME,
          content: `Pi Ralph complete after ${completed.iteration} iteration(s) and ${formatDuration(completed.startedAt)}. Completion promise detected: ${options.completionPromise}`,
          display: true,
        });
        commandCtx.ui.notify("Pi Ralph detected completion promise", "success");
        stopHeartbeat();
        running = undefined;
        updateUi(commandCtx, undefined);
        return;
      }

      if (detected && completionRejectedReasons) {
        commandCtx.ui.notify(`Pi Ralph rejected completion: ${completionRejectedReasons.join("; ")}`, "warning");
      }
    }

    if (running) {
      const finished = running;
      const reason = finished.cancelled ? "cancelled" : `max iterations reached${finished.options.maxIterations ? ` (${finished.options.maxIterations})` : ""}`;
      pi.sendMessage({
        customType: COMMAND_NAME,
        content: `Pi Ralph stopped after ${finished.iteration} iteration(s) and ${formatDuration(finished.startedAt)}. Reason: ${reason}.`,
        display: true,
      });
      commandCtx.ui.notify(`Pi Ralph stopped: ${reason}`, finished.cancelled ? "warning" : "info");
      stopHeartbeat();
      running = undefined;
      updateUi(commandCtx, undefined);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    updateUi(ctx as PiRalphCommandContext, running);
  });

  pi.registerCommand(COMMAND_NAME, {
    description: "Run a Pi-native Ralph-style supervisor loop with completion-promise detection",
    handler: async (rawArgs, ctx) => {
      const commandCtx = ctx as PiRalphCommandContext;
      let parsed: PiRalphOptions | "status" | "stop" | "help";
      try {
        parsed = parseArgs(rawArgs, ctx.cwd);
      } catch (error) {
        commandCtx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
        return;
      }

      if (parsed === "help") {
        pi.sendMessage({
          customType: COMMAND_NAME,
          content: [
            "Usage:",
            "/pi-ralph status",
            "/pi-ralph stop",
            "/pi-ralph --prompt-file docs/ralph-whitepaper-prompt.md --target-file docs/whitepaper.md --max-iterations 8 --completion-promise WHITEPAPER_SOLID",
            "/pi-ralph \"Do the task. Output <promise>DONE</promise> only when complete.\" --target-file tmp-pi-ralph-smoke.txt --max-iterations 5 --completion-promise DONE",
            "",
            "Options:",
            "--prompt-file <path>",
            "--target-file <path>",
            "--min-iterations <n>",
            "--max-iterations <n>   (0 means unlimited)",
            "--completion-promise <text>",
            "--model <provider/model>",
            "--thinking <level>",
            `--tools <csv>          (default: ${DEFAULT_TOOLS})`,
            "--append-system-prompt <text>",
          ].join("\n"),
          display: true,
        });
        return;
      }

      if (parsed === "status") {
        const status = buildStatusText(running);
        commandCtx.ui.notify(running ? `Pi Ralph is running (${formatDuration(running.startedAt)})` : "No active Pi Ralph loop", "info");
        pi.sendMessage({ customType: COMMAND_NAME, content: status, display: true });
        updateUi(commandCtx, running);
        return;
      }

      if (parsed === "stop") {
        if (!running) {
          commandCtx.ui.notify("No Pi Ralph loop is currently running.", "warning");
          return;
        }
        running.cancelled = true;
        running.currentProc?.kill("SIGINT");
        commandCtx.ui.notify("Sent SIGINT to the active Pi Ralph iteration.", "warning");
        return;
      }

      if (running) {
        commandCtx.ui.notify("A Pi Ralph loop is already running. Use /pi-ralph status or /pi-ralph stop.", "warning");
        return;
      }

      startLoop(commandCtx, parsed).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        pi.sendMessage({ customType: COMMAND_NAME, content: `Pi Ralph crashed\n${message}`, display: true });
        commandCtx.ui.notify(`Pi Ralph crashed: ${message}`, "error");
        stopHeartbeat();
        running = undefined;
        updateUi(commandCtx, undefined);
      });
    },
  });
}
