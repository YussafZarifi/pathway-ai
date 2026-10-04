/**
 * Where the current roadmap lives (ADR-019). Pages never touch storage
 * directly: they ask for the repository that fits the visitor.
 *
 * A repository has the same methods in every mode:
 *   load(fallbackState) → record | null
 *   generate({ answers, career, careerData }) → record
 *   regenerate(record) → record
 *   setStepDone(record, index, done) → record
 * A record: { mode, id, career, careerData, answers, roadmap (steps),
 *   generatedAt (ms | null), statuses [{ index, done, completedAt }],
 *   canRegenerate, events [{ type, timestamp }] for activity/achievements,
 *   activityKind ("visits" | "progress") }.
 */

import { authEnabled } from "../supabase";
import { accountRepository } from "./accountRepository";
import { localRepository } from "./localRepository";

export { accountRepository, localRepository };

/**
 * The repository for this visitor: signed-in users → their account
 * (Postgres); guests and auth-off builds → this browser.
 */
export function repositoryFor(session) {
  return authEnabled && session ? accountRepository : localRepository;
}
