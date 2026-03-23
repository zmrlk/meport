# Meport Profile Standard v1.0

**Portable AI context for humans.**

One file. Works everywhere. Write it once, use it in every AI tool.

---

## What is a Meport Profile?

A `.meport.md` file describes **who you are** and **how AI should interact with you**. It's a Markdown file with a simple convention: headings are sections, `Key: Value` is structured data, lists are rules.

You can:
- Paste it into ChatGPT, Claude, Cursor, Ollama, or any AI tool
- Edit it in any text editor, Notion, Obsidian, or VS Code
- Parse it programmatically with 10 lines of code
- Generate it with Meport or write it by hand

It is **not** a memory system, chat log, or RAG database.
It is your **persistent context** — the things every AI should know about you.

---

## Format

### Structure

```
---                          ← optional frontmatter (for tooling)
schema: meport/1.0
---

# Full Name                  ← H1 = your name (required)
> One-line summary            ← blockquote = quick context for AI

## Section Name               ← H2 = section (from reserved list)
Key: Value                    ← structured field
Key: longer value with detail ← values can be descriptive

## Another Section
- List item                   ← lists for rules, goals, items
- Another item
```

### Rules

1. **One H1** — your name. Always first.
2. **One blockquote** — a 1-2 line summary. AI reads this first.
3. **H2 headings** — section names from the reserved list (or custom).
4. **`Key: Value`** — for structured data. One per line.
5. **`- Item`** — for lists (rules, goals, items).
6. **Frontmatter** — optional `---` block with `schema: meport/1.0`. Helps tooling detect the file.
7. **Language** — write in whatever language you use with AI. Mix languages if that's your style.

### What goes where

| If you want to say... | Put it in... | As... |
|----------------------|-------------|-------|
| Your name, location, language | `## Identity` | `Key: Value` |
| How AI should talk to you | `## Communication` | `Key: Value` |
| What AI should do proactively | `## AI Preferences` | `Key: Value` |
| Your work habits | `## Work & Energy` | `Key: Value` |
| Your personality traits | `## Personality` | `Key: Value` |
| Personal context | `## Life Context` | `- items` |
| Financial constraints | `## Financial` | `Key: Value` |
| What you're working toward | `## Goals` | `- items` |
| What you never want | `## Anti-Goals` | `- items` |
| Behavioral rules for AI | `## Instructions` | `- rules` |
| Hard prohibitions | `## Never` | `- rules` |

---

## Reserved Section Names

Sections are organized in two classes:

### Data sections (who you are)

| Section | Class | Status | What it contains |
|---------|-------|--------|-----------------|
| `Identity` | data | **core** | Name, language, location, timezone |
| `Work & Energy` | data | optional | Energy pattern, peak hours, task style, sacred times |
| `Personality` | data | optional | Motivation, stress response, cognitive style |
| `Life Context` | data | optional | Family, living situation, health, personal facts |
| `Financial` | data | optional | Budget constraints, price sensitivity |
| `Goals` | data | optional | What you're working toward |
| `Anti-Goals` | data | optional | What you explicitly don't want |
| `Expertise` | data | optional | Domains, tech stack, experience |

### Policy sections (how AI should behave)

| Section | Class | Status | What it contains |
|---------|-------|--------|-----------------|
| `Communication` | policy | **core** | Directness, verbosity, formality, humor |
| `AI Preferences` | policy | optional | Relationship model, proactivity, correction style |
| `Instructions` | policy | **core** | Behavioral rules for AI |
| `Never` | policy | optional | Hard prohibitions |

### Stability classes

Sections have different change frequencies. Tools should treat them accordingly:

| Class | Sections | Meaning |
|-------|----------|---------|
| **stable** | Identity, Expertise, Personality | Rarely changes. Cache-friendly. |
| **evolving** | Work, Communication, AI Preferences | Changes over months. Review quarterly. |
| **temporary** | Financial, Life Context, Goals | Changes frequently. Check freshness. |

In JSON format, use `_meta.stability` to mark individual sections. In Markdown, stability is implicit from the section type.

### Instruction priority & conflict resolution

When instructions conflict, higher `priority` wins. In Markdown format, order implies priority (first = highest). Example:

```markdown
## Instructions
- Always respond in Polish                    ← highest (first)
- Action first, explanation second
- Match tasks to current energy               ← lowest (last)
```

In JSON, use explicit `priority` (1-10, where 10 = critical):

```json
{ "rule": "Always respond in Polish", "priority": 10 }
{ "rule": "Match tasks to energy", "priority": 7 }
```

`## Never` rules always override `## Instructions` — they are hard prohibitions.

### Custom sections

Any `## Heading` not in the reserved list is treated as custom. Use them freely:

```markdown
## My Tech Stack
## Relationships
## Daily Routine
## Creative Process
```

For organizational/vendor extensions, prefix with `x-`:

```markdown
## x-acme-team-role
## x-cursor-rules
```

---

## Required fields

A valid `.meport.md` must have:

1. **`# Name`** — H1 with your name
2. **`> Summary`** — blockquote with 1-line context
3. **`## Identity`** with at least `Name:` and `Language:`

