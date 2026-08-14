# Complete Freebuff delegated-run surface

Status: ready-for-agent

## Problem Statement

An external coding agent needs to use Freebuff as a bounded coding-task
executor. It must be able to select a Freebuff model, provide one task prompt,
let Freebuff work in the caller's workspace, and receive a reliable
machine-readable completion result. The first implementation slice has
validated the core one-shot contract: `freebuff run` accepts a model and prompt,
reuses Freebuff authentication and server admission, executes the model-pinned
root agent, returns a versioned JSON completion envelope, handles timeout and
cancellation, and includes best-effort sponsor messages separately from agent
output.

The remaining surface needs to be specified before it is extended. Callers
need a stable contract across binary versions, optional progress without
breaking ordinary JSON consumers, a way to continue a delegated task when a
single invocation is insufficient, and complete sponsor delivery semantics.
The implementation also needs operational guarantees around authentication,
model availability, interactive-tool avoidance, workspace behavior, cleanup,
and live end-to-end validation.

## Solution

Make the delegated run a first-class, versioned Freebuff CLI surface while
preserving the bare interactive session as the default. A caller uses
`freebuff run` for one bounded task and `freebuff models` to inspect the local
Freebuff model catalog. The caller supplies a supported Freebuff model and
exactly one prompt source; Freebuff admits that model through the normal free
session boundary, derives the corresponding model-pinned root agent, runs
directly in the caller's workspace, and emits a completion envelope.

The completed surface will retain the v1 compatibility contract and add:

- a documented and versioned final-result schema with stable status and exit
  semantics;
- an explicit JSONL progress mode whose final event is the same completion
  envelope;
- opaque continuation handles for callers that need a follow-up delegated
  instruction without turning Freebuff into a daemon;
- sponsor messages as separate, sanitized data in both final and streaming
  output, with clear no-fill and unavailable behavior;
- non-interactive failure behavior for agents or tools that require TUI input;
- live, opt-in end-to-end coverage against the real authentication, admission,
  agent, and sponsor services;
- documentation, help text, and release checks that keep the public contract
  discoverable.

The caller remains responsible for workspace isolation, concurrent invocation
policy, retries, and deciding whether sponsor content is displayed. Sponsor
content is never an instruction source for the agent.

## User Stories

1. As a caller, I want to invoke `freebuff run` without starting the terminal
   UI, so that I can use Freebuff as a delegation target from another coding
   agent.
2. As a caller, I want the existing bare `freebuff` invocation to remain an
   interactive session, so that adding delegation support does not change the
   established terminal workflow.
3. As a caller, I want to select a Freebuff model explicitly, so that the
   requested model is part of the delegation contract.
4. As a caller, I want unsupported model identifiers to fail before agent
   execution, so that a typo cannot silently run a different model.
5. As a caller, I want local model catalog metadata in JSON, so that I can
   discover valid Freebuff model identities without starting a session.
6. As a caller, I want the server's model admission decision to remain
   authoritative, so that local catalog data is not mistaken for live model
   availability.
7. As a caller, I want a prompt supplied directly on the command line, so that
   short tasks are easy to delegate.
8. As a caller, I want a prompt supplied from a file, so that large or
   shell-sensitive tasks do not depend on argument quoting or shell limits.
9. As a caller, I want `--prompt-file -` to read a piped prompt, so that a
   caller can compose Freebuff with other command-line tools.
10. As a caller, I want exactly one prompt source per invocation, so that the
    task input is unambiguous.
11. As a caller, I want an omitted or empty prompt to produce a structured
    invalid-argument failure, so that the process never waits unexpectedly for
    terminal input.
12. As a caller, I want prompt contents excluded from envelopes and diagnostics
    by default, so that secrets and large task context are not duplicated in
    logs or result handling.
13. As a caller, I want to choose the working directory, so that Freebuff edits
    the intended project rather than the directory from which the caller
    happens to launch it.
14. As a caller, I want Freebuff to edit the supplied workspace directly, so
    that the delegated changes are immediately visible to the caller.
15. As a caller, I want workspace isolation and concurrency policy to remain my
    responsibility, so that Freebuff does not make hidden worktree or locking
    decisions on my behalf.
16. As a caller, I want authentication to reuse the normal Freebuff session
    mechanism, so that interactive and delegated runs obey the same admission
    and free-mode policy.
17. As a caller, I want missing credentials to return a machine-readable
    authentication failure, so that a headless process never launches an
    interactive login flow or hangs waiting for a user.
