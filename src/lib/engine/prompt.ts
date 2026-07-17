// NOTE: keep this file free of React/Next imports — reused by mobile later.
import type { QuizAnswers } from "@/lib/quiz/types";

const URGENCY_COPY: Record<QuizAnswers["urgency"], string> = {
  fast: "This is needed SOON, so favour widely-available items over slow handmade goods.",
  normal: "There is a normal timeframe — a healthy mix of mainstream and specialty items is fine.",
  no_rush: "There is no rush, so handmade, personalised, or made-to-order items are welcome.",
};

export function buildBundlePrompt(answers: QuizAnswers): string {
  const lines: string[] = [];
  lines.push(
    "You are a thoughtful professional gift consultant. Design gift bundles for the following recipient."
  );
  lines.push("");
  lines.push("RECIPIENT:");
  lines.push(`- Occasion: ${answers.occasion}`);
  lines.push(`- Age band: ${answers.ageBand}`);
  if (answers.gender) lines.push(`- Gender: ${answers.gender}`);
  lines.push(`- Relationship to gift-giver: ${answers.relationship}`);
  lines.push(`- Interests: ${answers.interests.join(", ") || "none specified"}`);
  if (answers.freeText) lines.push(`- Additional notes from the gift-giver: ${answers.freeText}`);
  lines.push(`- Total bundle budget: ${answers.budget} ${answers.currency}`);
  lines.push(`- Delivery urgency: ${URGENCY_COPY[answers.urgency]}`);
  lines.push(
    `- Exclusions (NEVER include these, or close synonyms of them): ${
      answers.exclusions.length ? answers.exclusions.join(", ") : "none"
    }`
  );
  lines.push(`- Shopping country: ${answers.country}`);
  lines.push("");
  lines.push("RULES:");
  lines.push(
    "1. Produce exactly 3 distinct gift bundles, each built around one clear, coherent theme."
  );
  lines.push(
    "2. Each bundle must contain between 3 and 6 items that genuinely complement each other under that theme."
  );
  lines.push(
    "3. Respect the total budget: the sum of the bundle's item price ranges must stay close to it (within about 20%), never wildly over."
  );
  lines.push(
    "4. NEVER suggest an excluded item, or a close synonym/variant of one, in any bundle."
  );
  lines.push(
    '5. Prices are always an ESTIMATE range (e.g. "$15-25"), never a specific live price or a claim of current availability.'
  );
  lines.push(
    "6. Apply age-appropriate safety rules: never suggest alcohol, tobacco, or age-restricted items unless the age band is clearly a legal adult for that item in a typical country, and prefer to avoid alcohol entirely unless interests explicitly mention it."
  );
  lines.push("7. Avoid generic, cliché gifts unless they genuinely fit the interests given.");
  lines.push("");
  lines.push("OUTPUT FORMAT:");
  lines.push(
    "Return JSON only, an array of exactly 3 objects. Each object has fields: " +
      '"theme" (string), "rationale" (string, 1-2 sentences on why this bundle fits), ' +
      '"estTotal" (string price range like "$45-60"), and "items" (array of 3 to 6 objects). ' +
      'Each item object has fields: "name" (string), "description" (string, 1 sentence), ' +
      '"why" (string, why this item fits the recipient), "estPriceRange" (string like "$15-25"), ' +
      '"searchQuery" (string, a good product-search phrase for a retailer search box), ' +
      '"tags" (array of 1-4 short lowercase strings).'
  );
  return lines.join("\n");
}
