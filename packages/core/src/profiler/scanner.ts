/**
 * System Scanner — Phase 0 of Full Session
 *
 * Two modes:
 * 1. System scan (auto, no consent needed):
 *    - Locale + timezone, .gitconfig, project files, AI configs
 * 2. File scan (requires consent):
 *    - CV/resume, LinkedIn export, bio, notes, chat exports
 *    - Extracts: occupation, industry, skills, location, interests
 *
 * Returns a ScanContext that pre-fills dimensions,
 * enabling confirm mode and skip_if in the profiling engine.
 */

import { readFile, stat, readdir } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import type { ScanContext } from "./pack-engine.js";

interface ScanResult {
  context: ScanContext;
  sources: string[];
}

export interface FileScanOptions {
  /** Paths to scan (files or folders) */
  paths: string[];
  /** Skip consent check (for testing) */
  skipConsent?: boolean;
}

// ─── Main Scanner ────────────────────────────────────────

export async function runSystemScan(
  projectDir?: string
): Promise<ScanResult> {
  const dimensions = new Map<
    string,
    { value: string; confidence: number; source: string }
  >();
  const sources: string[] = [];

  // Run all detectors in parallel
  const detectors = [
    detectLocale(dimensions, sources),
    detectTimezone(dimensions, sources),
    detectGitConfig(dimensions, sources),
    detectAIConfigs(dimensions, sources),
  ];

  if (projectDir) {
    detectors.push(detectTechStack(projectDir, dimensions, sources));
  }

  await Promise.allSettled(detectors);

  return {
    context: { dimensions },
    sources,
  };
}

/**
 * File-based scanning — reads user's personal files to extract profile dimensions.
 * Requires explicit consent. Runs locally, never uploads anything.
 *
 * Supported file types:
 * - CV / resume (PDF text, DOCX, TXT, MD)
 * - LinkedIn export (CSV/JSON)
 * - Bio / about page (TXT, MD)
 * - Notes / journal (TXT, MD)
 * - Chat exports (TXT, JSON)
 * - Calendar (.ics)
 * - Browser bookmarks (HTML)
 * - Todo lists (TXT, MD)
 */
export async function runFileScan(
  options: FileScanOptions
): Promise<ScanResult> {
  const dimensions = new Map<
    string,
    { value: string; confidence: number; source: string }
  >();
  const sources: string[] = [];

  // Collect all files to scan
  const files: string[] = [];
  for (const p of options.paths) {
    try {
      const s = await stat(p);
      if (s.isDirectory()) {
        const entries = await readdir(p);
        for (const entry of entries) {
          const ext = extname(entry).toLowerCase();
          if (SCANNABLE_EXTENSIONS.has(ext)) {
            files.push(join(p, entry));
          }
        }
      } else {
        files.push(p);
      }
    } catch {
      // Skip inaccessible paths
    }
  }

  if (files.length === 0) {
    return { context: { dimensions }, sources };
  }

  // Classify and scan each file
  const scanners = files.map(async (file) => {
    const ext = extname(file).toLowerCase();
    const name = basename(file).toLowerCase();
    const content = await safeReadFile(file);
    if (!content) return;

    // Classify file type and extract dimensions
    if (isResume(name, content)) {
      extractFromResume(content, name, dimensions, sources);
    } else if (isLinkedInExport(name, content)) {
      extractFromLinkedIn(content, name, dimensions, sources);
    } else if (isBioOrAbout(name)) {
      extractFromBio(content, name, dimensions, sources);
    } else if (isCalendar(name, ext)) {
      extractFromCalendar(content, name, dimensions, sources);
    } else if (isBookmarks(name, ext)) {
      extractFromBookmarks(content, name, dimensions, sources);
    } else if (isTodoOrNotes(name, content)) {
      extractFromNotes(content, name, dimensions, sources);
    }
  });

  await Promise.allSettled(scanners);

  return { context: { dimensions }, sources };
}

const SCANNABLE_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".html", ".htm", ".ics",
]);

// ─── File Classification ────────────────────────────────

