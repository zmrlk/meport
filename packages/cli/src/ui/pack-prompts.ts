/**
 * Pack-Based Prompt Wrappers
 *
 * Maps PackQuestion types to Inquirer prompts.
 * Handles pack_selection event specially (shows pack descriptions).
 */

import { select, input, checkbox, number as numInput } from "@inquirer/prompts";
import chalk from "chalk";
import type { PackQuestion, PackAnswerInput } from "@meport/core";
import { DIM, YELLOW, GREEN, CYAN } from "./display.js";

export async function askPackQuestion(
  question: PackQuestion,
  progress: string,
  pl = false
): Promise<PackAnswerInput> {
  const prefix = `${progress} `;
  const whyHint = question.why_this_matters
    ? DIM(`  ℹ ${question.why_this_matters}`)
    : "";

  if (whyHint) console.log(whyHint);

  switch (question.type) {
    case "select":
      return askSelect(question, prefix, pl);
    case "multi_select":
      return askMultiSelect(question, prefix, pl);
    case "scale":
      return askScale(question, prefix);
    case "open_text":
      return askOpenText(question, prefix);
    default:
      return askOpenText(question, prefix);
  }
}

/**
 * Confirm mode — scan detected a value, user just confirms or overrides.
 * Much faster than answering the full question.
 */
export async function askConfirm(
  question: PackQuestion,
  detectedValue: string,
  detectedSource: string,
  progress: string,
  pl = false
): Promise<PackAnswerInput> {
  const prefix = `${progress} `;

  // If it's a select question, show detected value as default + option to pick different
  if (question.options?.length) {
    const detectedOption = question.options.find(
      (o) => o.value === detectedValue || o.maps_to?.value === detectedValue
    );

    const detectedLabel = pl ? "wykryto z" : "detected from";

    const choices = [
      {
        name: GREEN(`✓ ${detectedOption?.label ?? detectedValue}`) +
          DIM(` (${detectedLabel} ${detectedSource})`),
        value: detectedOption?.value ?? detectedValue,
      },
      ...question.options
        .filter((o) => o.value !== detectedOption?.value)
        .map((opt) => ({
          name: opt.label,
          value: opt.value,
        })),
    ];

    const answer = await select({
      message: prefix + question.question,
      choices,
    });

    return { value: answer };
  }

  // For open text, pre-fill the detected value
  const answer = await input({
    message:
      prefix +
      question.question +
      DIM(` [detected: ${detectedValue}]`),
    default: detectedValue,
  });

  return { value: answer || detectedValue };
}

export async function askPackSelection(
  question: PackQuestion,
  pl = false
): Promise<PackAnswerInput> {
  if (!question.options?.length) {
    return { value: [] };
  }

  const choices = question.options.map((opt) => ({
    name: opt.label,
    value: opt.value,
    checked: true, // default: all selected for max profile
  }));

  const header = pl
    ? "  Które obszary powinien obejmować Twój profil AI?"
    : "  Which areas should your AI profile cover?";
  const subheader = pl
    ? "  Zaznacz wszystkie pasujące — więcej = szerszy profil\n"
    : "  Select all that apply — more = wider profile\n";

  console.log();
  console.log(CYAN(header));
  console.log(DIM(subheader));

  const answers = await checkbox({
    message: question.question,
    choices,
  });

  return { value: answers };
}

async function askSelect(
  question: PackQuestion,
  prefix: string,
  pl = false
): Promise<PackAnswerInput> {
  if (!question.options?.length) {
    return askOpenText(question, prefix);
  }

  const choices = question.options.map((opt) => ({
    name: opt.label,
    value: opt.value,
  }));

  // Add utility options
  choices.push({
    name: YELLOW(pl ? "✏️  Wpisz własną odpowiedź" : "✏️  Add my own answer"),
    value: "__custom__",
  });

  if (question.skippable) {
    choices.push({
      name: DIM(pl ? "Pomiń →" : "Skip →"),
      value: "__skip__",
    });
  }

  choices.push({
    name: DIM(pl ? "↩  Wstecz" : "↩  Back"),
    value: "__back__",
  });

  const answer = await select({
    message: prefix + question.question,
    choices,
  });

  if (answer === "__skip__") {
    return { value: "", skipped: true };
  }

  if (answer === "__back__") {
    return { value: "__back__" };
  }

  if (answer === "__custom__") {
    const custom = await input({
      message: prefix + (pl ? "Twoja odpowiedź:" : "Your answer:"),
    });
    return { value: custom || "" };
  }

  return { value: answer };
}

async function askMultiSelect(
  question: PackQuestion,
  prefix: string,
  pl = false
): Promise<PackAnswerInput> {
  if (!question.options?.length) {
    return askOpenText(question, prefix);
  }

  const choices = question.options.map((opt) => ({
    name: opt.label,
    value: opt.value,
  }));

  const hint = pl
    ? "  (zaznacz opcje, potem Enter. ↩ Wstecz = wpisz 'back')"
    : "  (select options, then press Enter. ↩ Back = type 'back')";
  console.log(DIM(hint));

  const answers = await checkbox({
    message: prefix + question.question,
    choices,
  });

  if (answers.length === 1 && answers[0] === "__back__") {
    return { value: "__back__" };
  }

  if (answers.length === 0 && question.skippable) {
    return { value: [], skipped: true };
  }

  return { value: answers };
}

async function askScale(
  question: PackQuestion,
  prefix: string
): Promise<PackAnswerInput> {
  const answer = await numInput({
    message: prefix + question.question + DIM(" (1-10)"),
    min: 1,
    max: 10,
  });

  if (answer === undefined && question.skippable) {
    return { value: 0, skipped: true };
  }

  return { value: answer ?? 5 };
}

async function askOpenText(
  question: PackQuestion,
  prefix: string
): Promise<PackAnswerInput> {
  const placeholder = question.placeholder
    ? DIM(` (${question.placeholder})`)
    : "";

  const answer = await input({
    message: prefix + question.question + placeholder,
  });

  if (!answer && question.skippable) {
    return { value: "", skipped: true };
  }

  return { value: answer };
}
