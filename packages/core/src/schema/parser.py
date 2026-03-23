"""
Meport Markdown Parser — Python reference implementation

Parses .meport.md files into structured dictionaries.
Zero dependencies. Works with Python 3.7+.

Usage:
    from parser import parse_meport_md

    with open("profile.meport.md") as f:
        profile = parse_meport_md(f.read())

    print(profile["name"])           # "Alex Chen"
    print(profile["summary"])        # "Direct, concise, English..."
    print(profile["sections"]["Communication"]["fields"]["Directness"])  # "direct"
    print(profile["sections"]["Goals"]["items"])  # ["Ship v2.0", "Learn Rust"]
"""

import re
from typing import Dict, List, Optional, Any


def parse_meport_md(text: str) -> Dict[str, Any]:
    """Parse a .meport.md string into a structured dictionary."""
    lines = text.split("\n")

    # 1. Extract frontmatter
    frontmatter: Dict[str, str] = {}
    content_start = 0

    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                content_start = i + 1
                break
            match = re.match(r"^([^:]+):\s*(.+)$", lines[i])
            if match:
                frontmatter[match.group(1).strip()] = match.group(2).strip()

    # 2. Extract name, summary, sections
    name = ""
    summary_lines: List[str] = []
    sections: Dict[str, Dict[str, Any]] = {}
    current_section: Optional[Dict[str, Any]] = None

    for i in range(content_start, len(lines)):
        line = lines[i]

        # H1 = name
        h1 = re.match(r"^# (.+)$", line)
        if h1 and not name:
            name = h1.group(1).strip()
            continue

        # Blockquote = summary (before any H2)
        bq = re.match(r"^> (.+)$", line)
        if bq and current_section is None:
            summary_lines.append(bq.group(1).strip())
            continue

        # H2 = new section
        h2 = re.match(r"^## (.+)$", line)
        if h2:
            current_section = {
                "heading": h2.group(1).strip(),
                "fields": {},
                "items": [],
                "prose": [],
            }
            sections[current_section["heading"]] = current_section
            continue

        # Skip empty lines and H3+
        if not line.strip() or line.startswith("### "):
            continue
        if current_section is None:
            continue

        # List item (- or *)
        list_match = re.match(r"^[-*]\s+(.+)$", line)
        if list_match:
            current_section["items"].append(list_match.group(1).strip())
            continue

        # Bullet (•)
        bullet_match = re.match(r"^[•]\s+(.+)$", line)
        if bullet_match:
            current_section["items"].append(bullet_match.group(1).strip())
            continue

        # Key: Value
        kv = re.match(r"^([A-Za-z][^:]{0,40}):\s+(.+)$", line)
        if kv:
            current_section["fields"][kv.group(1).strip()] = kv.group(2).strip()
            continue

        # Continuation (indented)
        if re.match(r"^\s{2,}", line) and current_section["items"]:
            current_section["items"][-1] += " " + line.strip()
            continue

        # Prose
        current_section["prose"].append(line.strip())

    return {
        "schema": frontmatter.get("schema"),
        "frontmatter": frontmatter,
        "name": name,
        "summary": " ".join(summary_lines),
        "sections": sections,
    }


def get_field(profile: Dict, section: str, key: str) -> Optional[str]:
    """Get a field value from a parsed profile."""
    sec = profile["sections"].get(section)
    if sec is None:
        return None
    return sec["fields"].get(key)


def get_items(profile: Dict, section: str) -> List[str]:
    """Get list items from a section."""
    sec = profile["sections"].get(section)
    if sec is None:
        return []
    return sec["items"]


def has_section(profile: Dict, section: str) -> bool:
    """Check if a section exists."""
    return section in profile["sections"]


def get_section_names(profile: Dict) -> List[str]:
    """Get all section names."""
    return list(profile["sections"].keys())


DATA_SECTIONS = {
    "Identity", "Work & Energy", "Personality", "Life Context",
    "Financial", "Goals", "Anti-Goals", "Expertise",
}
POLICY_SECTIONS = {
    "Communication", "AI Preferences", "Instructions", "Never",
}


def classify_section(name: str) -> str:
    """Classify a section as 'data', 'policy', or 'custom'."""
    if name in DATA_SECTIONS:
        return "data"
    if name in POLICY_SECTIONS:
        return "policy"
    return "custom"


# ─── Self-test ──────────────────────────────────────────

if __name__ == "__main__":
    TEST_PROFILE = """---
schema: meport/1.0
---

# Alex Chen
> Direct, concise, English. Senior engineer.
> Coffee-fueled. Peak: 9-12.

## Identity
Name: Alex Chen
Language: en-US
Timezone: America/Los_Angeles

## Communication
Directness: direct
Verbosity: concise

## Goals
- Ship v2.0 by Q2
- Learn Rust

## Anti-Goals
- Managing 50+ people

## Instructions
- Use TypeScript for all examples
- Skip preambles

## Never
- Explain basic concepts
- Use emoji
"""

    p = parse_meport_md(TEST_PROFILE)

    assert p["name"] == "Alex Chen", f"Name: {p['name']}"
    assert p["schema"] == "meport/1.0", f"Schema: {p['schema']}"
    assert "Direct" in p["summary"], f"Summary: {p['summary']}"
    assert "Coffee" in p["summary"], f"Multi-line summary: {p['summary']}"
    assert get_field(p, "Identity", "Name") == "Alex Chen"
    assert get_field(p, "Identity", "Language") == "en-US"
    assert get_field(p, "Communication", "Directness") == "direct"
    assert len(get_items(p, "Goals")) == 2
    assert len(get_items(p, "Anti-Goals")) == 1
    assert len(get_items(p, "Instructions")) == 2
    assert len(get_items(p, "Never")) == 2
    assert classify_section("Identity") == "data"
    assert classify_section("Communication") == "policy"
    assert classify_section("Custom Thing") == "custom"
    assert has_section(p, "Goals")
    assert not has_section(p, "Nonexistent")

    print("✅ All Python parser tests passed!")