18. As a caller, I want session admission to happen for the requested model,
    so that the server can reject unavailable models before the agent runs.
19. As a caller, I want model admission failures distinguished from local
    argument failures, so that I can decide whether to correct input or retry
    later.
20. As a caller, I want the selected model to determine the Freebuff root agent,
    so that the model/session allowlist cannot be bypassed through an arbitrary
    agent override.
21. As a caller, I want the delegated agent to use the same safe-file policy as
    the interactive client, so that headless execution does not weaken local
    file protections.
22. As a caller, I want the process to terminate when the one delegated run
    reaches completion, failure, timeout, or cancellation, so that each
    invocation has a bounded lifecycle.
23. As a caller, I want a configurable timeout with a safe default, so that a
    stuck provider or tool cannot hold the caller indefinitely.
24. As a caller, I want an optional maximum agent-step limit, so that I can
    bound runaway work independently of wall-clock time.
25. As a caller, I want SIGINT and SIGTERM to request graceful cancellation, so
    that Freebuff can stop SDK work, release the session, and report
    cancellation when possible.
26. As a caller, I want forced termination to remain distinguishable from
    graceful cancellation, so that I can interpret a missing envelope using
    the process status.
27. As a caller, I want the final result on stdout to be one JSON object by
    default, so that a simple JSON parser can consume it without filtering
    terminal output.
28. As a caller, I want diagnostics, progress, and logs on stderr in default
    mode, so that stdout remains a reliable machine-readable channel.
29. As a caller, I want every normal completion, runtime failure, and
    cancellation to use a versioned completion envelope, so that callers can
    branch on status without parsing human prose.
30. As a caller, I want the completion envelope to identify the selected model,
    model-pinned agent, elapsed duration, trace session when available, cost
    metadata when available, agent output, sponsor messages, and sponsor
    status, so that I can audit and route the result.
31. As a caller, I want the agent output to remain opaque SDK output, so that
    the delegation protocol does not pretend every coding task has a universal
    semantic result such as `changedFiles` or `taskComplete`.
32. As a caller, I want errors to include a stable machine-readable code and a
    safe human-readable message, so that automation can classify failures while
    logs remain useful.
33. As a caller, I want invalid arguments and unsupported models to use a
    distinct exit code from runtime/provider failures, so that retries and user
    feedback can be automated.
34. As a caller, I want cancellation to use its own exit code, so that an
    intentional stop is not reported as a provider failure.
35. As a caller, I want sponsor lookup to be best effort, so that a sponsor
    service outage never changes whether the coding run succeeds.
36. As a caller, I want sponsor messages returned separately from agent output,
    so that I can display or ignore them without exposing them to the agent's
    reasoning context.
37. As a caller, I want sponsor records sanitized to display content and a
    landing URL, so that tracking internals and provider bookkeeping do not
    become part of my delegation protocol.
38. As a caller, I want sponsor content treated as untrusted data, so that an ad
    cannot inject instructions into the delegated task.
39. As a caller, I want an explicit sponsor status of `filled`, `no_fill`, or
    `unavailable`, so that I can distinguish an empty auction from a failed
    request without coupling that state to task status.
40. As a caller, I want the v1 headless sponsor batch to remain deterministic
    and bounded, so that one invocation does not unexpectedly make rotating ad
    requests or delay task execution.
41. As a caller, I want any future sponsor events in streaming mode to use the
    same sanitized shape as the final envelope, so that I do not need separate
    ad parsing logic for each output mode.
42. As a caller, I want Freebuff not to claim an impression merely because it
    fetched a sponsor record, so that measurement reflects visible rendering
    rather than headless retrieval.
43. As a caller, I want an explicit JSONL events mode, so that I can observe
    long-running delegated work without sacrificing the simple one-object
    default contract.
44. As a caller, I want JSONL event types and fields versioned and documented,
    so that progress consumers can reject or tolerate future changes safely.
45. As a caller, I want progress events to describe phases such as admission,
    sponsor lookup, agent execution, cancellation, and completion, so that I
    can show useful status without depending on TUI rendering events.
46. As a caller, I want the final JSONL event to contain the same completion
    envelope as default JSON mode, so that streaming and non-streaming callers
    converge on one result contract.
47. As a caller, I want raw prompts, credentials, sensitive paths, and provider
    secrets excluded from progress events, so that observability does not leak
    task context.
48. As a caller, I want headless execution to fail clearly if the selected
    agent requires interactive user input, so that an unattended process never
    blocks behind a TUI-only interaction.
