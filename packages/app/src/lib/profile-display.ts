/**
 * Profile display utilities — human-readable labels, category grouping,
 * archetype detection, and suggestions for missing dimensions.
 */
import type { PersonaProfile } from "@meport/core/types";

// ─── Dimension → Human-readable labels ───

const dimensionLabels: Record<string, { pl: string; en: string }> = {
  // Identity
  "identity.preferred_name": { pl: "Imię", en: "Name" },
  "identity.language": { pl: "Język", en: "Language" },
  "identity.pronouns": { pl: "Zaimki", en: "Pronouns" },
  "identity.age_range": { pl: "Wiek", en: "Age range" },
  "identity.timezone_region": { pl: "Strefa czasowa", en: "Timezone" },
  "identity.timezone": { pl: "Strefa czasowa", en: "Timezone" },
  "identity.tech_comfort": { pl: "Komfort z technologią", en: "Tech comfort" },
  "identity.primary_use_case": { pl: "Główne zastosowanie AI", en: "Primary AI use" },
  "identity.professional_role": { pl: "Rola zawodowa", en: "Professional role" },
  "identity.role": { pl: "Rola", en: "Role" },
  "identity.self_description": { pl: "Opis", en: "Description" },
  "context.occupation": { pl: "Zawód", en: "Occupation" },
  "identity.ai_frustration": { pl: "Frustracja z AI", en: "AI frustration" },

  // Communication
  "communication.verbosity_preference": { pl: "Długość odpowiedzi", en: "Response length" },
  "communication.directness": { pl: "Bezpośredniość", en: "Directness" },
  "communication.format_preference": { pl: "Format odpowiedzi", en: "Format preference" },
  "communication.emoji_preference": { pl: "Emoji", en: "Emoji preference" },
  "communication.filler_tolerance": { pl: "Tolerancja na ogólniki", en: "Filler tolerance" },
  "communication.depth_default": { pl: "Domyślna głębokość", en: "Default depth" },
  "communication.praise_tolerance": { pl: "Tolerancja na pochwały", en: "Praise tolerance" },
  "communication.humor": { pl: "Humor", en: "Humor" },
  "communication.feedback_style": { pl: "Styl feedbacku", en: "Feedback style" },
  "communication.jargon_preference": { pl: "Żargon techniczny", en: "Jargon level" },
  "communication.reasoning_visibility": { pl: "Widoczność rozumowania", en: "Reasoning visibility" },
  "communication.hedging_tolerance": { pl: "Pewność w odpowiedziach", en: "Hedging tolerance" },
  "communication.difficult_message_delivery": { pl: "Trudne wiadomości", en: "Difficult messages" },
  "communication.code_switching": { pl: "Przełączanie kodów", en: "Code switching" },
  "communication.default_length": { pl: "Domyślna długość", en: "Default length" },
  "communication.sarcasm_comprehension": { pl: "Rozumienie sarkazmu", en: "Sarcasm comprehension" },
  "communication.memory_appreciation": { pl: "Docenianie pamięci", en: "Memory appreciation" },
  "communication.interruption_tolerance": { pl: "Tolerancja na przerywanie", en: "Interruption tolerance" },
  "communication.code_comment_style": { pl: "Komentarze w kodzie", en: "Code comment style" },
  "communication.languages_mixed": { pl: "Mieszanie języków", en: "Language mixing" },

  // Cognitive
  "cognitive.learning_style": { pl: "Styl nauki", en: "Learning style" },
  "cognitive.decision_style": { pl: "Styl decyzji", en: "Decision style" },
  "cognitive.problem_solving": { pl: "Rozwiązywanie problemów", en: "Problem solving" },
  "cognitive.mental_model": { pl: "Model mentalny", en: "Mental model" },
  "cognitive.abstraction_preference": { pl: "Poziom abstrakcji", en: "Abstraction level" },
  "cognitive.ambiguity_tolerance": { pl: "Tolerancja niejasności", en: "Ambiguity tolerance" },
  "cognitive.attention_pattern": { pl: "Wzorzec uwagi", en: "Attention pattern" },
  "cognitive.detail_orientation": { pl: "Orientacja na szczegóły", en: "Detail orientation" },
  "cognitive.information_processing": { pl: "Przetwarzanie informacji", en: "Info processing" },
  "cognitive.creativity_expression": { pl: "Ekspresja kreatywności", en: "Creativity" },
  "cognitive.metacognition": { pl: "Metapoznanie", en: "Metacognition" },
  "cognitive.cognitive_load": { pl: "Obciążenie poznawcze", en: "Cognitive load" },
  "cognitive.uncertainty_handling": { pl: "Radzenie z niepewnością", en: "Uncertainty handling" },
  "cognitive.analogy_appreciation": { pl: "Docenianie analogii", en: "Analogy appreciation" },
  "cognitive.ai_role_in_thinking": { pl: "Rola AI w myśleniu", en: "AI role in thinking" },
  "cognitive.decision_unblock": { pl: "Odblokowanie decyzji", en: "Decision unblock" },
  "cognitive.drift_cause": { pl: "Przyczyna rozproszenia", en: "Drift cause" },
  "cognitive.ambiguity_resolution": { pl: "Rozwiązywanie niejasności", en: "Ambiguity resolution" },
  "cognitive.uncertainty_tolerance": { pl: "Tolerancja niepewności", en: "Uncertainty tolerance" },
  "cognitive.intellectual_challenge_appetite": { pl: "Apetyt na wyzwania", en: "Challenge appetite" },

  // Work
  "work.energy_archetype": { pl: "Archetyp energii", en: "Energy archetype" },
  "work.peak_hours": { pl: "Godziny szczytu", en: "Peak hours" },
  "work.task_granularity": { pl: "Granulacja zadań", en: "Task granularity" },
  "work.deadline_behavior": { pl: "Zachowanie przy deadline", en: "Deadline behavior" },
  "work.collaboration_preference": { pl: "Współpraca", en: "Collaboration" },
  "work.collaboration": { pl: "Współpraca", en: "Collaboration" },
  "work.schedule": { pl: "Rytm pracy", en: "Work schedule" },
  "work.planning_horizon": { pl: "Horyzont planowania", en: "Planning horizon" },
  "work.documentation_habit": { pl: "Dokumentacja", en: "Documentation" },
  "work.break_pattern": { pl: "Wzorzec przerw", en: "Break pattern" },
  "work.context_switching_cost": { pl: "Koszt przełączania", en: "Context switching" },
  "work.tool_philosophy": { pl: "Filozofia narzędzi", en: "Tool philosophy" },
  "work.workspace": { pl: "Miejsce pracy", en: "Workspace" },
  "work.ideal_conditions": { pl: "Idealne warunki", en: "Ideal conditions" },
  "work.completion_pattern": { pl: "Wzorzec kończenia", en: "Completion pattern" },
  "work.done_criteria": { pl: "Kryteria 'done'", en: "Done criteria" },
  "work.energy_curve": { pl: "Krzywa energii", en: "Energy curve" },
  "work.meeting_preference": { pl: "Preferencja spotkań", en: "Meeting preference" },
  "work.work_life_boundary": { pl: "Granica praca/życie", en: "Work-life boundary" },
  "work.task_system": { pl: "System zadań", en: "Task system" },
  "work.ai_assistance_mode": { pl: "Tryb wsparcia AI", en: "AI assistance mode" },
  "work.procrastination_driver": { pl: "Driver prokrastynacji", en: "Procrastination driver" },
  "work.completion_lever": { pl: "Dźwignia kończenia", en: "Completion lever" },
  "work.initiation_aid": { pl: "Pomoc w starcie", en: "Initiation aid" },
  "work.feedback_loop": { pl: "Pętla feedbacku", en: "Feedback loop" },
  "work.automation_tendency": { pl: "Skłonność do automatyzacji", en: "Automation tendency" },
  "work.deadline_quality": { pl: "Jakość przy deadline", en: "Deadline quality" },

  // Personality
  "personality.core_motivation": { pl: "Główna motywacja", en: "Core motivation" },
  "personality.stress_response": { pl: "Reakcja na stres", en: "Stress response" },
  "personality.perfectionism": { pl: "Perfekcjonizm", en: "Perfectionism" },
  "personality.risk_tolerance": { pl: "Tolerancja ryzyka", en: "Risk tolerance" },
  "personality.conflict_style": { pl: "Styl konfliktu", en: "Conflict style" },
  "personality.extraversion": { pl: "Ekstraversja", en: "Extraversion" },
  "personality.optimism": { pl: "Optymizm", en: "Optimism" },
  "personality.patience_level": { pl: "Cierpliwość", en: "Patience" },
  "personality.trust_default": { pl: "Domyślne zaufanie", en: "Default trust" },
  "personality.social_battery": { pl: "Bateria społeczna", en: "Social battery" },
  "personality.values_hierarchy": { pl: "Hierarchia wartości", en: "Values hierarchy" },
  "personality.validation_need": { pl: "Potrzeba walidacji", en: "Validation need" },
  "personality.impulse_control": { pl: "Kontrola impulsów", en: "Impulse control" },
  "personality.change_adaptability": { pl: "Adaptacja do zmian", en: "Adaptability" },
  "personality.self_perception": { pl: "Postrzeganie siebie", en: "Self-perception" },
  "personality.authority_orientation": { pl: "Orientacja na autorytet", en: "Authority orientation" },
  "personality.ethical_framework": { pl: "Ramy etyczne", en: "Ethical framework" },
  "personality.ai_pet_peeve": { pl: "Co irytuje w AI", en: "AI pet peeve" },
  "personality.stress_coping_style": { pl: "Styl radzenia ze stresem", en: "Stress coping" },
  "personality.impulsivity_domains": { pl: "Domeny impulsywności", en: "Impulsivity domains" },
  "personality.pessimism_type": { pl: "Typ pesymizmu", en: "Pessimism type" },
  "personality.positive_affect_expression": { pl: "Wyrażanie emocji", en: "Emotion expression" },
  "personality.perfectionism_impact": { pl: "Wpływ perfekcjonizmu", en: "Perfectionism impact" },

  // Neurodivergent
  "neurodivergent.adhd_adaptations": { pl: "Adaptacje ADHD", en: "ADHD adaptations" },
  "neurodivergent.hyperfocus": { pl: "Hiperfokus", en: "Hyperfocus" },
  "neurodivergent.time_perception": { pl: "Percepcja czasu", en: "Time perception" },
  "neurodivergent.rsd": { pl: "Wrażliwość na odrzucenie", en: "Rejection sensitivity" },
  "neurodivergent.task_initiation": { pl: "Inicjacja zadań", en: "Task initiation" },
  "neurodivergent.working_memory": { pl: "Pamięć robocza", en: "Working memory" },
  "neurodivergent.emotional_regulation": { pl: "Regulacja emocji", en: "Emotion regulation" },
  "neurodivergent.dopamine_seeking": { pl: "Szukanie dopaminy", en: "Dopamine seeking" },
  "neurodivergent.sleep_chronotype": { pl: "Chronotyp snu", en: "Sleep chronotype" },
  "neurodivergent.sensory_audio": { pl: "Wrażliwość na dźwięk", en: "Audio sensitivity" },
  "neurodivergent.stimming": { pl: "Stimming", en: "Stimming" },
  "neurodivergent.masking": { pl: "Maskowanie", en: "Masking" },
  "neurodivergent.special_interests": { pl: "Specjalne zainteresowania", en: "Special interests" },
  "neurodivergent.focus_protection": { pl: "Ochrona fokusu", en: "Focus protection" },
  "neurodivergent.task_switching": { pl: "Przełączanie zadań", en: "Task switching" },
  "neurodivergent.regulation_strategies": { pl: "Strategie regulacji", en: "Regulation strategies" },
  "neurodivergent.burnout_level": { pl: "Poziom wypalenia", en: "Burnout level" },
  "neurodivergent.burnout_duration": { pl: "Czas wypalenia", en: "Burnout duration" },
  "neurodivergent.hyperfocus_recovery": { pl: "Regeneracja po hiperfokusie", en: "Hyperfocus recovery" },
  "neurodivergent.rejection_sensitivity": { pl: "Wrażliwość na odrzucenie", en: "Rejection sensitivity" },
  "neurodivergent.time_tools": { pl: "Narzędzia czasu", en: "Time tools" },
  "neurodivergent.freeform": { pl: "Wolna forma", en: "Freeform" },

  // Expertise
  "expertise.primary_domain": { pl: "Główna domena", en: "Primary domain" },
  "expertise.primary_depth": { pl: "Głębokość główna", en: "Primary depth" },
  "expertise.tech_stack": { pl: "Stack technologiczny", en: "Tech stack" },
  "expertise.years": { pl: "Lata doświadczenia", en: "Years of experience" },
  "expertise.industries": { pl: "Branże", en: "Industries" },
  "expertise.secondary_domains": { pl: "Domeny dodatkowe", en: "Secondary domains" },
  "expertise.secondary": { pl: "Umiejętności dodatkowe", en: "Secondary skills" },
  "expertise.industries": { pl: "Branże", en: "Industries" },
  "expertise.level": { pl: "Poziom", en: "Level" },
  "expertise.learning_velocity": { pl: "Tempo nauki", en: "Learning velocity" },
  "expertise.mentorship_position": { pl: "Pozycja mentorska", en: "Mentorship position" },
  "expertise.teaching_ability": { pl: "Umiejętność nauczania", en: "Teaching ability" },
  "expertise.knowledge_currency": { pl: "Aktualność wiedzy", en: "Knowledge currency" },
  "expertise.cross_pollination": { pl: "Interdyscyplinarność", en: "Cross-pollination" },
  "expertise.known_gaps": { pl: "Znane luki", en: "Known gaps" },
  "expertise.self_narrative": { pl: "Narracja o sobie", en: "Self-narrative" },
  "expertise.work_mode": { pl: "Tryb pracy", en: "Work mode" },
  "expertise.secondary_other": { pl: "Inne domeny", en: "Other domains" },

  // Life context
  "life.stage": { pl: "Etap życia", en: "Life stage" },
  "life.life_stage": { pl: "Etap życia", en: "Life stage" },
  "life.financial_context": { pl: "Kontekst finansowy", en: "Financial context" },
  "life.financial_mindset": { pl: "Podejście do finansów", en: "Financial mindset" },
  "life.goals": { pl: "Cele", en: "Goals" },
  "life.anti_goals": { pl: "Anty-cele", en: "Anti-goals" },
  "life.priorities": { pl: "Priorytety", en: "Priorities" },
  "life.priorities": { pl: "Priorytety życiowe", en: "Life priorities" },
  "life.stress_level": { pl: "Poziom stresu", en: "Stress level" },
  "life.discretionary_time": { pl: "Wolny czas", en: "Discretionary time" },
  "life.household": { pl: "Gospodarstwo domowe", en: "Household" },
  "life.health_context": { pl: "Kontekst zdrowotny", en: "Health context" },
  "life.location_type": { pl: "Typ lokalizacji", en: "Location type" },
  "life.satisfaction": { pl: "Satysfakcja z życia", en: "Life satisfaction" },
  "life.blockers": { pl: "Blokady", en: "Blockers" },
  "life.personal_vision": { pl: "Wizja osobista", en: "Personal vision" },
  "life.cultural_context": { pl: "Kontekst kulturowy", en: "Cultural context" },
  "life.support_style": { pl: "Styl wsparcia", en: "Support style" },
  "life.transitions": { pl: "Przejścia", en: "Transitions" },
  "life.transition_direction": { pl: "Kierunek zmiany", en: "Transition direction" },

  // AI relationship
  "ai.trust": { pl: "Zaufanie do AI", en: "AI trust" },
  "ai.correction_style": { pl: "Styl korekcji AI", en: "AI correction style" },
  "ai.proactivity": { pl: "Proaktywność AI", en: "AI proactivity" },
  "ai.relationship_model": { pl: "Model relacji z AI", en: "AI relationship" },
  "ai.experience_level": { pl: "Doświadczenie z AI", en: "AI experience" },
  "ai.memory_preference": { pl: "Pamięć AI", en: "AI memory preference" },
  "ai.emotional_support": { pl: "Wsparcie emocjonalne AI", en: "AI emotional support" },
  "ai.hallucination_response": { pl: "Reakcja na halucynacje", en: "Hallucination response" },
  "ai.platforms": { pl: "Platformy AI", en: "AI platforms" },
  "ai.personality_preferences": { pl: "Osobowość AI", en: "AI personality" },
  "ai.opinion_limits": { pl: "Granice opinii AI", en: "AI opinion limits" },
  "ai.customization_experience": { pl: "Personalizacja AI", en: "AI customization" },
  "ai.displacement_concern": { pl: "Obawy o AI", en: "AI displacement concern" },
  "ai.future_vision": { pl: "Wizja AI", en: "AI future vision" },
  "ai.replacement_attitude": { pl: "Stosunek do zastępowania", en: "AI replacement attitude" },
  "ai.trust_failure": { pl: "Utrata zaufania", en: "Trust failure" },
  "ai.final_override": { pl: "Ostateczna decyzja", en: "Final override" },
};

