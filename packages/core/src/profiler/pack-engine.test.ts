/**
 * Pack Profiling Engine Tests
 */

import { describe, it, expect } from "vitest";
import { PackProfilingEngine, type PackAnswerInput } from "./pack-engine.js";
import type { Pack } from "./pack-loader.js";

// ─── Test Fixtures ──────────────────────────────────────────

const microSetupPack: Pack = {
  pack: "micro-setup",
  pack_name: "Micro Setup",
  pack_intro: "4 quick questions to get started.",
  required: true,
  sensitive: false,
  questions: [
    {
      id: "setup_q01",
      pack: "micro-setup",
      question: "What should AI call you?",
      type: "open_text",
      dimension: "identity.preferred_name",
      skippable: false,
      meta_profiling: null,
      why_this_matters: null,
      placeholder: "Your name",
    },
    {
      id: "setup_q02",
      pack: "micro-setup",
      question: "Verbose response reaction?",
      type: "select",
      dimension: "communication.verbosity_preference",
      skippable: false,
      meta_profiling: "response_time",
      why_this_matters: null,
      options: [
        {
          value: "frustrated",
          label: "Frustrated",
          maps_to: { dimension: "communication.verbosity_preference", value: "minimal" },
          also_maps_to: { dimension: "communication.directness", value: "very_direct" },
          export_rule: "Max 5 lines for simple questions.",
        },
        {
          value: "likes_detail",
          label: "I like detail",
          maps_to: { dimension: "communication.verbosity_preference", value: "detailed" },
          export_rule: "Include full reasoning and context.",
        },
      ],
    },
    {
      id: "setup_q03",
      pack: "micro-setup",
      question: "Anti-patterns?",
      type: "multi_select",
      dimension: "communication.anti_patterns",
      skippable: true,
      meta_profiling: null,
      why_this_matters: null,
      options: [
        {
          value: "no_emoji",
          label: "No emoji",
          maps_to: { dimension: "communication.anti_patterns", value: "no_emoji" },
          export_rule: "Never use emoji.",
        },
        {
          value: "no_praise",
          label: "No praise",
          maps_to: { dimension: "communication.anti_patterns", value: "no_praise" },
          export_rule: "Never start with praise.",
        },
      ],
    },
    {
      id: "setup_q04",
      pack: "micro-setup",
      question: "Which packs?",
      type: "multi_select",
      dimension: "selected_packs",
      skippable: false,
      meta_profiling: null,
      why_this_matters: null,
      options: [
        { value: "work", label: "Work", maps_to: { dimension: "selected_packs", value: "work" } },
        { value: "lifestyle", label: "Lifestyle", maps_to: { dimension: "selected_packs", value: "lifestyle" } },
      ],
    },
  ],
};

const workPack: Pack = {
  pack: "work",
  pack_name: "Work & Productivity",
  pack_intro: "How you work best.",
  required: false,
  sensitive: false,
  questions: [
    {
      id: "work_q01",
      pack: "work",
      question: "Deadline in 3 days?",
      type: "select",
      dimension: "work.deadline_behavior",
      skippable: true,
      meta_profiling: null,
      why_this_matters: null,
      options: [
        {
          value: "pressure_thrive",
          label: "Thrive on pressure",
          maps_to: { dimension: "work.deadline_behavior", value: "pressure_driven" },
          export_rule: "I work best under pressure.",
        },
      ],
    },
    {
      id: "work_q02",
      pack: "work",
      question: "When does your brain work best?",
      type: "select",
      dimension: "work.energy_archetype",
      skippable: true,
      meta_profiling: null,
      why_this_matters: null,
      skip_if: "work.peak_hours.confidence > 0.8",
      options: [
        {
          value: "burst",
          label: "Unpredictable bursts",
          maps_to: { dimension: "work.energy_archetype", value: "burst" },
          export_rule: "My energy is unpredictable. Suggest short tasks.",
        },
      ],
    },
  ],
};

// ─── Tests ──────────────────────────────────────────────────

