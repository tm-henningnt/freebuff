# 01 — Harden the one-shot delegated-run contract

**What to build:** A caller can rely on `freebuff run` as a release-grade
one-shot delegated run: it validates the requested Freebuff model and prompt,
executes directly in the caller's workspace without starting the TUI, and
returns a stable completion envelope with predictable process status.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] Preserve the interactive session as the default while parsing and
      validating delegated options before any TUI initialization.
- [x] Enforce the v1 input contract: an explicit supported Freebuff model,
      exactly one prompt source, direct workspace execution, no implicit TTY
      prompt, and no silent model fallback.
- [x] Make authentication, server admission, model-to-agent routing, and
      headless non-interactive behavior produce structured failures rather than
      launching login or waiting for TUI input.
- [x] Preserve the versioned completion envelope, stable error codes, and exit
      semantics for success, invalid arguments, runtime/provider failure, and
      graceful cancellation.
- [x] Keep stdout machine-readable and send diagnostics to stderr, including
      initialization failures that happen before agent execution.
- [x] Attempt session cleanup on every admitted terminal path, including
      success, failure, timeout, cancellation, and setup failure; do not replace
      the primary result when cleanup itself fails.
- [x] Keep sponsor messages separate from agent output, sanitize them to the
      public sponsor shape, report `filled`, `no_fill`, or `unavailable`, and
      never record an impression or expose tracking fields in headless mode.
- [x] Cover the behavior through the dependency-injected delegated-run seam,
      including prompt resolution, model routing, cleanup, cancellation,
      sponsor isolation, stdout purity, and process exit status.