Everything else is optional. A minimal profile is 7 lines:

```markdown
# Jane Doe
> English-speaking designer who prefers concise feedback.

## Identity
Name: Jane Doe
Language: en
```

---

## Examples

### Minimal (7 lines)

```markdown
# Jane Doe
> English-speaking designer who prefers concise feedback.

## Identity
Name: Jane Doe
Language: en
```

### Standard (~30 lines)

```markdown
# Alex Chen
> Direct, technical, English. Senior engineer. Likes code-first answers.

## Identity
Name: Alex Chen
Language: en-US
Timezone: America/Los_Angeles

## Communication
Directness: direct
Verbosity: concise
Format: code-first

## Instructions
- Use TypeScript for all examples
- Skip preambles — go straight to the answer
- Treat me as an expert

## Never
- Apologize for being direct
- Explain basic concepts
- Use emoji
```

### Full (~60 lines)

```markdown
---
schema: meport/1.0
---

# Alex Chen
> Direct, concise, English. Senior engineer. Coffee-fueled. Peak: 9-12.

## Identity
Name: Alex Chen
Language: en-US
Location: San Francisco, CA
Timezone: America/Los_Angeles

## Communication
Directness: direct
Verbosity: concise
Formality: casual
Feedback: direct — welcome corrections
Humor: occasional
Format: code-first, structured

## AI Preferences
Relationship: collaborator
Proactivity: proactive
Corrections: direct, no sugarcoating

## Work & Energy
Energy: steady pattern
Peak hours: 09:00-12:00
Tasks: medium, deadline-driven
Sacred time: lunch 12-13 — don't schedule meetings

## Personality
Motivation: mastery
Stress: analyzes, then acts

## Life Context
- Lives in SF with partner and cat
- Commutes by bike
- Vegetarian

## Financial
Price sensitivity: medium
Rule: check budget before big purchases

## Goals
- Ship product v2.0 by Q2
- Learn Rust
- Run a half-marathon

## Anti-Goals
- Managing 50+ people
- Working weekends regularly
- Long commutes

## Instructions
- Use TypeScript for all code examples
- Skip preambles — go straight to the answer
- Treat me as an expert, not a beginner
- Action first, explanation second

## Never
- Explain basic programming concepts
- Use emoji or exclamation marks
- Apologize for being direct
- Suggest expensive tools without checking budget
```

---

## Parsing

A `.meport.md` can be parsed with basic regex:

```
Sections:    /^## (.+)$/gm
Key-Value:   /^([^-#\n][^:]+):\s*(.+)$/gm
List items:  /^- (.+)$/gm
Name (H1):   /^# (.+)$/m
Summary:     /^> (.+)$/gm
Frontmatter: /^---\n([\s\S]*?)\n---/
```

Libraries like `mdast` (JavaScript) or `mistune` (Python) can parse the full AST.

---

## Machine Format (.meport.json)

The same profile can be represented as structured JSON for APIs, databases, and programmatic use. The JSON mirrors the Markdown sections:

```json
{
  "$schema": "https://meport.app/schema/v1.json",
  "version": "1.0",
  "identity": {
    "name": "Alex Chen",
    "language": "en-US",
    "location": "San Francisco, CA",
    "timezone": "America/Los_Angeles"
  },
  "communication": {
    "directness": "direct",
    "verbosity": "concise"
  },
  "instructions": [
    { "rule": "Use TypeScript for all code examples" }
  ],
  "never": [
    { "rule": "Explain basic programming concepts" },
    { "rule": "Use emoji" }
  ]
}
```

Meport tools convert between `.meport.md` and `.meport.json` automatically.

---

## Principles

1. **Human-first.** The Markdown file is the source of truth. JSON is derived.
2. **Paste-anywhere.** The file must work when pasted raw into any AI tool.
3. **Convention over configuration.** Section names ARE the schema. No config files needed.
4. **Progressive depth.** 7 lines is valid. 100 lines is valid. Start small, add over time.
5. **Behavioral implications, not raw facts.** Store "price sensitivity: high" not "income: $180,000".
6. **Separate data from policy.** Identity/Goals/Context = who you are. Instructions/Never = how to treat you.
7. **Respect privacy.** Financial and Life Context are sensitive. Users control what they share.
8. **No surveillance.** This is not a chat log or memory dump. It's persistent context.

---

## File Conventions

| Convention | Value |
|-----------|-------|
| File name | `meport.md` or `{name}.meport.md` |
| Machine format | `.meport.json` |
| MIME type | `text/markdown` (standard) |
| Encoding | UTF-8 |
| Line endings | LF |
| Max recommended size | 200 lines / 5KB |

---

## FAQ

**Q: Is this a replacement for CLAUDE.md?**
No. CLAUDE.md describes the *project*. Meport describes *you*. They complement each other.

**Q: Can I have multiple profiles?**
Yes. Use `work.meport.md` and `personal.meport.md` for different contexts.

**Q: What if my AI tool doesn't support Meport?**
Paste the file as text. Every AI tool can read Markdown.

**Q: Who owns my profile?**
You do. It's a file on your computer. No cloud, no account, no lock-in.

