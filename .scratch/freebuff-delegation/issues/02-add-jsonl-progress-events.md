# 02 — Add JSONL progress and sponsor events

**What to build:** A caller can opt into a streaming JSONL protocol for a
long-running delegated run while the default one-object JSON contract remains
unchanged. The stream reports safe lifecycle progress, sponsor data, and a
final completion event that is equivalent to the ordinary completion envelope.

**Blocked by:** 01 — Harden the one-shot delegated-run contract

**Status:** ready-for-agent

- [x] Add an explicit JSONL events option without changing default stdout
      behavior for callers that request ordinary JSON output.
- [x] Define and document a small versioned event vocabulary covering run
      start, model/session admission, sponsor lookup, agent progress,
      cancellation or failure, and completion.
- [x] Adapt internal SDK events into stable phase-oriented events rather than
      exposing raw SDK event unions as the public protocol.
- [x] Keep event metadata safe and bounded: do not emit prompts, credentials,
      sensitive file contents, provider secrets, or unbounded provider payloads.
- [x] Emit sanitized sponsor messages in a sponsor event and retain the same
      records in the final completion envelope; sponsor lookup remains best
      effort and does not affect task status or exit code.
- [x] Make the final JSONL event contain the same envelope fields and status as
      ordinary JSON mode for success, runtime failure, and cancellation.
- [x] Keep diagnostics outside the JSONL stream and ensure every stdout line
      in event mode is valid JSON.
- [x] Test event ordering, failure and cancellation paths, sponsor
      sanitization, secret exclusion, final-envelope parity, and unchanged
      default JSON behavior at the CLI process boundary.
