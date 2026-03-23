/**
 * Meport Markdown Parser
 *
 * Parses .meport.md files into structured MeportProfile objects.
 * Designed to be dead simple — regex-based, zero dependencies.
 *
 * Handles:
 *   - YAML frontmatter (optional)
 *   - H1 = name
 *   - Blockquote = summary
 *   - H2 = sections
 *   - Key: Value = structured fields
 *   - - Item = list items
 */

export interface ParsedProfile {
  /** Schema version from frontmatter */
  schema?: string;

  /** Raw frontmatter key-values */
  frontmatter: Record<string, string>;

  /** H1 name */
  name: string;

  /** Blockquote summary lines joined */
  summary: string;

  /** Sections keyed by H2 heading */
  sections: Record<string, ParsedSection>;
}

export interface ParsedSection {
  /** Section heading (e.g. "Communication") */
  heading: string;

  /** Key: Value pairs found in this section */
  fields: Record<string, string>;

  /** List items (- Item) found in this section */
  items: string[];

  /** Raw text lines that aren't key-value or list items */
  prose: string[];
}

/**
 * Parse a .meport.md string into a structured object.
 */
export function parseMeportMd(input: string): ParsedProfile {
  const lines = input.split("\n");

  // 1. Extract frontmatter
  const frontmatter: Record<string, string> = {};
  let contentStart = 0;

  if (lines[0]?.trim() === "---") {
    const endIdx = lines.indexOf("---", 1);
    if (endIdx > 0) {
      for (let i = 1; i < endIdx; i++) {
        const match = lines[i].match(/^([^:]+):\s*(.+)$/);
        if (match) frontmatter[match[1].trim()] = match[2].trim();
      }
      contentStart = endIdx + 1;
    }
  }

  // 2. Extract name (H1) and summary (blockquote)
  let name = "";
  const summaryLines: string[] = [];
  const sections: Record<string, ParsedSection> = {};
  let currentSection: ParsedSection | null = null;

  for (let i = contentStart; i < lines.length; i++) {
    const line = lines[i];

    // H1 = name
    const h1Match = line.match(/^# (.+)$/);
    if (h1Match && !name) {
      name = h1Match[1].trim();
      continue;
    }

    // Blockquote = summary (before any H2)
    const bqMatch = line.match(/^> (.+)$/);
    if (bqMatch && !currentSection) {
      summaryLines.push(bqMatch[1].trim());
      continue;
    }

    // H2 = new section
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      currentSection = {
        heading: h2Match[1].trim(),
        fields: {},
        items: [],
        prose: [],
      };
      sections[currentSection.heading] = currentSection;
      continue;
    }

    // Skip empty lines and H3+
    if (!line.trim() || line.startsWith("### ")) continue;
    if (!currentSection) continue;

    // List item
    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      currentSection.items.push(listMatch[1].trim());
      continue;
    }

    // Key: Value (key must not start with - or #, must have : followed by content)
    const kvMatch = line.match(/^([A-Za-z][^:]{0,40}):\s+(.+)$/);
    if (kvMatch) {
      currentSection.fields[kvMatch[1].trim()] = kvMatch[2].trim();
      continue;
    }

    // Continuation of previous value (indented)
    if (line.match(/^\s{2,}/) && currentSection.items.length > 0) {
      const lastIdx = currentSection.items.length - 1;
      currentSection.items[lastIdx] += " " + line.trim();
      continue;
    }

    // Everything else = prose
    currentSection.prose.push(line.trim());
  }

  return {
    schema: frontmatter.schema,
    frontmatter,
    name,
    summary: summaryLines.join(" "),
    sections,
  };
}

/**
 * Extract a specific field from a parsed profile.
 * Example: getField(profile, "Communication", "Directness") → "very direct"
 */
export function getField(profile: ParsedProfile, section: string, key: string): string | undefined {
  return profile.sections[section]?.fields[key];
}

/**
 * Extract all items from a section.
 * Example: getItems(profile, "Instructions") → ["Always respond in Polish...", ...]
 */
export function getItems(profile: ParsedProfile, section: string): string[] {
  return profile.sections[section]?.items ?? [];
}

/**
 * Check if a section exists in the profile.
 */
export function hasSection(profile: ParsedProfile, section: string): boolean {
  return section in profile.sections;
}

/**
 * Get all section names present in the profile.
 */
export function getSectionNames(profile: ParsedProfile): string[] {
  return Object.keys(profile.sections);
}

/**
 * Convert parsed profile to a flat key-value map for simple consumers.
 * Format: "Section.Key" → "Value"
 */
export function toFlatMap(profile: ParsedProfile): Record<string, string> {
  const map: Record<string, string> = {};
  map["name"] = profile.name;
  map["summary"] = profile.summary;

  for (const [sectionName, section] of Object.entries(profile.sections)) {
    for (const [key, value] of Object.entries(section.fields)) {
      map[`${sectionName}.${key}`] = value;
    }
    if (section.items.length > 0) {
      map[`${sectionName}._items`] = section.items.join("; ");
    }
  }

  return map;
}

// ─── Reserved section classification ────────────────────

export type SectionClass = "data" | "policy" | "custom";

const DATA_SECTIONS = new Set([
  "Identity", "Work & Energy", "Personality", "Life Context",
  "Financial", "Goals", "Anti-Goals", "Expertise",
]);

const POLICY_SECTIONS = new Set([
  "Communication", "AI Preferences", "Instructions", "Never",
]);

/**
 * Classify a section as data, policy, or custom.
 */
export function classifySection(sectionName: string): SectionClass {
  if (DATA_SECTIONS.has(sectionName)) return "data";
  if (POLICY_SECTIONS.has(sectionName)) return "policy";
  return "custom";
}
