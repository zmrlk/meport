# Meport

**Your AI doesn't know you. Fix that in 60 seconds.**

One profile. 14 platforms. One command.

Meport builds a portable AI personality profile from your existing files and exports it to every AI platform in their native format. Local-first. Free. Open source.

```
npx meport
```

## What it does

Every AI tool treats you like a stranger. You repeat the same preferences, get the same generic responses, configure the same settings — in ChatGPT, Claude, Cursor, Copilot, and every new tool you try.

Meport fixes this:

1. **Scan your computer** (file names, apps, bookmarks, git, Screen Time) — automatic
2. **Answer 10 personalized questions** — AI already knows you from the scan
3. **AI generates your profile** — 38+ dimensions across 10 categories
4. **Export to 14 platforms** in their native format with one command

### Before Meport

```
You: "How should I structure my day?"
AI:  "Here are some general tips: 1) Use a task manager 2) Set priorities..."
```

### After Meport

```
You: "How should I structure my day?"
AI:  "You work in sprints and crash after lunch — block deep work before 13:00.
      Here's a 15-min task list for your burst style..."
```

## Install

```bash
npx meport                    # Run directly (no install)
npm install -g meport         # Or install globally
```

Requires Node.js 18+.

## Quick start

```bash
# Interactive shell — guided setup
npx meport

# Or jump straight to profiling
npx meport profile

# Quick mode — key questions only, instant profile
npx meport profile --quick

# AI-powered profiling (requires API key)
npx meport config              # Set up Claude/OpenAI/Gemini/Grok/OpenRouter/Ollama
npx meport profile --ai        # Scan + personalized questions + AI export
```

## Export platforms

Meport compiles your profile into **platform-specific formats** optimized for each AI's instruction system:

| Platform | Format | Command |
|----------|--------|---------|
| **ChatGPT** | Custom Instructions (2 fields) | `meport export chatgpt` |
| **Claude** | User preferences (markdown) | `meport export claude` |
| **Claude Code** | CLAUDE.md section | `meport export claude-code` |
| **Cursor** | `.cursor/rules/meport.mdc` | `meport export cursor` |
| **GitHub Copilot** | `copilot-instructions.md` | `meport export copilot` |
| **Windsurf** | `.windsurfrules` | `meport export windsurf` |
| **Ollama** | Modelfile SYSTEM block | `meport export ollama` |
| **Gemini** | Gem instructions | `meport export gemini` |
| **Grok** | Custom instructions | `meport export grok` |
| **Perplexity** | Custom instructions | `meport export perplexity` |
| **AGENTS.md** | SoulSpec-compatible | `meport export agents-md` |
| **OpenClaw** | Identity + agents bundle | `meport export openclaw` |
| **JSON** | Canonical profile | `meport export json` |
| **Generic** | Universal markdown | `meport export generic` |

```bash
# Export to specific platform
meport export chatgpt

# Export to all platforms at once
meport export --all

# Copy to clipboard
meport export claude --copy

# Deploy to all local configs (Cursor, Claude Code, Copilot, Windsurf)
meport deploy
```

## Commands

| Command | Description |
|---------|-------------|
| `meport` | Interactive shell — guided menu |
| `meport profile` | Start profiling (questions or AI interview) |
| `meport profile --quick` | Quick mode — key questions, instant profile |
| `meport profile --ai` | AI-driven conversational profiling |
| `meport profile --scan <paths>` | Scan files for automatic profile data |
| `meport export <platform>` | Export to a specific platform |
| `meport export --all` | Export to all 14 platforms |
| `meport deploy` | Push profile to all local AI configs |
| `meport deploy --global` | Deploy to all tracked projects |
| `meport view` | View your profile summary |
| `meport edit` | Edit individual dimensions |
| `meport card` | Show visual personality card |
| `meport import` | Import existing ChatGPT/Claude/Cursor instructions |
| `meport discover` | Find AI config files on your computer |
| `meport scan <paths>` | Preview what meport can detect from files |
| `meport demo` | Compare AI responses with vs without your profile |
| `meport report` | AI-powered personal insights from your profile |
| `meport packs list` | Show available packs |
| `meport packs add <pack>` | Add a profiling pack |
| `meport deepen` | Targeted questions for shallow profile areas |
| `meport refresh` | Re-scan, update dimensions, re-export |
| `meport history` | Profile version history |
| `meport projects` | Manage tracked projects for multi-deploy |
| `meport config` | Configure AI provider (Claude, OpenAI, Gemini, Grok, OpenRouter, Ollama) |
| `meport feedback` | Rate how well AI responds with your profile |

## Pack system

Meport profiles are modular. Choose which areas of your life AI should know about:

| Pack | What it covers | Questions |
|------|---------------|-----------|
| **Core** | Communication style, feedback, format preferences | Always active |
| **Work** | Energy patterns, deadlines, learning style, stress | 5 questions |
| **Lifestyle** | Travel, food, social energy, routines | 5 questions |
| **Health** | Fitness, sleep, allergies, conditions | 4 questions |
| **Finance** | Spending style, financial goals, advice comfort | 3 questions |
| **Learning** | Learning style, goals, time commitment | 4 questions |
| **Story** | Personal narrative, values, life context | Optional |
| **Context** | Location, occupation, life stage | Auto-detected |

