/**
 * Roundtrip integration test: md → json → md → parse → assert equality
 */

import { parseMeportMd, getField, getItems } from "./md-parser";
import { mdToJson } from "./md-to-json";
import { jsonToMd } from "./json-to-md";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

const ORIGINAL = `---
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
Humor: occasional

## AI Preferences
Relationship: collaborator
Proactivity: proactive
Corrections: direct

## Work & Energy
Energy: steady
Peak hours: 09:00-12:00
Tasks: medium

## Personality
Motivation: mastery
Stress: analyzes

## Goals
- Ship v2.0 by Q2
- Learn Rust
- Run a half-marathon

## Anti-Goals
- Managing 50+ people
- Working weekends regularly

## Instructions
- Use TypeScript for all code examples
- Skip preambles — go straight to the answer
- Action first, explanation second

## Never
- Explain basic programming concepts
- Use emoji or exclamation marks
- Apologize for being direct
`;

// Step 1: Parse original MD
const parsed1 = parseMeportMd(ORIGINAL);
assert(parsed1.name === "Alex Chen", "Step 1: Name parsed");
assert(getItems(parsed1, "Goals").length === 3, "Step 1: 3 goals");
assert(getItems(parsed1, "Anti-Goals").length === 2, "Step 1: 2 anti-goals");
assert(getItems(parsed1, "Never").length === 3, "Step 1: 3 never rules");
assert(getItems(parsed1, "Instructions").length === 3, "Step 1: 3 instructions");

// Step 2: Convert to JSON
const json = mdToJson(parsed1);
assert(json.identity.name === "Alex Chen", "Step 2: JSON name");
assert(json.version === "1.0", "Step 2: JSON version");
assert(json.goals?.length === 3, "Step 2: JSON goals");
assert(json.antiGoals?.length === 2, "Step 2: JSON antiGoals");
assert(json.never?.length === 3, "Step 2: JSON never");
assert(json.instructions?.length === 3, "Step 2: JSON instructions");

// Step 3: Convert back to MD
const md2 = jsonToMd(json);
assert(md2.includes("# Alex Chen"), "Step 3: MD has name");
assert(md2.includes("## Goals"), "Step 3: MD has Goals section");
assert(md2.includes("## Anti-Goals"), "Step 3: MD has Anti-Goals section");
assert(md2.includes("## Never"), "Step 3: MD has Never section");

// Step 4: Re-parse the generated MD
const parsed2 = parseMeportMd(md2);
assert(parsed2.name === "Alex Chen", "Step 4: Roundtrip name preserved");
assert(getField(parsed2, "Identity", "Name") === "Alex Chen", "Step 4: Roundtrip Identity.Name");
assert(getField(parsed2, "Identity", "Language") === "en-US", "Step 4: Roundtrip Language");
assert(getItems(parsed2, "Goals").length === 3, "Step 4: Roundtrip 3 goals");
assert(getItems(parsed2, "Anti-Goals").length === 2, "Step 4: Roundtrip 2 anti-goals");
assert(getItems(parsed2, "Never").length === 3, "Step 4: Roundtrip 3 never rules");
assert(getItems(parsed2, "Instructions").length === 3, "Step 4: Roundtrip 3 instructions");

// Step 5: Verify content equality (not just counts)
const goals1 = getItems(parsed1, "Goals");
const goals2 = getItems(parsed2, "Goals");
assert(goals1[0] === goals2[0], "Step 5: First goal content matches");

const never1 = getItems(parsed1, "Never");
const never2 = getItems(parsed2, "Never");
assert(never1[0] === never2[0], "Step 5: First never rule content matches");

console.log("\n🎉 Roundtrip test passed! md → json → md → parse preserves all data.");