function isResume(name: string, content: string): boolean {
  const nameSignals = /cv|resume|lebenslauf|życiorys/i.test(name);
  const contentSignals = /experience|education|skills|employment|work history|doświadczenie|wykształcenie|umiejętności/i.test(content);
  return nameSignals || (contentSignals && content.length > 200);
}

function isLinkedInExport(name: string, content: string): boolean {
  return /linkedin/i.test(name) || /first name,last name|"First Name","Last Name"/i.test(content.slice(0, 200));
}

function isBioOrAbout(name: string): boolean {
  return /bio|about|about.me|o.mnie|profil/i.test(name);
}

function isCalendar(name: string, ext: string): boolean {
  return ext === ".ics" || /calendar|kalendarz/i.test(name);
}

function isBookmarks(name: string, ext: string): boolean {
  return /bookmark/i.test(name) && (ext === ".html" || ext === ".htm");
}

function isTodoOrNotes(name: string, content: string): boolean {
  return /todo|tasks|notes|notatki|zadania/i.test(name);
}

// ─── Extraction Logic ───────────────────────────────────

type Dims = Map<string, { value: string; confidence: number; source: string }>;

function extractFromResume(content: string, filename: string, dims: Dims, sources: string[]): void {
  sources.push(`resume: ${filename}`);

  // Extract skills/tech
  const skills = extractSkills(content);
  if (skills.length > 0) {
    dims.set("expertise.tech_stack", {
      value: skills.join(", "),
      confidence: 0.8,
      source: "resume",
    });
  }

  // Extract job title / occupation
  const titlePatterns = [
    /(?:title|position|role|stanowisko)[:\s]+([^\n]+)/i,
    /(?:senior|junior|lead|head|manager|director|engineer|developer|designer|analyst|consultant|architect|specialist|coordinator)\s+\w+/i,
  ];
  for (const pattern of titlePatterns) {
    const match = content.match(pattern);
    if (match) {
      dims.set("context.occupation", {
        value: match[1]?.trim() || match[0].trim(),
        confidence: 0.7,
        source: "resume",
      });
      break;
    }
  }

  // Extract location
  const locationPatterns = [
    /(?:location|city|adres|miasto|lokalizacja)[:\s]+([^\n,]+(?:,\s*[^\n]+)?)/i,
    /(?:based in|living in|mieszkam w|z siedzibą w)\s+([^\n.]+)/i,
  ];
  for (const pattern of locationPatterns) {
    const match = content.match(pattern);
    if (match) {
      dims.set("context.location", {
        value: match[1].trim(),
        confidence: 0.7,
        source: "resume",
      });
      break;
    }
  }

  // Extract education level → life stage hint
  if (/(?:currently studying|student|w trakcie studiów|studia)/i.test(content)) {
    dims.set("context.life_stage", {
      value: "student",
      confidence: 0.6,
      source: "resume",
    });
  }

  // Extract industry
  const industryPatterns = [
    /(?:industry|branża|sektor)[:\s]+([^\n]+)/i,
  ];
  for (const pattern of industryPatterns) {
    const match = content.match(pattern);
    if (match) {
      dims.set("context.industry", {
        value: match[1].trim(),
        confidence: 0.65,
        source: "resume",
      });
      break;
    }
  }
}

function extractFromLinkedIn(content: string, filename: string, dims: Dims, sources: string[]): void {
  sources.push(`linkedin: ${filename}`);

  // CSV format: First Name,Last Name,Email,Company,Position,Connected On
  const lines = content.split("\n");
  if (lines.length < 2) return;

  const header = lines[0].toLowerCase();

  // LinkedIn profile export (single person)
  if (/first name|headline|summary/i.test(header)) {
    const fields = parseCSVLine(lines[1]);
    const headerFields = parseCSVLine(lines[0]);

    for (let i = 0; i < headerFields.length; i++) {
      const h = headerFields[i].toLowerCase().trim();
      const v = fields[i]?.trim();
      if (!v) continue;

      if (h === "headline" || h === "title") {
        dims.set("context.occupation", { value: v, confidence: 0.85, source: "linkedin" });
      }
      if (h === "industry") {
        dims.set("context.industry", { value: v, confidence: 0.8, source: "linkedin" });
      }
      if (h === "location" || h === "geo location") {
        dims.set("context.location", { value: v, confidence: 0.8, source: "linkedin" });
      }
      if (h === "summary" && v.length > 50) {
        // Could extract current focus from summary
        dims.set("context.current_focus", { value: v.slice(0, 200), confidence: 0.5, source: "linkedin" });
      }
    }
  }
}