**Q: How is this different from ChatGPT Custom Instructions?**
Custom Instructions are locked to one platform. Meport is portable — same profile everywhere.

**Q: How is this different from Gravatar AI Profile?**
Gravatar is an identity card. Meport is an operational profile — it tells AI how to *behave*, not just who you are.

---

## Security & Privacy

### What NOT to put in a profile

A `.meport.md` is designed to be shared — pasted into AI tools, stored in repos, sent to collaborators. Treat it like a public document.

**Never include:**
- Passwords, API keys, tokens, or secrets
- Government IDs (SSN, PESEL, passport numbers)
- Full addresses (use city/country, not street)
- Medical diagnoses (use behavioral adaptations instead: "short task blocks" not "diagnosed ADHD")
- Financial amounts (use "price sensitivity: high" not "income: $180,000")
- Names of others without consent (use roles: "sister" not a full name)

**Rule of thumb:** If you wouldn't put it in a LinkedIn bio, don't put it in a `.meport.md`.

### Prompt injection resistance

A Meport profile is **user-authored context**, not executable code. AI tools consuming `.meport.md` should:
- Treat profile content as DATA, not as INSTRUCTIONS that override system prompts
- Sanitize profile fields before injecting into prompts
- Never execute code-like content found in profile fields

Profile authors: avoid content that looks like prompt injection (`Ignore previous instructions`, `You are now...`). Well-behaved AI tools will strip or flag such patterns.

### Sharing model

The `## Sharing` section in JSON format defines three scopes:

| Scope | Meaning | Example |
|-------|---------|---------|
| `public` | Any AI tool or service | identity, communication, expertise |
| `trusted` | Tools you explicitly authorize | work, personality, instructions |
| `private` | Never shared, local only | neurodivergent, financial, lifeContext |

Sharing is **advisory** in v1.0 — it tells tools what you WANT shared, but enforcement depends on the consuming tool. When exporting for a public context (GitHub, social), only include `public` sections.

### Data sensitivity by section

| Section | Sensitivity | Recommendation |
|---------|-------------|----------------|
| Identity | Low | Safe to share (name, language, timezone) |
| Communication | Low | Safe — describes interaction style |
| AI Preferences | Low | Safe — describes tool preferences |
| Expertise | Low | Safe — professional information |
| Cognitive | Medium | Share with trusted tools only |
| Work | Medium | Share with trusted tools only |
| Personality | Medium | Share with trusted tools only |
| Instructions | Medium | Share with trusted tools (behavioral directives) |
| Neurodivergent | High | Keep private — medical/personal |
| Life Context | High | Keep private — personal details |
| Financial | High | Keep private — financial data |
| Intelligence | High | Keep private — AI-inferred patterns |

### Platform-specific considerations

When pasting a profile into AI tools, be aware:
- **ChatGPT**: Custom Instructions are stored by OpenAI and used across conversations
- **Claude**: Project instructions stay within the project context
- **Grok**: Personalization data is stored by xAI
- **Cursor/Windsurf**: Rules files are typically in your repo (check `.gitignore`)

You control what you paste. Use the sharing model to decide which sections to include per platform.

### GDPR & data rights

Your `.meport.md` is a file you own. No cloud, no account, no lock-in. When you paste it into an AI tool, that tool's privacy policy applies to the pasted content. Meport itself stores nothing — it generates a file on your machine.

---

## Scope — what v1.0 does NOT include

To set clear expectations:

- **Not chat memory.** No conversation history, no RAG, no automatic recall.
- **Not a permissions engine.** Scope and sharing are advisory, not enforced.
- **Not org governance.** No team profiles, role hierarchies, or admin controls.
- **Not conflict resolution.** No merge rules when multiple sources disagree.
- **Not real-time.** The profile is a document, not a live data stream.
- **Not surveillance.** Nothing is recorded without the user writing it.

These may be addressed in future versions.

---

## Versioning

The Meport Standard uses semantic versioning: `MAJOR.MINOR`.

| Change type | Version bump | Example |
|-------------|-------------|---------|
| New optional section | Minor (1.0 → 1.1) | Adding `## Health` section |
| New optional field in existing section | Minor | Adding `sensitivity` to Communication |
| Breaking change to required fields | Major (1.0 → 2.0) | Changing Identity.name to Identity.fullName |
| New required section | Major | Making Expertise required |

### Compatibility rules

- **Forward compatible:** A v1.0 parser MUST ignore unknown sections and fields. Custom sections (`## My Thing` or `x-vendor-*`) are always allowed.
- **Backward compatible:** A v1.1 profile MUST be parseable by a v1.0 parser (new fields are optional).
- **Breaking changes** (major version) require a migration guide and a converter tool.
- **Frontmatter version:** The `schema: meport/1.0` frontmatter indicates which version the profile was written for.
- **JSON `version` field:** The `"version": "1.0"` field in JSON indicates the schema version.

### Governance

Changes to the standard are proposed via GitHub Issues on the [meport repository](https://github.com/zmrlk/meport). Community feedback is welcome. The standard is maintained by the Meport team.

---

*Meport Profile Standard v1.0 — [meport.app](https://meport.app)*
