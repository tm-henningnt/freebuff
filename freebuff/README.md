# Freebuff

**The free coding agent.** No subscription. No configuration. Start in seconds.

An AI coding agent that runs in your terminal — describe what you want, and Freebuff edits your code.

## Install

```bash
npm install -g freebuff
```

## Usage

```bash
cd ~/my-project
freebuff
```

For an agent-to-agent one-shot run, use the headless delegation surface:

```bash
freebuff run \
  --model deepseek/deepseek-v4-pro \
  --prompt "Fix the failing tests" \
  --format json
```

The process writes one JSON completion envelope to stdout and uses exit code
`0` for a completed run, `1` for runtime/provider failures, `2` for invalid
arguments, and `130` for cancellation. Use `--prompt-file path` or
`--prompt-file -` for larger prompts. `--cwd`, `--timeout`, and
`--max-agent-steps` are also supported.

Successful runs may include a short-lived opaque `continuationId`. Resume one
in the same workspace with a new bounded process:

```bash
freebuff run \
  --continue <continuation-id> \
  --prompt "Now run the tests and fix any failures"
```

Continuation handles are bound to the workspace and model and expire after
seven days. A model is optional when resuming; if supplied, it must match the
original run.

For lifecycle progress, opt into JSONL. The final line is a `completion` event
containing the same envelope returned by ordinary JSON mode:

```bash
freebuff run \
  --model deepseek/deepseek-v4-pro \
  --prompt "Fix the failing tests" \
  --events jsonl
```

The envelope keeps the agent output separate from a best-effort `sponsors`
array. Sponsor records contain display content and a landing URL, but not
impression/click tracking fields. Sponsor lookup failures do not fail the
coding run. Headless runs use the same Freebuff authentication, model
admission, and prompt data-use policy as the interactive client.

To inspect the local model catalog without starting a session:

```bash
freebuff models --format json
```

## Project Structure

```
freebuff/
├── cli/       # CLI build & npm release files
└── web/       # Freebuff website
```

## Building from Source

```bash
# From the repo root
bun freebuff/cli/build.ts 1.0.0
```

---

For everything else — what Freebuff does, how it works, FAQ, and how it relates to Codebuff — see the [repo root README](../README.md). We keep that one up to date as the single source of truth.

## License

MIT
