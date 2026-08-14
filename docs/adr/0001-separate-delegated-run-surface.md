# Keep delegated runs separate from the interactive session

Freebuff will retain its existing bare interactive session and add a distinct
headless delegated-run surface. A new one-shot run requires an explicit
Freebuff model and exactly one prompt source, edits the caller-supplied
workspace directly, reuses Freebuff's authentication and model/session
boundary, and returns a versioned completion envelope with stable exit codes.
The surface also supports an explicit JSONL progress mode and opaque,
workspace-bound continuation handles. It will not silently fall back models,
launch interactive login, or coordinate workspace concurrency. This keeps the
interactive product compatible and gives external callers a bounded process
contract without making the OpenTUI lifecycle part of their integration.

The completion envelope also carries a best-effort `sponsors` array and
`sponsorStatus`. Headless mode makes one deterministic `cli_chat` sponsor
lookup per invocation, and JSONL mode emits the same sanitized records in a
sponsor event. It does not rotate ads, fetch inline response pools, record
impressions, or expose click/impression tracking URLs. Sponsor lookup failures
do not fail the coding run. Sponsor records are sanitized and untrusted; they
are never added to the agent prompt or treated as instructions.