describe("PackProfilingEngine", () => {
  it("runs micro-setup flow and produces profile", () => {
    const engine = new PackProfilingEngine(microSetupPack);
    const gen = engine.run();

    // pack_start
    let event = gen.next();
    expect(event.value).toMatchObject({ type: "pack_start", pack: "micro-setup" });

    // Q1 — name (open text)
    event = gen.next(undefined);
    expect(event.value).toMatchObject({ type: "question" });
    expect((event.value as any).question.id).toBe("setup_q01");

    // Answer Q1
    event = gen.next({ value: "Alex — coding" });
    expect(event.value).toMatchObject({ type: "question" });
    expect((event.value as any).question.id).toBe("setup_q02");

    // Answer Q2
    event = gen.next({ value: "frustrated" });
    expect(event.value).toMatchObject({ type: "question" });
    expect((event.value as any).question.id).toBe("setup_q03");

    // Answer Q3 (multi-select)
    event = gen.next({ value: ["no_emoji", "no_praise"] });
    expect(event.value).toMatchObject({ type: "pack_selection" });

    // Answer Q4 (pack selection)
    event = gen.next({ value: ["work"] });
    expect(event.value).toMatchObject({ type: "pack_complete", pack: "micro-setup" });

    // Preview
    event = gen.next(undefined);
    expect(event.value).toMatchObject({ type: "preview_ready" });
    const preview = (event.value as any).profile;
    expect(preview.explicit["identity.preferred_name"]?.value).toBe("Alex");
    expect(preview.explicit["communication.verbosity_preference"]?.value).toBe("minimal");
    expect(preview.explicit["communication.directness"]?.value).toBe("very_direct");

    // Profiling complete (no more packs loaded)
    event = gen.next(undefined);
    expect(event.value).toMatchObject({ type: "profiling_complete" });
  });

  it("collects export rules from selected options", () => {
    const engine = new PackProfilingEngine(microSetupPack);
    const gen = engine.run();

    gen.next(); // pack_start
    gen.next(undefined); // Q1
    gen.next({ value: "Test" }); // answer Q1
    gen.next({ value: "frustrated" }); // answer Q2
    gen.next({ value: ["no_emoji"] }); // answer Q3
    gen.next({ value: ["work"] }); // answer Q4 (pack selection)
    gen.next(undefined); // pack_complete
    gen.next(undefined); // preview

    const exportRules = engine.getExportRules();
    expect(exportRules.get("communication.verbosity_preference:minimal")).toEqual(
      ["Max 5 lines for simple questions."]
    );
    expect(exportRules.get("communication.anti_patterns:no_emoji")).toEqual(
      ["Never use emoji."]
    );
  });

  it("runs work pack after micro-setup", () => {
    const engine = new PackProfilingEngine(microSetupPack);
    engine.addPacks([workPack]);

    const gen = engine.run();

    // Run through micro-setup
    gen.next(); // pack_start micro-setup
    gen.next(undefined); // Q1
    gen.next({ value: "Test" }); // answer Q1 → Q2
    gen.next({ value: "frustrated" }); // answer Q2 → Q3
    gen.next({ value: [] }); // answer Q3 → Q4 (pack_selection)
    const packComplete = gen.next({ value: ["work"] }); // answer Q4 → pack_complete
    expect(packComplete.value).toMatchObject({ type: "pack_complete" });
    const preview = gen.next(undefined); // → preview_ready
    expect(preview.value).toMatchObject({ type: "preview_ready" });

    // Work pack starts
    const workStart = gen.next(undefined);
    expect(workStart.value).toMatchObject({ type: "pack_start", pack: "work" });

    // Work Q1
    const wq1 = gen.next(undefined);
    expect(wq1.value).toMatchObject({ type: "question" });
    expect((wq1.value as any).question.id).toBe("work_q01");

    // Answer work Q1
    const wq2 = gen.next({ value: "pressure_thrive" });
    expect(wq2.value).toMatchObject({ type: "question" });
    expect((wq2.value as any).question.id).toBe("work_q02");
  });

  it("skips questions when scan provides high-confidence data", () => {
    const engine = new PackProfilingEngine(microSetupPack, {
      dimensions: new Map([
        ["work.peak_hours", { value: "10:00-14:00", confidence: 0.9, source: "calendar" }],
      ]),
    });
    engine.addPacks([workPack]);

    const gen = engine.run();

    // Run through micro-setup
    gen.next(); // pack_start micro-setup
    gen.next(undefined); // Q1
    gen.next({ value: "Test" }); // answer Q1 → Q2
    gen.next({ value: "frustrated" }); // answer Q2 → Q3
    gen.next({ value: [] }); // answer Q3 → Q4 (pack_selection)
    const packComplete = gen.next({ value: ["work"] }); // answer Q4 → pack_complete
    expect(packComplete.value).toMatchObject({ type: "pack_complete" });
    const preview = gen.next(undefined); // → preview_ready
    expect(preview.value).toMatchObject({ type: "preview_ready" });

    // Work pack
    const workStart = gen.next(undefined); // pack_start work
    expect(workStart.value).toMatchObject({ type: "pack_start", pack: "work" });

    // Should get work_q01, NOT work_q02 (skipped by skip_if)
    const q = gen.next(undefined);
    expect((q.value as any).question.id).toBe("work_q01");

    // Answer Q1 → should go to pack_complete (Q2 skipped)
    const next = gen.next({ value: "pressure_thrive" });
    expect(next.value).toMatchObject({ type: "pack_complete", pack: "work" });
  });

  it("handles skipped answers", () => {
    const engine = new PackProfilingEngine(microSetupPack);
    const gen = engine.run();

    gen.next(); // pack_start
    gen.next(undefined); // Q1
    gen.next({ value: "Test" }); // answer Q1
    gen.next({ value: "frustrated" }); // answer Q2
    gen.next({ value: [], skipped: true }); // skip Q3
    gen.next({ value: ["work"] }); // Q4
    gen.next(undefined); // pack_complete
    const preview = gen.next(undefined);

    const profile = (preview.value as any).profile;
    // Anti-patterns should not be in profile since it was skipped
    expect(profile.explicit["communication.anti_patterns"]).toBeUndefined();
  });

  it("includes scan-detected dimensions in profile", () => {
    const engine = new PackProfilingEngine(microSetupPack, {
      dimensions: new Map([
        ["identity.language", { value: "pl", confidence: 0.95, source: "locale" }],
        ["expertise.tech_stack", { value: "TypeScript, Svelte", confidence: 0.9, source: "gitconfig" }],
      ]),
    });

    const gen = engine.run();

    gen.next(); gen.next(undefined);
    gen.next({ value: "Alex" });
    gen.next({ value: "frustrated" });
    gen.next({ value: [] });
    gen.next({ value: [] });
    gen.next(undefined);
    const preview = gen.next(undefined);

    const profile = (preview.value as any).profile;
    expect(profile.explicit["identity.language"]?.value).toBe("pl");
    expect(profile.explicit["expertise.tech_stack"]?.value).toBe("TypeScript, Svelte");
  });

  it("parses name with use case from Q1", () => {
    const engine = new PackProfilingEngine(microSetupPack);
    const gen = engine.run();

    gen.next(); gen.next(undefined);
    gen.next({ value: "Alex — coding and business" });
    gen.next({ value: "likes_detail" });
    gen.next({ value: [] });
    gen.next({ value: [] });
    gen.next(undefined);
    const preview = gen.next(undefined);

    const profile = (preview.value as any).profile;
    expect(profile.explicit["identity.preferred_name"]?.value).toBe("Alex");
    expect(profile.explicit["primary_use_case"]?.value).toBe("coding and business");
  });

  it("calculates completeness correctly", () => {
    const engine = new PackProfilingEngine(microSetupPack);
    const gen = engine.run();

    gen.next(); gen.next(undefined);
    gen.next({ value: "Test" });
    gen.next({ value: "frustrated" });
    gen.next({ value: ["no_emoji"] });
    gen.next({ value: [] });
    gen.next(undefined);
    const preview = gen.next(undefined);

    const profile = (preview.value as any).profile;
    expect(profile.completeness).toBeGreaterThan(0);
    expect(profile.completeness).toBeLessThanOrEqual(100);
  });

  it("tracks meta: answered, skipped, timing", () => {
    const engine = new PackProfilingEngine(microSetupPack);
    const gen = engine.run();

    gen.next(); gen.next(undefined);
    gen.next({ value: "Test" });
    gen.next({ value: "frustrated" });
    gen.next({ value: [], skipped: true });
    gen.next({ value: [] });
    gen.next(undefined);

    const result = gen.next(undefined);
    const profile = (result.value as any).profile;

    expect(profile.meta.total_questions_answered).toBe(3); // Q1, Q2, Q4
    expect(profile.meta.total_questions_skipped).toBe(1); // Q3
    expect(profile.meta.profiling_duration_ms).toBeGreaterThanOrEqual(0);
    expect(profile.meta.profiling_method).toBe("interactive");
  });

  it("emits confirm event for moderate-confidence scan dimensions", () => {
    // Create a work pack with a question whose dimension was detected at 0.7 confidence
    const engine = new PackProfilingEngine(microSetupPack, {
      dimensions: new Map([
        ["work.deadline_behavior", { value: "pressure_driven", confidence: 0.7, source: "calendar" }],
      ]),
    });
    engine.addPacks([workPack]);

    const gen = engine.run();

    // Run through micro-setup
    gen.next(); // pack_start
    gen.next(undefined); // Q1
    gen.next({ value: "Test" }); // Q2
    gen.next({ value: "frustrated" }); // Q3
    gen.next({ value: [] }); // Q4 (pack_selection)
    gen.next({ value: ["work"] }); // pack_complete
    gen.next(undefined); // preview_ready
    gen.next(undefined); // pack_start work

    // work_q01 dimension = "work.deadline_behavior" was detected at 0.7
    // Should emit "confirm" instead of "question"
    const q = gen.next(undefined);
    expect(q.value).toMatchObject({
      type: "confirm",
      detectedValue: "pressure_driven",
      detectedSource: "calendar",
    });
    expect((q.value as any).question.id).toBe("work_q01");
  });

  it("emits question for low-confidence scan dimensions", () => {
    // 0.3 confidence = too low for confirm, should ask full question
    const engine = new PackProfilingEngine(microSetupPack, {
      dimensions: new Map([
        ["work.deadline_behavior", { value: "pressure_driven", confidence: 0.3, source: "guess" }],
      ]),
    });
    engine.addPacks([workPack]);

    const gen = engine.run();

    gen.next(); gen.next(undefined);
    gen.next({ value: "Test" });
    gen.next({ value: "frustrated" });
    gen.next({ value: [] });
    gen.next({ value: ["work"] });
    gen.next(undefined); gen.next(undefined);

    const q = gen.next(undefined);
    expect(q.value).toMatchObject({ type: "question" });
    expect((q.value as any).question.id).toBe("work_q01");
  });
});
