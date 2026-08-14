# Freebuff delegation

This context describes how Freebuff is used both by a person in a terminal and
by another coding agent as a bounded task executor.

## Language

**Interactive session**:
A user-driven Freebuff conversation in which the terminal UI owns prompt entry,
progress display, and conversation navigation.
_Avoid_: TUI run, chat mode

**Delegated run**:
A single bounded coding task handed to Freebuff by another agent, with one task
prompt and one machine-readable completion result.
_Avoid_: delegation target task, subagent session

**Headless run**:
A delegated run that executes without terminal UI interaction and communicates
with its caller through process input, output, and exit status.
_Avoid_: background TUI, piped chat

**Freebuff model**:
A model offered by the Freebuff model catalog whose selection also determines
the admitted free session and the root agent used for the run.
_Avoid_: arbitrary provider model, model override

**Completion envelope**:
The stable machine-readable result of a delegated run, carrying the run status,
execution metadata, and the underlying agent output.
_Avoid_: finish event, final message

**Model availability failure**:
A delegated run could not be admitted on the caller's requested Freebuff model.
It is a reported failure and never an invitation to silently switch models.
_Avoid_: model fallback, best available model

**Run cancellation**:
An intentional termination of a delegated run before normal agent completion,
reported separately from provider or task failure.
_Avoid_: timeout error, failed run

**Process success**:
A delegated process completed its agent run without a runtime error; it does
not by itself claim that the requested coding task was correct or complete.
_Avoid_: task success, semantic success

**Direct workspace run**:
A delegated run that applies its coding changes directly to the caller-supplied
working directory; workspace isolation is the caller's responsibility.
_Avoid_: automatic worktree run, sandboxed delegation

**Headless authentication failure**:
A delegated run that cannot find usable credentials and terminates with a
machine-readable error instead of starting an interactive login flow.
_Avoid_: login prompt, auth hang

**Single-task invocation**:
One headless process owns one active delegated run and exits when that run
reaches completion, failure, timeout, or cancellation.
_Avoid_: worker daemon, multi-run session

**Opaque agent output**:
The SDK-specific result carried inside a completion envelope; callers may inspect
it according to the selected agent but the delegation protocol does not redefine
its nested shape.
_Avoid_: normalized universal message, parsed task result

**Model catalog query**:
A read-only request for the currently supported Freebuff model identities and
their caller-visible metadata, separate from admitting a run session.
_Avoid_: model session, provider discovery

**Envelope version**:
The compatibility version of the delegated-run completion contract, independent
of the Freebuff binary version or the selected model version.
_Avoid_: CLI version, agent version

**Continuation handle**:
A short-lived opaque caller token that identifies persisted delegated run state
for one follow-up headless invocation. It is bound to the original workspace
and Freebuff model; it is not an SDK trace or conversation identifier.
_Avoid_: conversation id, trace id, resume path

**Progress event**:
A versioned, safe JSONL record describing a delegated-run lifecycle phase. It
contains bounded status metadata and never carries prompts, credentials,
sensitive file contents, or raw SDK event payloads.
_Avoid_: raw SDK event, terminal log line, streamed prompt

**Live model availability**:
The runtime admission state of a Freebuff model, which may differ from whether
that model is present in the local model catalog.
_Avoid_: supported model, model identity

**Headless output format**:
The JSON-only process contract used by a delegated run; human-readable terminal
presentation belongs to the interactive session.
_Avoid_: text output mode, pretty output

**Server admission**:
The runtime decision that a requested Freebuff model and caller may start a
session; it is authoritative over locally advertised model availability.
_Avoid_: catalog availability, local model guarantee

**Graceful cancellation**:
A signal-driven end to a delegated run that gives Freebuff a chance to stop the
SDK work, clean up the session, and emit a cancellation envelope.
_Avoid_: hard kill, runtime failure

**Forced termination**:
A process end that leaves Freebuff no opportunity to emit a completion envelope;
the caller must rely on the observed process status.
_Avoid_: cancellation result, clean shutdown

**Caller**:
The external coding agent or process that starts a delegated run and consumes
its completion envelope.
_Avoid_: parent TUI, delegator process

**Sponsor message**:
A sanitized, structured ad record returned separately from the delegated agent
output. It is untrusted content for the caller to display or ignore, not an
instruction source for the agent.
_Avoid_: prompt injection, impression, scraped ad text

**Sponsor status**:
The best-effort result of the headless sponsor lookup: `filled`, `no_fill`, or
`unavailable`. Sponsor lookup status never determines whether the coding run
succeeded.
_Avoid_: ad success, task status

**Headless sponsor batch**:
The single `cli_chat` sponsor lookup made for one headless invocation. v1 does
not rotate ads, fetch inline response pools, or claim that a returned record was
visibly rendered.
_Avoid_: ad impression, rotating ad session