function extractFromBio(content: string, filename: string, dims: Dims, sources: string[]): void {
  sources.push(`bio: ${filename}`);

  // Bio is usually short — extract what we can
  if (content.length < 20) return;

  // Look for occupation-like statements
  const occupationPatterns = [
    /(?:I'm|I am|jestem)\s+(?:a\s+)?(\w+(?:\s+\w+){0,3})/i,
    /^(\w+(?:\s+\w+){0,2})\s+(?:at|w|@)\s+(.+)$/im,
  ];

  for (const pattern of occupationPatterns) {
    const match = content.match(pattern);
    if (match) {
      if (!dims.has("context.occupation")) {
        dims.set("context.occupation", {
          value: match[1].trim(),
          confidence: 0.6,
          source: "bio",
        });
      }
      if (match[2] && !dims.has("context.industry")) {
        dims.set("context.industry", {
          value: match[2].trim(),
          confidence: 0.5,
          source: "bio",
        });
      }
      break;
    }
  }

  // Location
  const locMatch = content.match(/(?:based in|from|z|w)\s+([A-ZŁŚŻŹĆŃÓĘĄa-ząćęłńóśźż]{3,}(?:,\s*[A-ZŁŚŻŹĆŃÓĘĄa-ząćęłńóśźż]+)?)/);
  if (locMatch && !dims.has("context.location")) {
    dims.set("context.location", {
      value: locMatch[1].trim(),
      confidence: 0.5,
      source: "bio",
    });
  }
}

function extractFromCalendar(content: string, filename: string, dims: Dims, sources: string[]): void {
  sources.push(`calendar: ${filename}`);

  // Parse .ics to find peak meeting hours
  const hourCounts = new Array(24).fill(0);
  const dtMatches = content.matchAll(/DTSTART[^:]*:(\d{4})(\d{2})(\d{2})T(\d{2})/g);

  for (const m of dtMatches) {
    const hour = parseInt(m[4], 10);
    if (hour >= 0 && hour < 24) {
      hourCounts[hour]++;
    }
  }

  const totalEvents = hourCounts.reduce((a, b) => a + b, 0);
  if (totalEvents < 5) return; // Not enough data

  // Find peak hours
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  let archetype: string;
  if (peakHour < 12) archetype = "morning";
  else if (peakHour < 17) archetype = "afternoon";
  else archetype = "night";

  dims.set("work.energy_archetype", {
    value: archetype,
    confidence: 0.5, // Low — calendar ≠ energy
    source: "calendar",
  });
}

function extractFromBookmarks(content: string, filename: string, dims: Dims, sources: string[]): void {
  sources.push(`bookmarks: ${filename}`);

  // Extract bookmark URLs to detect interests/tools
  const urls = content.match(/HREF="([^"]+)"/gi) || [];
  const toolDomains = new Map<string, string>([
    ["notion.so", "Notion"],
    ["figma.com", "Figma"],
    ["github.com", "GitHub"],
    ["gitlab.com", "GitLab"],
    ["slack.com", "Slack"],
    ["linear.app", "Linear"],
    ["trello.com", "Trello"],
    ["asana.com", "Asana"],
    ["vercel.com", "Vercel"],
    ["netlify.com", "Netlify"],
    ["supabase.com", "Supabase"],
    ["firebase.google.com", "Firebase"],
  ]);

  const detectedTools: string[] = [];
  for (const url of urls) {
    for (const [domain, tool] of toolDomains) {
      if (url.includes(domain) && !detectedTools.includes(tool)) {
        detectedTools.push(tool);
      }
    }
  }

  if (detectedTools.length > 0) {
    dims.set("context.tools", {
      value: detectedTools.join(", "),
      confidence: 0.6,
      source: "bookmarks",
    });
  }
}

