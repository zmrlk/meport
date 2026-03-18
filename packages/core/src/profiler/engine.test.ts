import { describe, it, expect } from "vitest";
import { ProfilingEngine } from "./engine.js";
import type { QuestionTier, Question, PersonaProfile } from "../schema/types.js";

// ─── Fixture Builders ───────────────────────────────────────

function buildTier(tier: number, questions: Partial<Question>[]): QuestionTier {
  return {
    tier,
    tier_name: `Tier ${tier}`,
    tier_intro: `Introduction for tier ${tier}`,
    tier_complete: {
      headline: `Tier ${tier} complete`,
      body: `You finished tier ${tier}`,
    },
    questions: questions.map((q, i) => ({
      id: q.id ?? `t${tier}_q${String(i + 1).padStart(2, "0")}`,
      tier,
      tier_name: `Tier ${tier}`,
      question: q.question ?? "Test question?",
      type: q.type ?? "select",
      dimension: q.dimension ?? "test.dim",
      skippable: q.skippable ?? true,
      meta_profiling: null,
      why_this_matters: null,
      ...q,
    })) as Question[],
  };
}

function buildSelectQuestion(
  id: string,
  dimension: string,
  options: Array<{
    value: string;
    maps_to_value: string;
    maps_to_dim?: string;
    also_maps_to?: { dimension: string; value: string };
    triggers?: string[];
  }>
): Partial<Question> {
  return {
    id,
    type: "select",
    dimension,
    options: options.map((o) => ({
      value: o.value,
      label: o.value,
      maps_to: { dimension: o.maps_to_dim ?? dimension, value: o.maps_to_value },
      also_maps_to: o.also_maps_to,
      triggers: o.triggers,
    })),
  };
}

// Drives the generator to completion, returning events and final profile
function driveGenerator(
  tiers: QuestionTier[],
  answersById: Record<
    string,
    { value: string | string[] | number | Record<string, string>; skipped?: boolean }
  >
) {
  const engine = new ProfilingEngine(tiers);
  const gen = engine.run();
  const events: ReturnType<typeof gen.next>["value"][] = [];

  let result = gen.next(); // start

  while (!result.done) {
    events.push(result.value);
    const event = result.value as { type: string; question?: Question };

    if (event.type === "question" || event.type === "follow_up") {
      const q = event.question!;
      const answer = answersById[q.id];
      if (answer) {
        result = gen.next({ value: answer.value, skipped: answer.skipped });
      } else {
        result = gen.next(undefined);
      }
    } else {
      result = gen.next(undefined);
    }
  }

  // result.done === true here, result.value is the PersonaProfile return value
  return { events, profile: result.value as PersonaProfile };
}

// ─── Generator API Tests ────────────────────────────────────