Sensitive packs (Health, Finance) have per-platform export controls — you decide which AI sees what.

```bash
meport packs list              # See available packs
meport packs add health        # Add health pack
meport packs remove finance    # Remove finance pack
```

## System scan

Meport can automatically detect profile dimensions from your system:

- **Locale & timezone** from system settings
- **Tech stack** from project files (package.json, Cargo.toml, go.mod, etc.)
- **AI configs** from existing CLAUDE.md, .cursorrules, custom instructions
- **Git identity** from .gitconfig
- **Development tools** from installed software

```bash
meport profile --scan ~/projects ~/documents
meport scan ./my-project                       # Preview without profiling
```

## AI-powered profiling

Connect an AI provider for conversational profiling and AI-enriched analysis:

```bash
meport config
# Choose: Claude, OpenAI, Gemini, Grok, OpenRouter, or Ollama
# Auto-opens browser for API key page

meport profile --ai
# Scans your computer → 10 personalized questions → AI-generated exports
```

Supported providers:
- **Anthropic** (Claude Opus 4.6, Claude Sonnet 4)
- **OpenAI** (GPT-5.4, GPT-4o)
- **Google Gemini** (Gemini 3.1 Pro — free tier available)
- **Grok** (xAI — Grok 3)
- **OpenRouter** (200+ models, one key)
- **Ollama** (any local model — fully offline, zero data leaves your machine)

## Import existing instructions

Already have custom instructions in ChatGPT or Claude? Import and upgrade them:

```bash
meport import                          # Interactive import
meport import --file ./instructions.md # Import from file
meport discover                        # Find AI configs on your machine
```

Meport parses your existing instructions, maps them to dimensions, and generates optimized exports for all platforms.

## Profile format

Meport stores profiles as JSON with four data layers:

| Layer | Source | Confidence |
|-------|--------|------------|
| **Explicit** | Direct answers | 1.0 |
| **Inferred** | Behavioral signals | 0.5 - 0.95 |
| **Compound** | Multi-dimension rules | 0.6 - 0.9 |
| **Emergent** | AI observations | 0.3 - 0.7 |

```json
{
  "schema_version": "1.0",
  "profile_type": "personal",
  "completeness": 85,
  "explicit": {
    "identity.preferred_name": { "value": "Alex", "confidence": 1.0 },
    "communication.verbosity_preference": { "value": "minimal", "confidence": 0.9 },
    "work.energy_archetype": { "value": "burst", "confidence": 0.8 }
  },
  "inferred": {
    "compound.cognitive_style": { "value": "hands_on_builder", "confidence": 0.7 }
  }
}
```

Dimensions are weighted 1-10 for export prioritization — identity (10) always exports first, expertise (1) only when space allows.

## How exports work

Meport doesn't just dump your profile — it **compiles rules** optimized for each platform:

- **Positive phrasing** ("Keep under 5 lines" > "Don't write long responses") — higher compliance
- **Critical rules at start and end** — avoids the "Lost in the Middle" effect
- **Platform-specific formatting** — XML tags for Claude, MDC frontmatter for Cursor, SYSTEM block for Ollama
- **Token-aware** — stays within platform limits (ChatGPT: 1,500 chars, Cursor: 12,000 chars)
- **Anti-pattern conversion** — "never use emoji" checkboxes become hard rules with ~95% compliance

## i18n

Questions and UI available in:
- English (default)
- Polish

```bash
meport profile --lang pl
meport export chatgpt --lang pl
```

## Privacy

- **Zero servers.** There is literally nowhere for your data to go.
- **Zero accounts.** No signup, no login, no tracking.
- **Local-first.** Profile lives on your machine (`./meport-profile.json`).
- **Ollama mode.** Use a local model — fully offline profiling.
- **Open source.** MIT license. Read every line of code.
- **You control exports.** Sensitive packs (health, finance) require explicit opt-in per platform.

## Architecture

```
meport (monorepo)
├── packages/cli      — CLI tool (commander + inquirer)
├── packages/core     — Engine: profiling, inference, compilers
│   ├── profiler/     — Question engine, system scanner, file scanner
│   ├── compiler/     — 14 platform-specific export compilers
│   ├── inference/    — Behavioral, compound, and contradiction detection
│   ├── ai/          — AI client, interviewer, enricher
│   ├── schema/      — Profile types and validation
│   ├── sync/        — Multi-platform sync targets
│   └── importer/    — Parse existing AI instructions
└── packages/app      — Web app (Svelte 5 + Tailwind 4)
```

## Web app

Meport also has a web interface at [meport.app](https://meport.app) — same profiling engine, runs entirely in your browser. No data sent anywhere.

## Contributing

```bash
git clone https://github.com/zmrlk/meport-cli
cd meport-cli
pnpm install
pnpm run build
node packages/cli/dist/index.js --help
```

## License

MIT