// ─── Value display — make raw values human-readable ───

const valueLabels: Record<string, Record<string, { pl: string; en: string }>> = {
  "identity.language": {
    pl: { pl: "Polski", en: "Polish" },
    en: { pl: "Angielski", en: "English" },
    de: { pl: "Niemiecki", en: "German" },
    fr: { pl: "Francuski", en: "French" },
    es: { pl: "Hiszpański", en: "Spanish" },
  },
  "identity.tech_comfort": {
    "non-technical": { pl: "Nietechniczny", en: "Non-technical" },
    basic: { pl: "Podstawowy", en: "Basic" },
    intermediate: { pl: "Średni", en: "Intermediate" },
    advanced: { pl: "Zaawansowany", en: "Advanced" },
    expert: { pl: "Ekspert", en: "Expert" },
  },
  "communication.directness": {
    direct: { pl: "Bezpośredni", en: "Direct" },
    diplomatic: { pl: "Dyplomatyczny", en: "Diplomatic" },
    context_dependent: { pl: "Zależy od kontekstu", en: "Context dependent" },
  },
  "communication.verbosity_preference": {
    concise: { pl: "Zwięzłe", en: "Concise" },
    moderate: { pl: "Umiarkowane", en: "Moderate" },
    detailed: { pl: "Szczegółowe", en: "Detailed" },
  },
  "work.energy_archetype": {
    sprinter: { pl: "Sprinter", en: "Sprinter" },
    steady: { pl: "Stały rytm", en: "Steady" },
    burst_rest: { pl: "Seria i przerwa", en: "Burst & rest" },
    reactive: { pl: "Reaktywny", en: "Reactive" },
  },
};