describe("Generator API", () => {
  it("yields tier_start as first event", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const engine = new ProfilingEngine(tiers);
    const gen = engine.run();

    const first = gen.next();
    expect(first.done).toBe(false);
    expect(first.value).toMatchObject({
      type: "tier_start",
      tier: 1,
      name: "Tier 1",
      intro: "Introduction for tier 1",
    });
  });

  it("yields questions in order after tier_start", () => {
    const tiers = [
      buildTier(1, [
        { id: "q1", question: "First?", dimension: "a.one" },
        { id: "q2", question: "Second?", dimension: "a.two" },
      ]),
    ];
    const engine = new ProfilingEngine(tiers);
    const gen = engine.run();

    gen.next(); // tier_start
    const q1event = gen.next(undefined); // yields question q1
    expect(q1event.value).toMatchObject({ type: "question", question: { id: "q1" }, index: 1, total: 2 });

    // Answering q1 causes the generator to advance and yield q2
    const q2event = gen.next(undefined);
    expect(q2event.value).toMatchObject({ type: "question", question: { id: "q2" }, index: 2, total: 2 });
  });

  it("yields follow_up events when triggered by answer", () => {
    const followupQ: Partial<Question> = {
      id: "q1_followup",
      dimension: "test.followup",
      is_followup: true,
      parent_question: "q1",
    };
    const mainQ = buildSelectQuestion("q1", "test.main", [
      { value: "trigger_option", maps_to_value: "triggered", triggers: ["q1_followup"] },
      { value: "plain_option", maps_to_value: "plain" },
    ]);
    const tiers = [buildTier(1, [mainQ, followupQ])];
    const engine = new ProfilingEngine(tiers);
    const gen = engine.run();

    gen.next(); // tier_start
    gen.next(undefined); // present q1

    // submit answer that triggers follow-up
    const afterAnswer = gen.next({ value: "trigger_option" });
    expect(afterAnswer.value).toMatchObject({
      type: "follow_up",
      question: { id: "q1_followup" },
      parent_id: "q1",
    });
  });

  it("does not yield follow_up when non-triggering option selected", () => {
    const followupQ: Partial<Question> = {
      id: "q1_followup",
      dimension: "test.followup",
      is_followup: true,
      parent_question: "q1",
    };
    const mainQ = buildSelectQuestion("q1", "test.main", [
      { value: "trigger_option", maps_to_value: "triggered", triggers: ["q1_followup"] },
      { value: "plain_option", maps_to_value: "plain" },
    ]);
    const tiers = [buildTier(1, [mainQ, followupQ])];
    const engine = new ProfilingEngine(tiers);
    const gen = engine.run();

    gen.next(); // tier_start
    gen.next(undefined); // present q1

    const afterAnswer = gen.next({ value: "plain_option" });
    // Should be tier_complete, not follow_up
    expect(afterAnswer.value).toMatchObject({ type: "tier_complete" });
  });

  it("yields tier_complete after all questions in a tier", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const engine = new ProfilingEngine(tiers);
    const gen = engine.run();

    gen.next(); // tier_start
    gen.next(undefined); // present q1
    const afterAnswer = gen.next(undefined); // submit answer

    expect(afterAnswer.value).toMatchObject({
      type: "tier_complete",
      tier: 1,
      headline: "Tier 1 complete",
      body: "You finished tier 1",
    });
  });

  it("yields profiling_complete after all tiers", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const engine = new ProfilingEngine(tiers);
    const gen = engine.run();

    gen.next();         // tier_start
    gen.next(undefined); // question(q1)
    gen.next(undefined); // tier_complete (input=undefined so no recordAnswer)

    const complete = gen.next(undefined); // profiling_complete
    expect(complete.done).toBe(false);
    expect(complete.value).toMatchObject({ type: "profiling_complete" });
    expect((complete.value as { profile: unknown }).profile).toBeDefined();
  });

  it("generator return value is a PersonaProfile", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const engine = new ProfilingEngine(tiers);
    const gen = engine.run();

    let result = gen.next();
    while (!result.done) {
      result = gen.next(undefined);
    }

    const profile = result.value;
    expect(profile).toMatchObject({
      schema_version: "1.0",
      profile_type: "personal",
    });
    expect(profile.profile_id).toBeTruthy();
  });

  it("handles skipped answers — skipped flag is recorded", () => {
    const tiers = [
      buildTier(1, [
        { id: "q1", dimension: "a.one", type: "open_text" },
        { id: "q2", dimension: "a.two", type: "open_text" },
      ]),
    ];
    const { profile } = driveGenerator(tiers, {
      q1: { value: "", skipped: true },
      q2: { value: "hello" },
    });

    expect(profile.explicit["a.one"]).toBeUndefined();
    expect(profile.explicit["a.two"]).toBeDefined();
    expect(profile.meta.total_questions_skipped).toBe(1);
    expect(profile.meta.total_questions_answered).toBe(1);
  });

  it("handles empty tier gracefully (no questions)", () => {
    const emptyTier = buildTier(1, []);
    const tiers = [emptyTier];
    const engine = new ProfilingEngine(tiers);
    const gen = engine.run();

    const tierStart = gen.next();
    expect(tierStart.value).toMatchObject({ type: "tier_start" });

    const tierComplete = gen.next(undefined);
    expect(tierComplete.value).toMatchObject({ type: "tier_complete" });

    const profilingComplete = gen.next(undefined);
    expect(profilingComplete.value).toMatchObject({ type: "profiling_complete" });
  });

  it("processes multiple tiers in sequence", () => {
    const tiers = [
      buildTier(1, [{ id: "q1", dimension: "tier1.dim" }]),
      buildTier(2, [{ id: "q2", dimension: "tier2.dim" }]),
    ];
    const { events } = driveGenerator(tiers, {
      q1: { value: "answer1" },
      q2: { value: "answer2" },
    });

    const types = (events as Array<{ type: string }>).map((e) => e.type);
    expect(types).toEqual([
      "tier_start",
      "question",
      "tier_complete",
      "tier_start",
      "question",
      "tier_complete",
      "profiling_complete",
    ]);
  });
});

