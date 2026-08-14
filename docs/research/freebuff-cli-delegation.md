# Freebuff CLI delegation research

Date: 2026-08-14

## Executive summary

Freebuff is currently an interactive OpenTUI application. Its public CLI
surface is intentionally small: `--help`, `--version`, `--continue`, `--cwd`,
and the `login` command. In particular, the Freebuff build does not accept a
prompt positional argument, an agent override, or a model flag
(`cli/src/cli-args.ts:50-67`, `cli/src/cli-args.ts:121-133`). The upstream
Codebuff build has prompt arguments and `--agent`, but those options are inside
the non-Freebuff branch (`cli/src/cli-args.ts:69-101`).

The SDK already provides the core delegation contract. `CodebuffClient.run()`
accepts an `agent` and `prompt` and resolves to a `RunState`
(`sdk/src/run.ts:166-203`, `sdk/src/client.ts:38-60`). `RunState.output` is
schema-validated and can be `structuredOutput`, `lastMessage`, `allMessages`,
or `error` (`sdk/src/run-state.ts:60-64`,
`common/src/types/session-state.ts:54-77`). The CLI currently consumes this
result to update the TUI and persist chat state; it does not emit a final
machine-readable result to stdout (`cli/src/hooks/use-send-message.ts:636-676`,
`cli/src/hooks/helpers/send-message.ts:384-487`).

The cleanest change is therefore a separate headless runner/command that
reuses the SDK and Freebuff session/model routing, rather than trying to drive
the OpenTUI application with piped input.

## Current command-line surface

### Freebuff build

Commander defines the Freebuff program as follows:

| Syntax                                  | Meaning                                                         | Source                                                       |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `freebuff --help` / `-h`                | Print help and exit                                             | `cli/src/cli-args.ts:53-67`                                  |
| `freebuff --version` / `-v`             | Print the compiled version and exit                             | `cli/src/cli-args.ts:55-56`                                  |
| `freebuff --continue [conversation-id]` | Resume the most recent conversation, or a selected conversation | `cli/src/cli-args.ts:56-59`; `cli/src/index.tsx:206-221`     |
| `freebuff --cwd <directory>`            | Change directory before application initialization              | `cli/src/cli-args.ts:60-63`; `cli/src/init/init-app.ts:9-14` |
| `freebuff login`                        | Run the non-TUI login flow                                      | `cli/src/cli-args.ts:64-67`; `cli/src/index.tsx:217-229`     |

The Freebuff parser adds only the `login` command and does not define a
prompt argument. It also deliberately omits `--agent` and `--clear-logs`
(`cli/src/cli-args.ts:50-67`). `initialPrompt` is forced to `null` for
Freebuff (`cli/src/cli-args.ts:121-123`).

There are two internal smoke-only paths handled before Commander parses the
arguments: `--smoke-tree-sitter` and `--smoke-terminal-broker <result-path>
<exchange-dir>` (`cli/src/index.tsx:83-189`). They are test/build hooks, not
delegation APIs.

### Codebuff build comparison

The ordinary Codebuff branch additionally supports:

- `--agent <agent-id>`;
- `--clear-logs`;
- `--lite`, `--free`, `--max`, and `--plan`;
- a free-form `[prompt...]` positional argument; and
- the `publish` path handled by `cli/src/index.tsx:266-288`.

Those options are not available in the Freebuff build. Freebuff mode is
hardcoded to LITE/free cost mode (`cli/src/cli-args.ts:110-119`,
`cli/src/utils/constants.ts:165-189`).

The repository README documents only the interactive invocation
(`freebuff/README.md:7-18`); it does not document a headless or delegation
mode.

## How model selection works today

Freebuff does not pass an arbitrary model string through `CodebuffClient.run()`.
The model picker stores a supported Freebuff model id, defaulting to
`DEFAULT_FREEBUFF_MODEL_ID` (`cli/src/state/freebuff-model-store.ts:10-41`).
The current default is DeepSeek V4 Pro
(`common/src/constants/freebuff-models.ts:1278-1279`), although the catalog is
time-sensitive and may change.

Selecting a model persists the preference and restarts/claims the Freebuff
session (`cli/src/hooks/use-freebuff-session.ts:247-274`). Session POSTs send
the selected model in the `x-freebuff-model` header
(`cli/src/utils/freebuff-session-api.ts:103-127`). This admission step is part
of Freebuff's free-mode contract and should not be bypassed by a headless
runner.

At run time, the selected model is converted to a model-pinned root agent id:

