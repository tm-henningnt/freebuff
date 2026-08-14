# 03 — Add opaque continuation handles

**What to build:** A caller can continue a delegated task in a new bounded
`freebuff run` process by supplying an opaque continuation handle and one
follow-up prompt. The resumed run preserves the original workspace, Freebuff
model policy, admission rules, cancellation behavior, and cleanup guarantees.

**Blocked by:** 01 — Harden the one-shot delegated-run contract

**Status:** ready-for-agent

- [x] Return an opaque, protocol-versioned continuation handle when a run has
      resumable state, without exposing internal conversation or trace storage
      identifiers as the public contract.
- [x] Accept a continuation request in a new single-task invocation with one
      follow-up prompt source and the same machine-readable envelope and exit
      semantics as an initial run.
- [x] Preserve the original workspace and Freebuff model/session policy; reject
      attempts to resume silently against a different workspace or model.
- [x] Define bounded persistence ownership, expiration, cleanup, and behavior
      when the original run or workspace is no longer available.
- [x] Return stable structured errors for malformed, expired, missing, or
      unavailable continuation handles.
- [x] Apply the same timeout, maximum-step, signal cancellation, non-interactive
      behavior, sponsor isolation, and session-release guarantees to resumed
      runs.
- [x] Test handle creation, follow-up prompt validation, persistence through
      the continuation seam, workspace/model preservation, invalid and expired
      handles, cleanup, cancellation, and process-level envelope output.
