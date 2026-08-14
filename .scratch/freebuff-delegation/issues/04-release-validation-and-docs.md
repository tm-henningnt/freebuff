# 04 — Complete release validation and documentation

**What to build:** The complete delegated-run surface is discoverable,
release-tested, and validated against the real Freebuff services when explicit
credentials are available. A maintainer can ship the binary knowing that the
interactive client, sponsor measurement behavior, and headless protocol remain
compatible.

**Blocked by:** 01 — Harden the one-shot delegated-run contract; 02 — Add JSONL progress and sponsor events; 03 — Add opaque continuation handles

**Status:** ready-for-agent

- [x] Synchronize CLI help, README usage, package specification, domain
      context, and architectural notes with the final command, envelope,
      JSONL, continuation, model, prompt, exit-code, and sponsor contracts.
- [x] Document that the completion envelope reports process success rather than
      semantic task correctness and that workspace isolation remains the
      caller's responsibility.
- [x] Add an opt-in authenticated live end-to-end test using dedicated
      credentials and a disposable workspace; skip clearly when credentials or
      live services are unavailable.
- [x] Have the live test exercise model admission, a minimal delegated run,
      envelope parsing, session cleanup, and sponsor filled/no-fill handling
      where deterministic service behavior is available.
- [x] Add built-binary smoke coverage for help, version, model catalog output,
      invalid arguments, controlled headless execution, JSONL parsing, and
      cancellation.
- [x] Retain regression coverage proving that interactive sponsor impression
      and click tracking behavior is unchanged by shared ad-request code.
- [x] Run formatting, diff checks, focused delegation/ad tests, common
      regressions, production Freebuff build, and release smoke checks; record
      unrelated repository-wide type-check failures separately.