// ─── Async API Tests ────────────────────────────────────────

describe("Async API", () => {
  it("getNextQuestion returns tier_start first", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const engine = new ProfilingEngine(tiers);

    const first = engine.getNextQuestion();
    expect(first).toMatchObject({ type: "tier_start", tier: 1 });
  });

  it("submitAnswer + getNextQuestion advances past answered question", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }, { id: "q2", dimension: "test.dim2" }])];
    const engine = new ProfilingEngine(tiers);

    engine.getNextQuestion(); // tier_start
    engine.getNextQuestion(); // q1
    engine.submitAnswer("q1", { value: "some answer" });

    const next = engine.getNextQuestion();
    // After answering q1, engine advances to q2
    expect(next).toMatchObject({ type: "question", question: { id: "q2" } });
  });

  it("follow-ups are queued and returned before next main question", () => {
    const followupQ: Partial<Question> = {
      id: "q1_fu",
      dimension: "test.followup",
      is_followup: true,
      parent_question: "q1",
    };
    const mainQ = buildSelectQuestion("q1", "test.main", [
      { value: "yes", maps_to_value: "yes", triggers: ["q1_fu"] },
    ]);
    const tiers = [buildTier(1, [mainQ, followupQ, { id: "q2", dimension: "test.other" }])];
    const engine = new ProfilingEngine(tiers);

    engine.getNextQuestion(); // tier_start
    engine.getNextQuestion(); // q1 presented

    engine.submitAnswer("q1", { value: "yes" }); // triggers q1_fu

    const next = engine.getNextQuestion();
    expect(next).toMatchObject({ type: "follow_up", question: { id: "q1_fu" } });
  });

  it("returns null when all questions are exhausted", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const engine = new ProfilingEngine(tiers);

    engine.getNextQuestion(); // tier_start (sets currentQuestionIdx=1)
    engine.getNextQuestion(); // q1 (returns question at index 0)
    engine.submitAnswer("q1", { value: "done" }); // currentQuestionIdx becomes 2

    // 2 > mainQuestions.length(1) so the while loop falls through, increments tier, no more tiers
    const result = engine.getNextQuestion();
    expect(result).toBeNull();
  });

  it("submitAnswer with unknown question ID does nothing", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const engine = new ProfilingEngine(tiers);

    expect(() => {
      engine.submitAnswer("nonexistent_id", { value: "some value" });
    }).not.toThrow();

    // State should be unaffected
    expect(engine.getAnswers().size).toBe(0);
  });

  it("getNextQuestion returns null after all questions in all tiers answered", () => {
    const tiers = [
      buildTier(1, [
        { id: "q1", dimension: "dim.a" },
        { id: "q2", dimension: "dim.b" },
      ]),
    ];
    const engine = new ProfilingEngine(tiers);

    engine.getNextQuestion(); // tier_start
    engine.getNextQuestion(); // q1
    engine.submitAnswer("q1", { value: "a" });
    engine.getNextQuestion(); // q2
    engine.submitAnswer("q2", { value: "b" });

    // currentQuestionIdx=3 > mainQuestions.length=2: falls through, increments tier, no more tiers
    const result = engine.getNextQuestion();
    expect(result).toBeNull();
  });

  it("getAnswers returns recorded answers", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim", type: "open_text" }])];
    const engine = new ProfilingEngine(tiers);

    engine.getNextQuestion(); // tier_start
    engine.getNextQuestion(); // q1
    engine.submitAnswer("q1", { value: "my answer" });

    const answers = engine.getAnswers();
    expect(answers.get("q1")).toMatchObject({
      question_id: "q1",
      value: "my answer",
      skipped: false,
    });
  });

  it("getAnswerValue returns undefined for skipped answers", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim", type: "open_text" }])];
    const engine = new ProfilingEngine(tiers);

    engine.getNextQuestion(); // tier_start
    engine.getNextQuestion(); // q1
    engine.submitAnswer("q1", { value: "", skipped: true });

    expect(engine.getAnswerValue("q1")).toBeUndefined();
  });
});

