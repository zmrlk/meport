[![npm version](https://img.shields.io/npm/v/meport)](https://www.npmjs.com/package/meport)
[![npm downloads](https://img.shields.io/npm/dm/meport)](https://www.npmjs.com/package/meport)
[![license](https://img.shields.io/github/license/zmrlk/meport-cli)](https://github.com/zmrlk/meport-cli/blob/main/LICENSE)
[![tests](https://img.shields.io/badge/tests-354%20passing-brightgreen)]()

# Meport — Teach every AI who you are.

**One profile. Every AI. 5 minutes.**

Your AI doesn't know you. Every conversation starts from zero — your name, your style, your preferences, forgotten. Meport fixes that.

Drop your files, answer a few questions, and Meport creates a portable personality profile that works across 12 AI platforms. ChatGPT, Claude, Cursor, Copilot, Ollama — all of them finally get you.

```bash
npx meport
```

---

## The difference

**Without Meport:**
```
You: "Plan me a weekend trip"
AI:  I'd love to help! Where are you traveling from? What's your budget?
     Mountains or sea? Here are 10 popular destinations to consider...
```

**With Meport:**
```
You: "Plan me a weekend trip"
AI:  Kraków, mountains, labrador — budget ~$120.
     Szczawnica, 2h drive. Cabin with garden, dogs OK, $70/night.
     Saturday: river rafting + easy trail. Sunday: terrace breakfast, drive home.
     ~$115 total. Book it?
```

---

## Quick Start

**No install required:**
```bash
npx meport
```

**Or install globally:**
```bash
npm install -g meport
```

**Quick mode (3 minutes):**
```bash
npx meport profile --quick
```

**AI-powered (best results):**
```bash
npx meport config              # Connect Claude / OpenAI / Gemini / Ollama
npx meport profile --ai        # Scan + interview + AI-generated exports
```

Requires Node.js 18+.

**Desktop app:** Download from [Releases](https://github.com/zmrlk/meport-cli/releases). Note: binaries are not code-signed yet. On Mac you may see a Gatekeeper warning — right-click → Open to bypass. On Windows, SmartScreen may warn — click "More info" → "Run anyway".

---

## How it works

1. **Scan** — Meport reads your system (git, apps, project files, existing AI configs) and builds a starting picture automatically.
2. **Interview** — Answer a few targeted questions. The AI already knows you from the scan, so it skips what's obvious.
3. **Export** — Your profile compiles into 14 platform-native formats and deploys with one command.

---

## What you get

| Dimension | Detail |
|-----------|--------|
| Platforms | 12 (ChatGPT, Claude, Claude Code, Cursor, Copilot, Windsurf, Ollama, Gemini, Grok, Perplexity, AGENTS.md, Generic) |
| AI providers | 6 (Anthropic, OpenAI, Google, xAI, OpenRouter, Ollama) |
| Profile packs | 8 (Core, Work, Lifestyle, Health, Finance, Learning, Story, Context) |
| Profile dimensions | 38+ across 10 categories |
| Export format | Rule-based compilers — direct instructions, not descriptions |
| Privacy | Local-first. No accounts. No tracking. Ollama = fully offline. Cloud AI sends scan data to provider. |
| Languages | EN + PL |

---

## Export platforms

| Auto-deploy (`meport deploy`) | Clipboard / export file |
|-------------------------------|------------------------|
| Cursor `.cursor/rules/meport.mdc` | ChatGPT Custom Instructions |
| Claude Code `CLAUDE.md` section | Claude User Preferences |
| GitHub Copilot `copilot-instructions.md` | Gemini Gem instructions |
| Windsurf `.windsurfrules` | Grok Custom Instructions |
| AGENTS.md (project root) | Perplexity Custom Instructions |
| | Ollama Modelfile (SYSTEM block) |
| | Generic markdown |

```bash
meport export --all            # Export to all 12 formats
meport deploy                  # Push to all local AI configs
meport export claude --copy    # Copy to clipboard
```

---

## Pack system

Profiles are modular. Choose what AI should know about you:

| Pack | Covers | Questions |
|------|--------|-----------|
| **Core** | Communication style, format, feedback | 15 (always active) |
| **Work** | Energy patterns, deadlines, task style | 13 |
| **Story** | Values, narrative, motivations | 10 |
| **Context** | Location, occupation, life stage | 8 |
| **Lifestyle** | Routines, hobbies, social energy | 6 |
| **Health** | Neurodivergent traits, wellness | 3 (sensitive, opt-in) |
| **Finance** | Spending style, budget awareness | 3 (sensitive, opt-in) |
| **Learning** | How you learn, preferred format | 3 |

Sensitive packs (Health, Finance) require explicit opt-in per platform — you control what each AI sees.

---

## Architecture

```
meport (monorepo)
packages/
  core/    — profiling engine, inference engine, compilers (12 platforms)
             profiler/ · compiler/ · inference/ · ai/ · schema/ · importer/
  cli/     — CLI interface (21 commands, commander + inquirer)
  app/     — desktop app (Svelte 5 + Tauri)
```

Profile format: JSON with four confidence layers (Explicit 1.0, Inferred 0.5-0.95, Compound 0.6-0.9, Emergent 0.3-0.7). Dimensions weighted 1-10 for export prioritization.

---

## Privacy

Local-first. No accounts. No analytics. No tracking. Profile lives at `./meport-profile.json` on your machine. With Ollama — fully offline, nothing leaves your computer. With cloud AI providers, scan data and profile dimensions are sent to the provider's API for analysis. API keys are stored securely in the app data directory (desktop) or localStorage (web). Open source — read every line.

---

## Contributing

```bash
git clone https://github.com/zmrlk/meport-cli
cd meport-cli
pnpm install && pnpm run build
node packages/cli/dist/index.js --help
```

---

[Website](https://meport.app) · [npm](https://www.npmjs.com/package/meport) · [Docs](https://github.com/zmrlk/meport-cli/wiki) · [Buy me a coffee](https://buymeacoffee.com/zmrlk)

Built by [Karol Zamarlik](https://github.com/zmrlk) (ISIKO). MIT License.