- `getFreebuffCliAgentIdForModel()` maps the selected model to the CLI root
  (`cli/src/utils/freebuff-agent-selection.ts:21-32`).
- The CLI model-to-agent map includes entries such as
  `base3-free-deepseek`, `base3-free-deepseek-flash`, `base3-free-minimax-m3`,
  and `base3-free-luna` (`common/src/constants/free-agents.ts:110-136`).
- The message path resolves the agent, creates the SDK run config, and sends
  `costMode: 'free'` for Freebuff (`cli/src/hooks/use-send-message.ts:90-102`,
  `cli/src/hooks/use-send-message.ts:540-591`).

Therefore a proposed `--model <id>` flag should validate against the supported
Freebuff catalog, claim/rejoin the session for that model, and derive the root
agent id through the existing mapping. It should not be implemented as a
generic model override on the request.

## Existing structured completion contract

The SDK has two useful layers of completion information:

1. `handleEvent` receives typed stream events. The `finish` event contains the
   root agent id and total cost, but not the final response text
   (`common/src/types/print-mode.ts:52-64`). The SDK forwards response events to
   `handleEvent` and resolves the run after the prompt response arrives
   (`sdk/src/run.ts:468-495`, `sdk/src/run.ts:605-624`).
2. The awaited `RunState` contains the final result. Its `output` is one of:
   `structuredOutput`, `lastMessage`, `allMessages`, or `error`
   (`common/src/types/session-state.ts:54-77`). The runtime derives these from
   the selected agent's `outputMode`
   (`packages/agent-runtime/src/util/agent-output.ts:63-96`).

The agent definition controls that output mode. It defaults to `last_message`,
while `structured_output` can be paired with an optional JSON schema
(`agents/types/agent-definition.ts:155-166`). The Freebuff/base3 coding roots
currently use `last_message` (`agents/base3.ts:13-43`), so a normal coding run
will return a structured _envelope containing message objects_, not an
arbitrary task-result object. Existing agents demonstrate schema-validated
structured output, for example `agents/tmux-cli.ts:5-70` and
`agents/tmux-cli.ts:119-123`.

## Recommended headless interface

Add a dedicated non-TUI command or mode, for example:

```text
freebuff run --model <freebuff-model-id> --prompt <text> --cwd <directory> --format json
freebuff run --model <freebuff-model-id> --prompt-file <file-or-> --format json
```

Recommended initial options:

| Option                  | Purpose                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `run`                   | Makes the headless contract explicit and keeps the existing interactive default unchanged |
| `--model <id>`          | Select and admit a supported Freebuff model; derive its pinned root agent                 |
| `--prompt <text>`       | Simple one-shot prompt input                                                              |
| `--prompt-file <path>`  | Avoid shell quoting/argument-size limits; `-` can mean stdin                              |
| `--cwd <directory>`     | Run against a specific project, reusing the existing semantics                            |
| `--continue [id]`       | Resume an opaque, workspace-bound continuation handle in a new bounded process            |
| `--format json`         | Emit one final JSON object on stdout                                                      |
| `--events jsonl`        | Optional progress stream; keep it separate from the final-result stream                   |
| `--max-agent-steps <n>` | Safety bound, corresponding to the SDK's `maxAgentSteps` option                           |
| `--timeout <duration>`  | Prevent a delegation caller from waiting forever                                          |

The initial version should keep stdout strictly machine-readable and send
progress, diagnostics, and logs to stderr. A final envelope could look like:

```json
{
  "schemaVersion": 1,
  "status": "success",
  "model": "deepseek/deepseek-v4-pro",
  "agent": "base3-free-deepseek",
  "durationMs": 12345,
  "output": {
    "type": "lastMessage",
    "value": []
  },
  "traceSessionId": "..."
}
```

Do not include the original prompt by default: delegation prompts can contain
secrets or large context. Include it only behind an explicit diagnostic flag.
For an error, use the same envelope with `status: "error"`, an error object,
and a non-zero exit code.

Suggested exit semantics:

- `0`: run completed and `output.type !== 'error'`;
- `1`: run or provider error;
- `2`: invalid CLI arguments or unsupported model;
- `130`: SIGINT/cancellation.

## Implemented delegated surface

The dedicated `freebuff run` path implements the one-shot contract above. It
accepts `--model`, `--prompt` or `--prompt-file` (including `-` for piped
stdin), `--cwd`, `--timeout`, `--max-agent-steps`, `--format json`, and the
explicit `--events jsonl` progress mode. `freebuff models --format json`
exposes the local catalog without session admission. A successful run may
persist a seven-day, workspace-bound continuation handle; a later invocation
uses `--continue <handle>` and one follow-up prompt, with an optional matching
model.