function extractFromNotes(content: string, filename: string, dims: Dims, sources: string[]): void {
  sources.push(`notes: ${filename}`);

  // Extract tools mentioned in notes/todos
  const tools = extractTools(content);
  if (tools.length > 0 && !dims.has("context.tools")) {
    dims.set("context.tools", {
      value: tools.join(", "),
      confidence: 0.5,
      source: "notes",
    });
  }
}

// ─── Shared Extractors ──────────────────────────────────

const KNOWN_SKILLS = [
  "JavaScript", "TypeScript", "Python", "Rust", "Go", "Java", "Kotlin", "Swift",
  "C#", "C++", "PHP", "Ruby", "Elixir", "Scala", "Haskell",
  "React", "Vue", "Angular", "Svelte", "Next.js", "Nuxt", "SvelteKit",
  "Node.js", "Express", "FastAPI", "Django", "Rails", "Spring",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite",
  "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Vercel", "Netlify",
  "Tailwind", "CSS", "SASS", "GraphQL", "REST",
  "Figma", "Sketch", "Photoshop", "Illustrator",
  "Git", "Linux", "Terraform", "Ansible",
  "Supabase", "Firebase", "Prisma", "Drizzle",
  "TensorFlow", "PyTorch", "scikit-learn",
  "Excel", "Power BI", "Tableau",
];

function extractSkills(content: string): string[] {
  const found: string[] = [];
  for (const skill of KNOWN_SKILLS) {
    // Word boundary match (case-insensitive)
    const regex = new RegExp(`\\b${escapeRegex(skill)}\\b`, "i");
    if (regex.test(content) && !found.includes(skill)) {
      found.push(skill);
    }
  }
  return found.slice(0, 15); // Cap at 15 most relevant
}

const KNOWN_TOOLS = [
  "VS Code", "IntelliJ", "WebStorm", "Cursor", "Vim", "Neovim", "Emacs",
  "Notion", "Obsidian", "Logseq", "Roam",
  "Slack", "Discord", "Teams", "Zoom",
  "Figma", "Canva", "Miro",
  "Jira", "Linear", "Trello", "Asana", "ClickUp", "Monday",
  "GitHub", "GitLab", "Bitbucket",
  "Postman", "Insomnia",
  "ChatGPT", "Claude", "Copilot", "Cursor",
  "Google Sheets", "Excel", "Airtable",
  "Vercel", "Netlify", "Railway", "Fly.io",
];

function extractTools(content: string): string[] {
  const found: string[] = [];
  for (const tool of KNOWN_TOOLS) {
    const regex = new RegExp(`\\b${escapeRegex(tool)}\\b`, "i");
    if (regex.test(content) && !found.includes(tool)) {
      found.push(tool);
    }
  }
  return found.slice(0, 10);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function safeReadFile(path: string): Promise<string | null> {
  try {
    const s = await stat(path);
    // Skip files larger than 1MB
    if (s.size > 1024 * 1024) return null;
    const content = await readFile(path, "utf-8");
    return stripSensitiveData(content);
  } catch {
    return null;
  }
}

// ─── Privacy Filter ──────────────────────────────────────
// Strips sensitive patterns before any processing or AI enrichment.
// Runs automatically on every file read — cannot be disabled.

const SENSITIVE_PATTERNS: [RegExp, string][] = [
  // Passwords & secrets (only key=value patterns, not bare words)
  [/(?:password|passwd|pwd|secret|api[_-]?key)\s*[:=]\s*\S+/gi, "[REDACTED]"],
  // US SSN (strict format: XXX-XX-XXXX)
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN-REDACTED]"],
  // PESEL (11 digits preceded by "PESEL" or similar context)
  [/(?:pesel|PESEL)[:\s]+\d{11}\b/g, "[PESEL-REDACTED]"],
  // NIP (10 digits preceded by "NIP" context)
  [/(?:nip|NIP)[:\s]+\d{10}\b/g, "[NIP-REDACTED]"],
  // Bank account numbers (IBAN — with or without spaces)
  [/\b[A-Z]{2}\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{0,4}\b/g, "[IBAN-REDACTED]"],
  [/\b[A-Z]{2}\d{22,30}\b/g, "[IBAN-REDACTED]"],
  // Credit card (Luhn-plausible: starts with 3/4/5/6, exactly 13-19 digits with separators)
  [/\b[3-6]\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}\b/g, "[CARD-REDACTED]"],
  // Private keys / certificates
  [/-----BEGIN (?:RSA |EC |DSA )?(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END[\s\S]*?-----/g, "[KEY-REDACTED]"],
  // Bearer tokens (long random strings)
  [/Bearer\s+[a-zA-Z0-9_-]{20,}/g, "Bearer [REDACTED]"],
  // AWS access keys (very specific prefix)
  [/(?:AKIA|ASIA)[A-Z0-9]{16}/g, "[AWS-KEY-REDACTED]"],
  // Common env var patterns with values
  [/(?:DATABASE_URL|MONGO_URI|REDIS_URL|DB_PASSWORD|SECRET_KEY|JWT_SECRET)\s*=\s*\S+/gi, "[ENV-REDACTED]"],
];