49. As a caller, I want a continuation handle when a delegated run produces a
    resumable state, so that I can send a follow-up instruction without
    reconstructing the whole conversation externally.
50. As a caller, I want continuation handles to be opaque and versioned, so
    that I do not depend on internal conversation or trace identifiers.
51. As a caller, I want continuation to start a new bounded process, so that
    adding resumability does not turn the CLI into an unmanaged worker daemon.
52. As a caller, I want a continuation request to identify the prior run and
    provide exactly one follow-up prompt source, so that the next task is
    unambiguous.
53. As a caller, I want invalid, expired, or unavailable continuation handles
    to return structured errors, so that I can fall back to a fresh delegated
    run deliberately.
54. As a caller, I want continuation to preserve the original Freebuff model
    and session policy unless the contract explicitly permits a new admission,
    so that a follow-up cannot silently change model identity.
55. As a caller, I want continuation cleanup and cancellation to obey the same
    release and exit semantics as an initial run, so that resumed tasks do not
    create a separate reliability class.
56. As a maintainer, I want the interactive TUI path and headless runner to
    share only stable runtime and sponsor seams, so that changes to OpenTUI
    rendering do not destabilize delegation.
57. As a maintainer, I want the CLI to parse and validate headless options
    before starting OpenTUI, so that headless output cannot be contaminated by
    renderer initialization.
58. As a maintainer, I want the headless runner to use dependency injection for
    authentication, admission, release, client creation, agent loading, model
    resolution, time, and sponsor lookup, so that behavior can be tested at the
    highest useful seam without module mocks.
59. As a maintainer, I want session release attempted on success, provider
    failure, timeout, cancellation, and setup failure after admission, so that
    server-side sessions do not leak.
60. As a maintainer, I want release failures not to replace the primary run
    result, so that cleanup problems are diagnosable without hiding the task's
    actual outcome.
61. As a maintainer, I want model catalog metadata and live admission behavior
    documented separately, so that callers understand the difference between
    local support and runtime availability.
62. As a maintainer, I want help text, README examples, the Freebuff spec, and
    release artifacts to describe the same command and envelope contract, so
    that users do not have to infer behavior from source code.
63. As a maintainer, I want tests to prove stdout purity, stderr separation,
    exit codes, cleanup, sponsor isolation, and cancellation, so that the
    delegation surface remains safe for automation.
64. As a maintainer, I want an authenticated live smoke test that can be run
    explicitly and safely, so that local dependency-injection tests are
    complemented by validation against the real services.

## Implementation Decisions

- Keep the separate `run` command and preserve bare invocation as the
  interactive session. The headless path must not import or start the OpenTUI
  renderer before argument handling and must not depend on React hooks.

- Treat the currently implemented v1 one-shot behavior as the compatibility
  baseline: explicit Freebuff model, exactly one prompt source, direct
  workspace run, reused authentication and server admission, one JSON
  completion envelope, best-effort sponsor batch, timeout, step limit,
  cancellation, and stable exit codes.

- Keep `--model` as a Freebuff model identifier, not an arbitrary provider model
  or agent override. Validate against the local Freebuff model catalog, then
  let server admission decide whether the requested model is live and
  available. Never silently fall back to another model.

- Keep prompt input mutually exclusive between inline text, a file path, and
  stdin represented by `--prompt-file -`. Do not infer a prompt from a TTY.
  Preserve the no-prompt and empty-prompt failures as invalid arguments.

- Keep the direct workspace run model. Freebuff does not create worktrees,
  acquire cross-process locks, merge changes, or coordinate concurrent runs.
  The caller owns isolation and conflict policy.

- Keep Freebuff authentication and free-session admission as the only runtime
  boundary for delegated runs. Headless mode reports an authentication failure
  instead of opening an interactive login flow. Admission uses the requested
  model and yields the instance identity used in run metadata.

- Keep the model-to-root-agent mapping as the only way to choose the coding
  root. An arbitrary agent flag is not part of this contract because it could
  violate the Freebuff model and session allowlist.

- Keep the completion envelope version independent of the binary, SDK, agent,
  and provider versions. Version one contains `schemaVersion`, `status`, the
  selected model and agent when known, `durationMs`, opaque SDK `output` when
  available, `traceSessionId` when available, `cost` when available, a
  `sponsors` array, `sponsorStatus`, and a structured error on failure.

- Preserve opaque agent output. Do not add a universal semantic result schema
  claiming that every coding task has a reliable summary, changed-file list,
  test result, or correctness verdict. A future task-specific structured-output
  agent may add a separately versioned output contract.

