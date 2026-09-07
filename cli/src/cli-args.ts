import { createRequire } from 'module'

import { Argument, Command } from 'commander'

import { IS_FREEBUFF, type AgentMode } from './utils/constants'
import { getCliEnv } from './utils/env'

const require = createRequire(import.meta.url)

export type ParsedArgs = {
  initialPrompt: string | null
  command?: string
  subcommand?: string
  agent?: string
  clearLogs: boolean
  continue: boolean
  continueId?: string | null
  cwd?: string
  initialMode?: AgentMode
  model?: string
  prompt?: string
  promptFile?: string
  timeout?: string
  maxAgentSteps?: string
  format?: string
  events?: string
  sessionId?: string
  keepSession: boolean
  takeOver: boolean
}

export function loadPackageVersion(): string {
  const env = getCliEnv()
  if (env.CODEBUFF_CLI_VERSION) {
    return env.CODEBUFF_CLI_VERSION
  }

  try {
    const pkg = require('../package.json') as { version?: string }
    if (pkg.version) {
      return pkg.version
    }
  } catch {
    // Continue to dev fallback
  }

  return 'dev'
}

export function parseArgs({
  argv = process.argv,
  isFreebuff = IS_FREEBUFF,
  version = loadPackageVersion(),
}: {
  argv?: string[]
  isFreebuff?: boolean
  version?: string
} = {}): ParsedArgs {
  const program = new Command()

  if (isFreebuff) {
    // Freebuff: the bare invocation remains interactive. `run` is the
    // separate machine-readable delegation surface.
    program
      .name('freebuff')
      .description('Freebuff - Free AI coding assistant')
      .version(version, '-v, --version', 'Print the CLI version')
      .option(
        '--continue [conversation-id]',
        'Continue from a previous conversation (optionally specify a conversation id)',
      )
      .option(
        '--cwd <directory>',
        'Set the working directory (default: current directory)',
      )
      .option('--model <model-id>', 'Freebuff model id for a delegated run')
      .option('--prompt <text>', 'Prompt for a delegated run')
      .option(
        '--prompt-file <path>',
        'Read a delegated prompt from a file, or - for stdin',
      )
      .option(
        '--timeout <seconds>',
        'Maximum delegated-run duration (default: 1800 seconds)',
      )
      .option(
        '--max-agent-steps <steps>',
        'Maximum agent steps for a delegated run',
      )
      .option(
        '--format <format>',
        'Output format (models: json or table; run: json)',
      )
      .option('--events <format>', 'Progress event format (run supports jsonl)')
      .option('--session <session-id>', 'Reuse a retained delegated session')
      .option(
        '--keep-session',
        'Keep the delegated session open after this run',
      )
      .option(
        '--take-over',
        'Take over an existing Freebuff instance before this run',
      )
      .addArgument(
        new Argument('[command]', 'Command to run').choices([
          'login',
          'run',
          'models',
          'session',
        ]),
      )
      .addArgument(
        new Argument('[subcommand]', 'Session subcommand').choices(['end']),
      )
      .addHelpText(
        'after',
        '\nCommands:\n  run                            Run one delegated task and emit JSON\n  models                         List the local Freebuff model catalog\n  session end                   End a retained delegated session\n  login                          Log in without starting the TUI',
      )
      .helpOption('-h, --help', 'Show this help message')
  } else {
    // Codebuff: full CLI with all options
    program
      .name('codebuff')
      .description('Codebuff CLI - AI-powered coding assistant')
      .version(version, '-v, --version', 'Print the CLI version')
      .option(
        '--agent <agent-id>',
        'Run a specific agent id (skips loading local .agents overrides)',
      )
      .option(
        '--clear-logs',
        'Remove any existing CLI log files before starting',
      )
      .option(
        '--continue [conversation-id]',
        'Continue from a previous conversation (optionally specify a conversation id)',
      )
      .option(
        '--cwd <directory>',
        'Set the working directory (default: current directory)',
      )
      .option('--lite', 'Start in LITE mode')
      .option('--free', 'Start in LITE mode (deprecated alias)')
      .option('--max', 'Start in MAX mode')
      .option('--plan', 'Start in PLAN mode')
      .addHelpText(
        'after',
        '\nCommands:\n  login                          Log in to your account\n  publish                        Publish agents to the registry',
      )
      .helpOption('-h, --help', 'Show this help message')
      .argument('[prompt...]', 'Initial prompt to send to the agent')
      .allowExcessArguments(true)
  }

  program.parse(argv)

  const options = program.opts()
  const args = program.args

  const continueFlag = options.continue

  // Determine initial mode from flags (last flag wins if multiple specified)
  // Freebuff always uses LITE mode
  let initialMode: AgentMode | undefined
  if (isFreebuff) {
    initialMode = 'LITE'
  } else {
    if (options.free || options.lite) initialMode = 'LITE'
    if (options.max) initialMode = 'MAX'
    if (options.plan) initialMode = 'PLAN'
  }

  return {
    initialPrompt: !isFreebuff && args.length > 0 ? args.join(' ') : null,
    command: args[0],
    subcommand: args[1],
    agent: options.agent,
    clearLogs: options.clearLogs || false,
    continue: Boolean(continueFlag),
    continueId:
      typeof continueFlag === 'string' && continueFlag.trim().length > 0
        ? continueFlag.trim()
        : null,
    cwd: options.cwd,
    initialMode,
    model: options.model,
    prompt: options.prompt,
    promptFile: options.promptFile,
    timeout: options.timeout,
    maxAgentSteps: options.maxAgentSteps,
    format: options.format,
    events: options.events,
    sessionId: options.session,
    keepSession: Boolean(options.keepSession),
    takeOver: Boolean(options.takeOver),
  }
}
