// src/utils/matchCareers.js
import { CAREERS } from "../data/careers";

export function matchCareers(answers) {
  const norm = (s) => String(s || "").trim().toLowerCase();

  const interest = norm(answers.interest_area);
  const style = norm(answers.work_style);
  const env = norm(answers.environment);

  // Sliders: numbers
  const eduComfort = Number(answers.education_comfort ?? 0);   // 0–6
  const expLevel = Number(answers.experience_level ?? 0);      // 0–10

  // Optional typed interests
  const curious = norm(answers.curious_fields);

  const scored = CAREERS.map((c) => {
    let score = 0;

    // Helper: array match (case-insensitive)
    const has = (arr, v) => (arr || []).some((x) => norm(x) === v);

    //  Core matching (new tags)
    if (has(c.interestAreas, interest)) score += 4;
    else if (has(c.goodFor, interest)) score += 3; // backward-compatible if you still have goodFor

    if (has(c.workStyles, style)) score += 3;
    else if (has(c.goodFor, style)) score += 2;

    if (has(c.environments, env)) score += 2;
    else if (has(c.environment, env)) score += 2; // backward-compatible with your old "environment" field

    // Education comfort: prefer careers whose typical education <= comfort
    // careers can define: educationYearsMin / educationYearsMax
    if (typeof c.educationYearsMin === "number") {
      if (eduComfort >= c.educationYearsMin) score += 2;
      else score -= 2; // user wants shorter training than career needs
    }

    // Experience slider:
    // if career has "recommendedMinExperience" we can use it (optional)
    if (typeof c.recommendedMinExperience === "number") {
      if (expLevel >= c.recommendedMinExperience) score += 1;
      else score += 0; // no penalty
    }

    // ✅ “Curious fields” text boost (simple keyword boost)
    // If user typed "nurse" and career title includes nurse → boost
    if (curious) {
      const titleHit = norm(c.title).includes(curious) || curious.includes(norm(c.title));
      if (titleHit) score += 5;

      // also check career keywords list if you add it
      if (Array.isArray(c.keywords) && c.keywords.some((k) => curious.includes(norm(k)))) {
        score += 3;
      }
    }

    return { ...c, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}
