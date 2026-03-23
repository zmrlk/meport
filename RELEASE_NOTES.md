# v0.2.5 — Meport Profile Standard v1.0

**The vCard for AI.** This release introduces the Meport Profile Standard — an open, portable format for describing yourself to AI systems.

## Meport Profile Standard v1.0

A `.meport.md` file tells every AI who you are and how to interact with you. Paste it in ChatGPT, Claude, Grok, Cursor — AI instantly adapts.

```markdown
# Alex Chen
> Direct, concise, English. Senior engineer. Peak: 9-12.

## Communication
- Be direct. Skip qualifiers and filler.
- Code-first format. No prose walls.

## Instructions
- Use TypeScript for all examples
- Skip preambles — go straight to the answer

## Never
- Explain basic concepts
- Use emoji
```

### Standard highlights
- **Two formats:** `.meport.md` (human-readable Markdown) + `.meport.json` (machine-validated JSON Schema)
- **DATA vs POLICY:** Separates who you are (Identity, Work, Goals) from how to treat you (Communication, Instructions, Never)
- **4 export tiers:** Summary (150 chars) → Dense (800) → Compact (1500) → Full (3500) — fits every platform
- **Cross-model tested:** ChatGPT, Claude, Grok confirm behavioral impact
- **12 reserved sections:** Identity, Communication, AI Preferences, Work & Energy, Personality, Cognitive, Neurodivergent, Expertise, Life Context, Financial, Goals, Anti-Goals
- **Open:** Parse with 10 lines of regex. No SDK, no lock-in. MIT license.
- Full spec: [meport.app/docs#std-overview](https://meport.app/docs.html#std-overview) · [SPEC.md](./SPEC.md) · [JSON Schema](https://meport.app/schema/v1.json)

## New: Profile Creator (Web)

Create your `.meport.md` in 2 minutes without downloading anything. Click through options, get your profile.

→ [meport.app/create](https://meport.app/create.html)

## New: Web App

Full Meport experience in the browser — profiling, AI interview, export to 13 platforms. No download needed.

→ [meport.app/app](https://meport.app/app/)

## New: Unified Documentation

Single docs page with 34 sections covering everything: Getting Started, Desktop App, CLI, Reference, The Standard, Help. EN/PL bilingual.

→ [meport.app/docs](https://meport.app/docs.html)

## What's new in core

- **MeportProfile standard types** — 22 TypeScript interfaces for the standard format
- **JSON Schema** (`meport-v1.schema.json`) — validates .meport.json files
- **Markdown parser** (`md-parser.ts`) — zero-dependency regex parser, 60 tests
- **Bidirectional converters** — md→json (`md-to-json.ts`) + json→md (`json-to-md.ts`)
- **4-tier export compiler** — MeportMdCompiler with Summary/Dense/Compact/Full tiers
- **AI prompts** — generation, per-platform export (6 platforms × 2 tiers), refinement, import
- **Interviewer update** — extracts goals, anti-goals, never rules, financial mindset, instruction types
- **Converter update** — PersonaProfile → MeportProfile with all new fields
- **Python parser** — reference implementation for ecosystem adoption
- **15 export formats** — 13 platform compilers + `.meport.md` and `.meport.json` standard formats

## Fixes

- `isValidLevel0()` checked wrong version (v2.0 → v1.0)
- `deadlineStyle` field read from wrong key in MD parser
- `MeportSection` type missing `financial` and `never`
- All domain references unified to `meport.app`
- Version consistency across all packages and site (0.2.5)
- All external links have `rel="noopener"`
- Zero personal data in examples (Alex Chen persona)
- Security section added to SPEC.md

## Install

```bash
npx meport                    # CLI (no install)
npm install -g meport         # CLI (global)
```

Desktop: [Download from Releases](https://github.com/zmrlk/meport/releases)

---

Built by [Karol Zamarlik](https://github.com/zmrlk) (ISIKO) with [bOS CLI](https://github.com/zmrlk/bOS). MIT License.