Headless sponsor support reuses the interactive `/api/v1/ads` request shape and
the `cli_chat` / `Single-Ad-Unit-1` placement. It makes one best-effort lookup
for the invocation and returns sanitized records in `sponsors`:

```json
{
  "provider": "gravity",
  "title": "Example",
  "message": "Build faster with Example.",
  "cta": "Learn more",
  "url": "https://example.com",
  "surface": "cli_chat",
  "placement": "Single-Ad-Unit-1"
}
```

The returned record deliberately omits `clickUrl`, `impUrl`,
`impressionIds`, and `credits`; headless mode does not claim an impression.
`sponsorStatus` is `filled`, `no_fill`, or `unavailable`, and never changes the
run exit code. The existing TUI ad path now shares the normalized request
helper, while retaining its own rendering and impression/click behavior.

## Extended protocol

JSONL mode emits versioned safe lifecycle records for run start, session
admission, sponsor lookup, agent start/finish, failure or cancellation, and
completion. It adapts raw SDK events into this bounded vocabulary and never
emits prompts, credentials, sensitive file contents, or raw provider payloads.
The completion event embeds the same envelope used by ordinary JSON mode.

Continuation handles are random opaque tokens stored under the project data
directory. Each record stores the selected model, resolved workspace, expiry,
and the SDK `RunState` needed by `previousRun`. A resumed run must match the
stored workspace and model, and a successful resume replaces the old handle.
Expired or malformed handles are structured runtime errors.

## Implementation seam

The current TUI path couples model/session lifecycle, OpenTUI rendering,
message stores, streaming UI handlers, and persistence. A headless mode should
extract a small runner around the existing SDK path:

1. Parse and validate the headless options before starting OpenTUI.
2. Resolve `cwd`, auth, the requested Freebuff model, and the Freebuff session
   admission/instance id.
3. Derive the model-pinned Freebuff root agent with
   `getFreebuffCliAgentIdForModel()`.
4. Construct a `CodebuffClient` with the project root and the same safe file
   filter/tool handling used by the CLI.
5. Call `client.run({ agent, prompt, costMode: 'free', ... })`.
6. Accumulate optional `finish`/error event metadata, await the returned
   `RunState`, persist an optional continuation handle, serialize the result
   once, and set the exit code.
7. In explicit JSONL mode, adapt lifecycle phases to safe events and emit the
   final completion envelope as the last event.
8. Release/mark the Freebuff session on normal completion, cancellation, and
   failure.

The existing `getCodebuffClient()` is UI-oriented and installs the CLI's
`ask_user` bridge (`cli/src/utils/codebuff-client.ts:49-102`). The headless
runner should either share a dependency-injected client factory with it or
create a headless factory explicitly. Avoid importing React hooks or starting
the renderer in the headless path.

## Important follow-on decisions

- **Model versus agent:** expose `--model` for Freebuff and derive the agent.
  An arbitrary `--agent` override can violate the model/session allowlist and
  should not be added casually.
- **Final output versus finish event:** use the awaited `RunState.output` for
  the result. The `finish` event is useful for progress/accounting but does not
  carry the final message.
- **Free-form message versus task result:** keep the default coding roots on
  `last_message` initially. Add a dedicated structured-output agent only when
  callers need a stable task-specific schema such as `{status, summary,
changedFiles}`.
- **Single JSON versus JSONL:** one final JSON object is easiest for a
  delegation caller. JSONL is useful for streaming progress, so it is an
  explicit mode and its final event carries the ordinary completion envelope.
- **Continuation persistence:** use an opaque local handle with a bounded
  seven-day lifetime, workspace/model binding, and replacement on successful
  resume. Do not expose the underlying trace or conversation identifier.
- **Interactive tools:** headless execution must not wait on TUI input. The
  Freebuff base3 roots do not include the interactive `ask_user` tool, but any
  future headless agent definition must preserve that invariant or provide a
  separate non-interactive policy.

## Verification notes

The source-level parser and unit/e2e tests were inspected. A direct runtime
`--help` invocation could not be completed in this checkout: Bun first needed
permission to write temporary runtime files, and after that the workspace
reported the missing dependency `@opentui/core`. The repository's source and
Commander definitions remain authoritative for the current flag contract; a
post-install smoke test should capture actual stdout, stderr, and exit codes
for `--help`, `--version`, unsupported flags, and the new headless command.