export function stripSensitiveData(content: string): string {
  let result = content;
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── Locale Detection ────────────────────────────────────

async function detectLocale(
  dims: Map<string, { value: string; confidence: number; source: string }>,
  sources: string[]
): Promise<void> {
  // Try LANG env variable first
  const lang = process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE;

  if (lang) {
    // Parse "en_US.UTF-8" → "en"
    const match = lang.match(/^([a-z]{2})/i);
    if (match) {
      const langCode = match[1].toLowerCase();
      dims.set("identity.language", {
        value: langCode,
        confidence: 0.85,
        source: "locale",
      });
      sources.push(`LANG=${lang}`);
    }
  }

  // Try Intl API as fallback
  if (!dims.has("identity.language")) {
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale;
      if (locale) {
        const langCode = locale.split("-")[0];
        dims.set("identity.language", {
          value: langCode,
          confidence: 0.7,
          source: "intl",
        });
        sources.push(`Intl.locale=${locale}`);
      }
    } catch {
      // Intl not available
    }
  }
}

// ─── Timezone Detection ──────────────────────────────────

async function detectTimezone(
  dims: Map<string, { value: string; confidence: number; source: string }>,
  sources: string[]
): Promise<void> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      dims.set("identity.timezone", {
        value: tz,
        confidence: 0.95,
        source: "system",
      });
      sources.push(`timezone=${tz}`);
    }
  } catch {
    // Timezone detection failed
  }
}

// ─── Git Config Detection ────────────────────────────────

async function detectGitConfig(
  dims: Map<string, { value: string; confidence: number; source: string }>,
  sources: string[]
): Promise<void> {
  const gitconfigPath = join(homedir(), ".gitconfig");

  try {
    const content = await readFile(gitconfigPath, "utf-8");
    sources.push(".gitconfig");

    // Extract name
    const nameMatch = content.match(/name\s*=\s*(.+)/i);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      dims.set("identity.preferred_name", {
        value: name,
        confidence: 0.7, // Lower — might be full name, user might want nickname
        source: "gitconfig",
      });
    }

    // Extract email domain for work context
    const emailMatch = content.match(/email\s*=\s*(.+)/i);
    if (emailMatch) {
      const email = emailMatch[1].trim();
      const domain = email.split("@")[1];
      if (domain && !isPersonalEmail(domain)) {
        dims.set("work.organization", {
          value: domain,
          confidence: 0.6,
          source: "gitconfig",
        });
      }
    }
  } catch {
    // No .gitconfig — try git config command
    try {
      const name = execSync("git config --global user.name", {
        encoding: "utf-8",
        timeout: 3000,
      }).trim();
      if (name) {
        dims.set("identity.preferred_name", {
          value: name,
          confidence: 0.7,
          source: "git-config",
        });
        sources.push("git config");
      }
    } catch {
      // No git config
    }
  }
}

// ─── Tech Stack Detection ────────────────────────────────