// ─── Categories ───

export interface CategoryInfo {
  id: string;
  labelKey: string;
  color: string;
  icon: string;
}

export const categories: CategoryInfo[] = [
  { id: "identity", labelKey: "cat.identity", color: "#29ef82", icon: "👤" },
  { id: "communication", labelKey: "cat.communication", color: "#1ec9c9", icon: "💬" },
  { id: "cognitive", labelKey: "cat.cognitive", color: "#a78bfa", icon: "🧠" },
  { id: "work", labelKey: "cat.work", color: "#f59e0b", icon: "⚡" },
  { id: "personality", labelKey: "cat.personality", color: "#f472b6", icon: "🎭" },
  { id: "neurodivergent", labelKey: "cat.neurodivergent", color: "#fb923c", icon: "🌀" },
  { id: "expertise", labelKey: "cat.expertise", color: "#38bdf8", icon: "🎯" },
  { id: "life", labelKey: "cat.life", color: "#34d399", icon: "🌱" },
  { id: "ai", labelKey: "cat.ai", color: "#c084fc", icon: "🤖" },
];

// ─── Grouping ───

export interface DimensionDisplay {
  key: string;
  label: string;
  value: string;
  rawValue: string | number | string[];
}

export interface CategoryGroup {
  category: CategoryInfo;
  dimensions: DimensionDisplay[];
}