- Preserve exit semantics: zero for process success, one for runtime/provider,
  authentication, admission, or agent failure, two for invalid arguments or
  unsupported local model identifiers, and 130 for graceful cancellation.
  A forced termination may produce no envelope and is interpreted by the
  caller from the process status.

- Keep default stdout as exactly one final JSON object. Human diagnostics,
  warnings, and progress belong on stderr. Any environment or initialization
  diagnostic that can occur before the runner starts must follow this rule.

- Add an explicit progress mode rather than changing default output. The
  recommended interface is `--events jsonl` alongside `--format json` for the
  final result. In event mode, stdout is a JSONL stream with a small stable
  vocabulary: run started, model/session admission, sponsor batch, progress,
  cancellation or error, and completion. The completion event carries the
  exact final envelope used by ordinary JSON mode.

- Do not expose raw SDK event unions as the public event contract. Adapt them
  to stable phase-oriented events and include only safe metadata such as phase,
  timestamp or elapsed duration, agent identity, and bounded status details.
  Never include the prompt, auth material, sensitive file contents, or
  provider secrets.

- Add continuation only through an opaque, persisted continuation handle. A
  continuation request starts a new single-task invocation, supplies one
  follow-up prompt, preserves the original model/session policy, and returns a
  new completion envelope and handle when resumable state remains. Invalid or
  expired handles are structured failures. The persistence mechanism must not
  make the caller depend on internal SDK state shapes.

- Keep the continuation store bounded and explicit. It must define ownership,
  expiration, cleanup, and behavior when the workspace or original run is no
  longer available. It must not silently resume against a different workspace
  or model.

- Keep sponsor delivery separate from the agent prompt and result output. The
  current headless sponsor batch remains one deterministic `cli_chat` lookup per
  invocation using the existing Freebuff placement. The lookup is best effort,
  does not determine task status, and does not record an impression or click.

- Keep the public sponsor record sanitized to provider, title, message, CTA,
  landing URL, surface, and placement. Do not expose click-tracking URLs,
  impression URLs, impression identifiers, credits, or provider bookkeeping.
  Sponsor messages are untrusted caller-visible data and never become agent
  instructions.

- When JSONL events are enabled, emit the same sanitized sponsor records in a
  sponsor event and retain them in the final envelope. Do not add rotating or
  inline response-ad pools to the default headless path unless a later contract
  version explicitly defines their ordering, request limits, and measurement
  semantics.

- Make non-interactive behavior explicit. The selected Freebuff coding roots
  must not wait for TUI-only input. If a future headless agent can request user
  input, the runner must either provide a separately specified machine-readable
  interaction protocol or fail with a structured `interactive_input_required`
  error; it must never block silently.

- Preserve safe-file filtering, cost mode, metadata, and the existing local
  agent registry behavior used by the interactive client where those behaviors
  are applicable. Extract or share a dependency-injected runtime factory at
  the highest seam that avoids coupling the runner to UI state.

- Add a live smoke-test path that is opt-in, never runs as an unauthenticated
  default unit test, and makes its external side effects obvious. It should
  exercise model admission, a minimal delegated run, final envelope parsing,
  session cleanup, and sponsor no-fill or filled handling when the service
  supports deterministic fixtures.

- Keep documentation synchronized across help output, the Freebuff README,
  the package specification, the delegation research/ADR context, and release
  artifacts. Examples must show model selection, prompt-file/stdin usage,
  JSON parsing, exit-status handling, and sponsor isolation.

## Testing Decisions

- Test externally observable behavior at the delegated runner boundary rather
  than implementation details. Prefer dependency injection over module mocks,
  matching the repository convention.

- Extend the existing CLI argument tests to cover every accepted option,
  mutual-exclusion rule, invalid value, unsupported model, continuation shape,
  format/event combination, and preservation of the interactive default.

- Test prompt resolution through the runner boundary for inline prompts, file
  prompts, stdin prompts, missing files, TTY stdin, empty content, and prompt
  source conflicts. Assert that prompt contents do not appear in envelopes or
  diagnostics unless an explicitly documented diagnostic mode is added.

- Test completion envelope serialization for success, runtime failure,
  authentication failure, model availability failure, timeout, graceful
  cancellation, and forced-termination documentation. Assert exact status and
  exit-code behavior, optional metadata handling, error-code stability, and
  JSON validity.