async function detectTechStack(
  projectDir: string,
  dims: Map<string, { value: string; confidence: number; source: string }>,
  sources: string[]
): Promise<void> {
  const detected: string[] = [];

  // Check for common config files
  const techSignals: [string, string][] = [
    ["package.json", "JavaScript/TypeScript"],
    ["tsconfig.json", "TypeScript"],
    ["Cargo.toml", "Rust"],
    ["go.mod", "Go"],
    ["requirements.txt", "Python"],
    ["pyproject.toml", "Python"],
    ["Gemfile", "Ruby"],
    ["pom.xml", "Java"],
    ["build.gradle", "Java/Kotlin"],
    ["composer.json", "PHP"],
    ["mix.exs", "Elixir"],
    ["Dockerfile", "Docker"],
    ["docker-compose.yml", "Docker"],
  ];

  const checks = techSignals.map(async ([file, tech]) => {
    try {
      await stat(join(projectDir, file));
      return tech;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(checks);
  for (const tech of results) {
    if (tech && !detected.includes(tech)) {
      detected.push(tech);
    }
  }

  // Check package.json for frameworks
  try {
    const pkgRaw = await readFile(
      join(projectDir, "package.json"),
      "utf-8"
    );
    const pkg = JSON.parse(pkgRaw);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    const frameworkSignals: [string, string][] = [
      ["react", "React"],
      ["next", "Next.js"],
      ["vue", "Vue"],
      ["nuxt", "Nuxt"],
      ["svelte", "Svelte"],
      ["@sveltejs/kit", "SvelteKit"],
      ["angular", "Angular"],
      ["express", "Express"],
      ["fastify", "Fastify"],
      ["hono", "Hono"],
      ["tailwindcss", "Tailwind CSS"],
      ["prisma", "Prisma"],
      ["drizzle-orm", "Drizzle"],
      ["vitest", "Vitest"],
      ["jest", "Jest"],
    ];

    for (const [dep, name] of frameworkSignals) {
      if (allDeps[dep] && !detected.includes(name)) {
        detected.push(name);
      }
    }
  } catch {
    // No package.json or invalid
  }

  if (detected.length > 0) {
    dims.set("expertise.tech_stack", {
      value: detected.join(", "),
      confidence: 0.9,
      source: "project-files",
    });
    sources.push(`project: ${detected.join(", ")}`);
  }
}

// ─── AI Config Detection ─────────────────────────────────

async function detectAIConfigs(
  dims: Map<string, { value: string; confidence: number; source: string }>,
  sources: string[]
): Promise<void> {
  const home = homedir();
  const aiConfigs: string[] = [];

  // Check for AI tool configs
  const configPaths: [string, string][] = [
    [join(home, ".claude"), "Claude Code"],
    [join(home, ".cursor"), "Cursor"],
    [join(home, ".continue"), "Continue"],
    [join(home, ".copilot"), "GitHub Copilot"],
    [join(home, ".ollama"), "Ollama"],
  ];

  const checks = configPaths.map(async ([path, name]) => {
    try {
      await stat(path);
      return name;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(checks);
  for (const name of results) {
    if (name) aiConfigs.push(name);
  }

  if (aiConfigs.length > 0) {
    dims.set("expertise.ai_tools", {
      value: aiConfigs.join(", "),
      confidence: 0.85,
      source: "ai-configs",
    });
    sources.push(`AI tools: ${aiConfigs.join(", ")}`);
  }

  // Check for existing meport profile
  const meportPaths = [
    join(home, ".meport-profile.json"),
    "./meport-profile.json",
  ];

  for (const path of meportPaths) {
    try {
      const raw = await readFile(path, "utf-8");
      const profile = JSON.parse(raw);
      if (profile.explicit) {
        dims.set("_existing_profile", {
          value: path,
          confidence: 1.0,
          source: "meport",
        });
        sources.push(`existing profile: ${path}`);
        break;
      }
    } catch {
      // No existing profile
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────

function isPersonalEmail(domain: string): boolean {
  const personal = [
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
    "hey.com",
    "fastmail.com",
    "tutanota.com",
    "live.com",
    "me.com",
    "mac.com",
    "aol.com",
    "mail.com",
    "wp.pl",
    "o2.pl",
    "onet.pl",
    "interia.pl",
    "gazeta.pl",
  ];
  return personal.includes(domain.toLowerCase());
}
