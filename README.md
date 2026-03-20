[![npm version](https://img.shields.io/npm/v/meport)](https://www.npmjs.com/package/meport)
[![license](https://img.shields.io/github/license/zmrlk/meport)](https://github.com/zmrlk/meport/blob/main/LICENSE)
[![tests](https://img.shields.io/badge/tests-354%20passing-brightgreen)]()

# Meport — Teach every AI who you are.

**One profile. Every AI. 5 minutes.**

Your AI doesn't know you. Every conversation starts from zero — your name, your style, your preferences, forgotten. Meport fixes that.

Answer a few questions, and Meport creates a portable personality profile that works across 12 AI platforms. ChatGPT, Claude, Cursor, Copilot, Ollama — all of them finally get you.

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

## Get Started

### Desktop App (recommended)

Download from [Releases](https://github.com/zmrlk/meport/releases) — available for Mac, Windows, and Linux.

The app guides you through everything:
1. **Setup AI** — connect Ollama (local, free, private) or a cloud provider (Claude, OpenAI, Gemini)
2. **Scan** — the app analyzes your system to learn about you automatically (you choose what to scan)
3. **Quiz** — answer targeted questions about your personality, work style, and preferences
4. **AI Interview** — optional deep conversation for richer profiles
5. **Export** — copy or download optimized instructions for any AI platform

**Features:**
- Onboarding wizard with Ollama auto-setup (download models in-app)
- System scan: detects your apps, tools, schedule, language, timezone
- AI-powered personality analysis with career and lifestyle portraits
- Export to 12 platforms with per-platform optimization
- AI refine chat: iteratively improve exports, auto-updates your profile
- Live demo: see before/after comparison in real time
- Full PL/EN interface

> **Note:** Binaries are not code-signed yet. On Mac: right-click → Open. On Windows: "More info" → "Run anyway".

### CLI

```bash
npx meport                       # Interactive shell — no install needed
npx meport profile --ai          # AI-powered profiling
npx meport export chatgpt        # Export for ChatGPT
npx meport deploy                # Deploy to all local AI configs
```

Install globally: `npm install -g meport` · Requires Node.js 18+

---

## Platforms

| File-based (auto-deploy) | Clipboard (copy & paste) |
|--------------------------|--------------------------|
| Claude Code `CLAUDE.md` | ChatGPT Custom Instructions |
| Cursor `.cursor/rules/meport.mdc` | Claude User Preferences |
| GitHub Copilot `copilot-instructions.md` | Gemini Gem instructions |
| Windsurf `.windsurfrules` | Grok Custom Instructions |
| AGENTS.md | Perplexity Custom Instructions |
| Ollama `Modelfile` | |
| Generic markdown | |

Each platform gets optimized output respecting its format and character limits. ChatGPT: 1,500 chars, two fields. Cursor: MDC frontmatter, coding-focused. Ollama: SYSTEM prompt.

---

## How it works

1. **Scan** — Meport reads your system (apps, git, configs, bookmarks) and builds a starting picture. You choose what to scan and can exclude categories.
2. **Quiz** — Answer questions grouped by topic: identity, communication, work habits, personality. 3-5 minutes for core profile.
3. **AI Analysis** — If you have AI configured, Meport generates career and personality portraits from your scan data. You review and correct before it goes into your profile.
4. **Export** — Profile compiles into platform-native formats. Smart merge preserves existing config files.
5. **Refine** — Use the AI chat to iteratively improve any platform's export. New info you share is automatically extracted into your profile.

---

## Privacy

**Local-first.** No accounts. No analytics. No tracking.

- Profile stored locally (app data directory on desktop, localStorage on web)
- API keys stored in secure storage with restricted permissions (desktop) or localStorage (web)
- With **Ollama**: fully offline — nothing leaves your computer
- With **cloud AI**: scan data and profile dimensions are sent to your chosen provider's API for analysis. You see a clear disclaimer before any data is sent.
- Scan consent: you choose what categories to scan and can exclude any before AI analysis
- Open source — read every line

---

## Architecture

```
meport (monorepo)
packages/
  app/     — desktop app (Svelte 5 + Tauri 2)
  core/    — profiling engine, inference, compilers (12 platforms)
  cli/     — CLI interface (21 commands)
```

Profile format: JSON with four confidence layers (Explicit 1.0, Inferred 0.5-0.95, Compound 0.6-0.9, Emergent 0.3-0.7). 80+ possible dimensions across 10 categories.

---

## Documentation

Full docs at [meport.app/docs](https://meport.app/docs) — available in English and Polish, with three difficulty levels (Beginner, Power User, Developer).

---

## Contributing

```bash
git clone https://github.com/zmrlk/meport
cd meport
pnpm install && pnpm build
pnpm tauri dev          # Desktop app
node packages/cli/dist/index.js   # CLI
```

---

[Website](https://meport.app) · [npm](https://www.npmjs.com/package/meport) · [Docs](https://meport.app/docs) · [Buy me a coffee](https://buymeacoffee.com/zmrlk)

Built by [Karol Zamarlik](https://github.com/zmrlk) (ISIKO). MIT License.