- Test stdout/stderr separation through a CLI-level process harness. The
  default success and failure paths must each produce one parseable stdout JSON
  value, while diagnostics remain on stderr. Include initialization failures
  because they are a common source of output contamination.

- Test cleanup by injecting admission, run, cancellation, and release
  dependencies. Assert that release is attempted on every admitted terminal
  path and that a release failure does not overwrite the primary envelope.

- Test model routing at the public runner boundary: a supported model admits
  with that model and resolves its pinned root agent; an unsupported model does
  not admit or run; a server admission rejection does not trigger fallback.

- Test safe-file filtering and non-interactive behavior using a fake client or
  agent definition at the runner seam. A headless run must not install the TUI
  `ask_user` bridge or wait for terminal input.

- Test sponsor behavior through the shared ad-request seam and the delegated
  runner seam. Cover filled, no-fill, unavailable, malformed, and delayed
  responses; sanitized field shape; omission of tracking fields; separation
  from agent prompt and output; and the rule that sponsor failure never changes
  run status or exit code.

- Test JSONL event mode for stable event ordering, valid one-event-per-line
  output, safe metadata, sponsor event sanitization, completion-event parity
  with JSON mode, and clean behavior when the run fails or is cancelled.

- Test continuation through the continuation-store seam rather than relying on
  its storage implementation. Cover handle creation, follow-up prompt
  validation, model/workspace preservation, invalid and expired handles,
  cleanup, cancellation, and the absence of silent cross-workspace resume.

- Add a built-binary smoke suite for `--help`, `--version`, `models --format
json`, invalid arguments, a controlled headless run, signal cancellation, and
  JSON parsing. Keep it separate from unit tests when it needs build artifacts
  or credentials.

- Add an opt-in authenticated live end-to-end test using dedicated test
  credentials and an isolated disposable workspace. It must be skipped with a
  clear reason when credentials or the live service are unavailable, and it
  must never be required for ordinary pull-request test runs.

- Retain the existing interactive ad, parser, environment, common-model, and
  build regression tests. Shared sponsor-request changes must prove that
  interactive impression and click tracking behavior remains unchanged.

- Run formatting, diff checks, focused CLI/ad tests, common regressions, a
  production Freebuff build, and the built-binary smoke suite before release.
  Record any unrelated repository-wide type-check failures separately rather
  than weakening the delegated contract to accommodate them.

## Out of Scope

- Replacing or redesigning the interactive OpenTUI session.
- Making bare `freebuff` mean headless execution.
- Arbitrary provider model strings, arbitrary agent overrides, or bypassing
  Freebuff server admission.
- Silent model fallback, automatic retry across different models, or hidden
  policy changes between interactive and delegated runs.
- Interactive login, TUI prompts, or an unattended process that waits for user
  input.
- Automatic worktree creation, workspace isolation, merging, locking, or
  caller-wide concurrency coordination.
- A long-lived worker daemon or a single process that owns multiple delegated
  runs.
- A universal semantic task-result schema that claims correctness or always
  reports summaries, changed files, tests, or patches.
- Injecting sponsor text into prompts, agent messages, tool inputs, or opaque
  SDK output.
- Recording impressions or clicks solely because a headless process fetched a
  sponsor record.
- Exposing provider tracking URLs, impression IDs, credits, or other ad
  measurement internals to callers.
- Making rotating or inline response-ad pools part of the default headless
  contract without a separately versioned design.
- Treating sponsor no-fill or sponsor-service failure as a coding-task failure.
- Publishing a new general-purpose API/SDK delegation protocol in addition to
  the CLI surface.

## Further Notes

- The highest testing seam is the dependency-injected delegated runner behind
  the CLI. It covers argument validation, prompt resolution, authentication,
  model admission, agent routing, sponsor lookup, cancellation, cleanup, and
  envelope construction without coupling tests to OpenTUI.

- The final completion envelope describes process success, not semantic task
  correctness. The caller decides whether the returned opaque agent output is
  sufficient and may inspect the workspace or run its own verification.

- `schemaVersion` belongs to the protocol and should change only when the
  envelope or event contract changes incompatibly. Binary and agent versions
  may be included as additional metadata but must not replace protocol
  versioning.

- The repository's GitHub remote has Issues disabled. This spec is therefore
  published in the local Markdown issue-tracker fallback at
  `.scratch/freebuff-delegation/spec.md`, with `Status: ready-for-agent`
  serving as the equivalent of the requested triage label. If GitHub Issues
  are enabled later, the same body can be copied into a GitHub issue and
  labeled `ready-for-agent`.