function getCategoryId(dimKey: string): string {
  const prefix = dimKey.split(".")[0];
  // Map dimension prefixes to category IDs
  const mapping: Record<string, string> = {
    identity: "identity",
    communication: "communication",
    cognitive: "cognitive",
    work: "work",
    personality: "personality",
    neurodivergent: "neurodivergent",
    expertise: "expertise",
    life: "life",
    ai: "ai",
  };
  return mapping[prefix] || "identity";
}

export function getDimensionLabel(key: string, locale: "pl" | "en"): string {
  const entry = dimensionLabels[key];
  if (entry) return entry[locale];
  // Fallback: humanize the key
  const parts = key.split(".");
  const last = parts[parts.length - 1];
  return last.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function getValueLabel(dimKey: string, rawValue: string | number | string[], locale: "pl" | "en"): string {
  const val = String(rawValue);

  // Check specific value labels
  const dimLabels = valueLabels[dimKey];
  if (dimLabels && dimLabels[val]) {
    return dimLabels[val][locale];
  }

  // Array values
  if (Array.isArray(rawValue)) {
    return rawValue.join(", ");
  }

  // Generic humanization
  return val.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function groupDimensions(profile: PersonaProfile, locale: "pl" | "en"): CategoryGroup[] {
  const groups: Map<string, DimensionDisplay[]> = new Map();

  // Process explicit dimensions
  for (const [key, dim] of Object.entries(profile.explicit)) {
    const catId = getCategoryId(key);
    if (!groups.has(catId)) groups.set(catId, []);
    groups.get(catId)!.push({
      key,
      label: getDimensionLabel(key, locale),
      value: getValueLabel(key, dim.value, locale),
      rawValue: dim.value,
    });
  }

  // Process inferred dimensions (skip if already in explicit — no duplicates)
  const explicitKeys = new Set(Object.keys(profile.explicit));
  for (const [key, dim] of Object.entries(profile.inferred)) {
    if (explicitKeys.has(key)) continue; // explicit wins
    const catId = getCategoryId(key);
    if (!groups.has(catId)) groups.set(catId, []);
    groups.get(catId)!.push({
      key,
      label: getDimensionLabel(key, locale),
      value: getValueLabel(key, dim.value, locale),
      rawValue: dim.value,
    });
  }

  // Build category groups in order
  return categories
    .filter(cat => groups.has(cat.id))
    .map(cat => ({
      category: cat,
      dimensions: groups.get(cat.id)!,
    }));
}

// ─── Missing categories for suggestions ───

export interface Suggestion {
  category: CategoryInfo;
  missingCount: number;
  descriptionPl: string;
  descriptionEn: string;
}

const totalPerCategory: Record<string, number> = {
  identity: 10,
  communication: 20,
  cognitive: 20,
  work: 25,
  personality: 23,
  neurodivergent: 22,
  expertise: 15,
  life: 15,
  ai: 17,
};

export function getSuggestions(profile: PersonaProfile): Suggestion[] {
  const filled: Record<string, number> = {};

  for (const key of Object.keys(profile.explicit)) {
    const catId = getCategoryId(key);
    filled[catId] = (filled[catId] || 0) + 1;
  }

  const suggestions: Suggestion[] = [];
  const descriptions: Record<string, { pl: string; en: string }> = {
    identity: { pl: "Podstawowe informacje o Tobie", en: "Basic information about you" },
    communication: { pl: "Jak lubisz się komunikować z AI", en: "How you prefer to communicate with AI" },
    cognitive: { pl: "Jak myślisz i przetwarzasz informacje", en: "How you think and process information" },
    work: { pl: "Twoje nawyki pracy i produktywność", en: "Your work habits and productivity" },
    personality: { pl: "Twoje wartości, motywacje i styl", en: "Your values, motivations, and style" },
    neurodivergent: { pl: "Twoje unikalne wzorce uwagi i energii", en: "Your unique attention and energy patterns" },
    expertise: { pl: "Twoje umiejętności i doświadczenie", en: "Your skills and experience" },
    life: { pl: "Gdzie jesteś teraz w życiu", en: "Where you are in life right now" },
    ai: { pl: "Twoja relacja z narzędziami AI", en: "Your relationship with AI tools" },
  };

  for (const cat of categories) {
    const total = totalPerCategory[cat.id] || 10;
    const done = filled[cat.id] || 0;
    const missing = total - done;

    if (missing > 3) {
      const desc = descriptions[cat.id] || { pl: "", en: "" };
      suggestions.push({
        category: cat,
        missingCount: missing,
        descriptionPl: desc.pl,
        descriptionEn: desc.en,
      });
    }
  }

  return suggestions.sort((a, b) => b.missingCount - a.missingCount);
}

// ─── Archetype detection ───

export function detectArchetype(profile: PersonaProfile, locale: "pl" | "en"): { name: string; description: string } {
  const e = profile.explicit;
  const get = (key: string) => e[key]?.value as string | undefined;

  const energy = get("work.energy_archetype");
  const directness = get("communication.directness");
  const motivation = get("personality.core_motivation");
  const learning = get("cognitive.learning_style");
  const risk = get("personality.risk_tolerance");
  const techComfort = get("identity.tech_comfort");

  // Archetype detection based on trait combinations
  if (energy === "sprinter" && directness === "direct") {
    return locale === "pl"
      ? { name: "Realizator", description: "Działasz intensywnie, mówisz wprost, kończysz szybko. AI powinno nadążać za Twoim tempem." }
      : { name: "The Executor", description: "You work intensely, speak directly, and finish fast. AI should match your pace." };
  }

  if (motivation === "mastery" || motivation === "learning") {
    return locale === "pl"
      ? { name: "Eksplorator", description: "Napędza Cię głębia wiedzy i zrozumienie. AI powinno być Twoim partnerem w odkrywaniu." }
      : { name: "The Explorer", description: "You're driven by depth of knowledge. AI should be your exploration partner." };
  }

  if (energy === "steady" && directness === "diplomatic") {
    return locale === "pl"
      ? { name: "Strateg", description: "Działasz metodycznie, komunikujesz się z finezją. AI powinno dostarczać przemyślane odpowiedzi." }
      : { name: "The Strategist", description: "You work methodically, communicate with finesse. AI should provide thoughtful responses." };
  }

  if (risk === "high" || risk === "very_high") {
    return locale === "pl"
      ? { name: "Innowator", description: "Nie boisz się ryzyka i nowych podejść. AI powinno proponować odważne rozwiązania." }
      : { name: "The Innovator", description: "You embrace risk and new approaches. AI should suggest bold solutions." };
  }

  if (techComfort === "expert" || techComfort === "advanced") {
    return locale === "pl"
      ? { name: "Budowniczy", description: "Technologia to Twoje medium. AI jest narzędziem w Twoim arsenale." }
      : { name: "The Builder", description: "Technology is your medium. AI is a tool in your arsenal." };
  }

  if (energy === "burst_rest") {
    return locale === "pl"
      ? { name: "Cyklista", description: "Działasz w rytmie — seria, przerwa, seria. AI powinno to respektować." }
      : { name: "The Cyclist", description: "You work in rhythm — burst, rest, burst. AI should respect that." };
  }

  // Default
  const totalDims = Object.keys(profile.explicit).length + Object.keys(profile.inferred).length;
  if (totalDims > 30) {
    return locale === "pl"
      ? { name: "Persona", description: `${totalDims} wymiarów — Twoje AI Cię rozumie.` }
      : { name: "Persona", description: `${totalDims} dimensions — your AI understands you.` };
  }

  return locale === "pl"
    ? { name: "Profil", description: "Twój unikalny zestaw preferencji i stylu." }
    : { name: "Profile", description: "Your unique set of preferences and style." };
}

// ─── Category completeness for radar-like display ───

export function getCategoryCompleteness(profile: PersonaProfile): { id: string; label: string; filled: number; total: number; percent: number }[] {
  const filled: Record<string, number> = {};
  for (const key of Object.keys(profile.explicit)) {
    const catId = getCategoryId(key);
    filled[catId] = (filled[catId] || 0) + 1;
  }

  return categories.map(cat => ({
    id: cat.id,
    label: cat.labelKey,
    filled: filled[cat.id] || 0,
    total: totalPerCategory[cat.id] || 10,
    percent: Math.round(((filled[cat.id] || 0) / (totalPerCategory[cat.id] || 10)) * 100),
  }));
}