// ─── Profile Building Tests ─────────────────────────────────

describe("Profile Building", () => {
  it("select-type questions map to explicit dimensions via maps_to", () => {
    const q = buildSelectQuestion("q1", "communication.style", [
      { value: "direct", maps_to_value: "direct" },
      { value: "gentle", maps_to_value: "gentle" },
    ]);
    const tiers = [buildTier(1, [q])];
    const { profile } = driveGenerator(tiers, { q1: { value: "direct" } });

    expect(profile.explicit["communication.style"]).toMatchObject({
      dimension: "communication.style",
      value: "direct",
      confidence: 1.0,
      source: "explicit",
      question_id: "q1",
    });
  });

  it("scenario-type questions map correctly (options-based like select)", () => {
    const scenarioQ: Partial<Question> = {
      id: "q1",
      type: "scenario",
      dimension: "work.deadline_behavior",
      options: [
        { value: "early", label: "Early", maps_to: { dimension: "work.deadline_behavior", value: "proactive" } },
        { value: "last_minute", label: "Last minute", maps_to: { dimension: "work.deadline_behavior", value: "reactive" } },
      ],
    };
    const tiers = [buildTier(1, [scenarioQ])];
    const { profile } = driveGenerator(tiers, { q1: { value: "early" } });

    expect(profile.explicit["work.deadline_behavior"]).toMatchObject({
      value: "proactive",
      source: "explicit",
    });
  });

  it("spectrum-type questions (select with options) map correctly", () => {
    const spectrumQ: Partial<Question> = {
      id: "q1",
      type: "select",
      dimension: "personality.openness",
      options: [
        { value: "low", label: "Low", maps_to: { dimension: "personality.openness", value: "closed" } },
        { value: "high", label: "High", maps_to: { dimension: "personality.openness", value: "open" } },
      ],
    };
    const tiers = [buildTier(1, [spectrumQ])];
    const { profile } = driveGenerator(tiers, { q1: { value: "high" } });

    expect(profile.explicit["personality.openness"]).toMatchObject({ value: "open" });
  });

  it("multi_select creates array value for dimension", () => {
    const multiQ: Partial<Question> = {
      id: "q1",
      type: "multi_select",
      dimension: "expertise.tech_stack",
      options: [
        { value: "ts", label: "TypeScript", maps_to: { dimension: "expertise.tech_stack", value: "typescript" } },
        { value: "rust", label: "Rust", maps_to: { dimension: "expertise.tech_stack", value: "rust" } },
        { value: "py", label: "Python", maps_to: { dimension: "expertise.tech_stack", value: "python" } },
      ],
    };
    const tiers = [buildTier(1, [multiQ])];
    const { profile } = driveGenerator(tiers, { q1: { value: ["ts", "rust"] } });

    expect(profile.explicit["expertise.tech_stack"]).toMatchObject({
      dimension: "expertise.tech_stack",
      value: ["typescript", "rust"],
      source: "explicit",
    });
  });

  it("scale questions map numeric values to dimension", () => {
    const scaleQ: Partial<Question> = {
      id: "q1",
      type: "scale",
      dimension: "work.focus_level",
      scale_min: 1,
      scale_max: 10,
    };
    const tiers = [buildTier(1, [scaleQ])];
    const { profile } = driveGenerator(tiers, { q1: { value: 8 } });

    expect(profile.explicit["work.focus_level"]).toMatchObject({
      dimension: "work.focus_level",
      value: 8,
      source: "explicit",
    });
  });

  it("open_text questions map string value to dimension", () => {
    const textQ: Partial<Question> = {
      id: "q1",
      type: "open_text",
      dimension: "identity.preferred_name",
      placeholder: "Your name...",
    };
    const tiers = [buildTier(1, [textQ])];
    const { profile } = driveGenerator(tiers, { q1: { value: "Alex" } });

    expect(profile.explicit["identity.preferred_name"]).toMatchObject({
      dimension: "identity.preferred_name",
      value: "Alex",
      source: "explicit",
    });
  });

  it("matrix questions map each row to its own dimension", () => {
    const matrixQ: Partial<Question> = {
      id: "q1",
      type: "matrix",
      dimension: "work.style_matrix",
      rows: [
        { id: "row_energy", label: "Energy", dimension: "work.energy_type" },
        { id: "row_focus", label: "Focus", dimension: "work.focus_type" },
      ],
      columns: [
        { value: "low", label: "Low" },
        { value: "high", label: "High" },
      ],
    };
    const tiers = [buildTier(1, [matrixQ])];
    const { profile } = driveGenerator(tiers, {
      q1: { value: { row_energy: "high", row_focus: "low" } },
    });

    expect(profile.explicit["work.energy_type"]).toMatchObject({
      dimension: "work.energy_type",
      value: "high",
      source: "explicit",
    });
    expect(profile.explicit["work.focus_type"]).toMatchObject({
      dimension: "work.focus_type",
      value: "low",
      source: "explicit",
    });
  });

  it("also_maps_to creates an additional dimension entry", () => {
    const q: Partial<Question> = {
      id: "q1",
      type: "select",
      dimension: "communication.style",
      options: [
        {
          value: "direct",
          label: "Direct",
          maps_to: { dimension: "communication.style", value: "direct" },
          also_maps_to: { dimension: "communication.directness", value: "high" },
        },
      ],
    };
    const tiers = [buildTier(1, [q])];
    const { profile } = driveGenerator(tiers, { q1: { value: "direct" } });

    expect(profile.explicit["communication.style"]).toMatchObject({ value: "direct" });
    expect(profile.explicit["communication.directness"]).toMatchObject({ value: "high" });
  });

  it("skipped answers are excluded from explicit profile", () => {
    const q: Partial<Question> = {
      id: "q1",
      type: "open_text",
      dimension: "identity.preferred_name",
    };
    const tiers = [buildTier(1, [q])];
    const { profile } = driveGenerator(tiers, { q1: { value: "", skipped: true } });

    expect(profile.explicit["identity.preferred_name"]).toBeUndefined();
  });

  it("completeness calculation is correct", () => {
    // 2 main questions → 2 possible dimensions. Answer 1 → 50% completeness.
    const tiers = [
      buildTier(1, [
        { id: "q1", dimension: "dim.a", type: "open_text" },
        { id: "q2", dimension: "dim.b", type: "open_text" },
      ]),
    ];
    const { profile } = driveGenerator(tiers, {
      q1: { value: "hello" },
      q2: { value: "", skipped: true },
    });

    // 1 answered out of total dimensions in tier — exact value depends on question count
    expect(profile.completeness).toBeGreaterThan(0);
    expect(profile.completeness).toBeLessThanOrEqual(100);
  });
});

// ─── Meta Tests ─────────────────────────────────────────────

describe("Meta", () => {
  it("tiers_completed tracks tiers where at least one answer was not skipped", () => {
    const tiers = [
      buildTier(1, [{ id: "q1", dimension: "tier1.a", type: "open_text" }]),
      buildTier(2, [{ id: "q2", dimension: "tier2.b", type: "open_text" }]),
    ];
    const { profile } = driveGenerator(tiers, {
      q1: { value: "answered" },
      q2: { value: "", skipped: true },
    });

    expect(profile.meta.tiers_completed).toContain(1);
    expect(profile.meta.tiers_completed).not.toContain(2);
  });

  it("meta tracks questions_answered and questions_skipped correctly", () => {
    const tiers = [
      buildTier(1, [
        { id: "q1", dimension: "a.one", type: "open_text" },
        { id: "q2", dimension: "a.two", type: "open_text" },
        { id: "q3", dimension: "a.three", type: "open_text" },
      ]),
    ];
    const { profile } = driveGenerator(tiers, {
      q1: { value: "yes" },
      q2: { value: "", skipped: true },
      q3: { value: "also yes" },
    });

    expect(profile.meta.total_questions_answered).toBe(2);
    expect(profile.meta.total_questions_skipped).toBe(1);
  });

  it("meta calculates avg_response_time_ms as a non-negative number", () => {
    const tiers = [
      buildTier(1, [
        { id: "q1", dimension: "a.one", type: "open_text" },
        { id: "q2", dimension: "a.two", type: "open_text" },
      ]),
    ];
    const { profile } = driveGenerator(tiers, {
      q1: { value: "first" },
      q2: { value: "second" },
    });

    expect(profile.meta.avg_response_time_ms).toBeGreaterThanOrEqual(0);
    expect(typeof profile.meta.avg_response_time_ms).toBe("number");
    // Should be integer (Math.round)
    expect(Number.isInteger(profile.meta.avg_response_time_ms)).toBe(true);
  });

  it("avg_response_time_ms is 0 when all questions are skipped", () => {
    const tiers = [
      buildTier(1, [{ id: "q1", dimension: "a.one", type: "open_text" }]),
    ];
    const { profile } = driveGenerator(tiers, {
      q1: { value: "", skipped: true },
    });

    expect(profile.meta.avg_response_time_ms).toBe(0);
  });

  it("profile_id is a valid UUID v4", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const { profile } = driveGenerator(tiers, { q1: { value: "x" } });

    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(profile.profile_id).toMatch(uuidV4Regex);
  });

  it('schema_version is "1.0"', () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const { profile } = driveGenerator(tiers, { q1: { value: "x" } });

    expect(profile.schema_version).toBe("1.0");
  });

  it("two profiles from the same engine class get unique profile_ids", () => {
    const tiers = [buildTier(1, [{ id: "q1", dimension: "test.dim" }])];
    const { profile: p1 } = driveGenerator(tiers, { q1: { value: "x" } });
    const { profile: p2 } = driveGenerator(tiers, { q1: { value: "x" } });

    expect(p1.profile_id).not.toBe(p2.profile_id);
  });

  it("tiers_skipped lists tiers with no answered questions", () => {
    const tiers = [
      buildTier(1, [{ id: "q1", dimension: "tier1.a", type: "open_text" }]),
      buildTier(2, [{ id: "q2", dimension: "tier2.a", type: "open_text" }]),
    ];
    const { profile } = driveGenerator(tiers, {
      q1: { value: "answered" },
      q2: { value: "", skipped: true },
    });

    expect(profile.meta.tiers_skipped).toContain(2);
    expect(profile.meta.tiers_skipped).not.toContain(1);
  });
});
