import { evaluateSkillSnapshot } from "@skill-platform/evaluator";
import { reviewSkillSnapshot } from "@skill-platform/review-engine";
import type { SkillSnapshot } from "@skill-platform/skill-spec";
import { createRegistryStoreFromEnv, loadDotEnvIfPresent } from "@skill-platform/storage";

loadDotEnvIfPresent();
const store = createRegistryStoreFromEnv();
const evaluationCache = new Map<string, ReturnType<typeof evaluateSkillSnapshot>>();
const getEvaluation = (snapshot: SkillSnapshot) => {
  const cached = evaluationCache.get(snapshot.contentHash);
  if (cached) {
    return cached;
  }

  const evaluation = evaluateSkillSnapshot(snapshot);
  evaluationCache.set(snapshot.contentHash, evaluation);
  return evaluation;
};

const reviewed = await store.reviewAll(
  async (snapshot, version) => reviewSkillSnapshot(snapshot, version, await getEvaluation(snapshot)),
  (snapshot) => getEvaluation(snapshot)
);

console.log(`Reviewed ${reviewed.length} skill versions`);
for (const item of reviewed) {
  console.log(
    `${item.review.skillSlug} (${item.manifest.name})@${item.version}: ${item.status} overall=${item.review.scores.overallScore} functional=${item.evaluation?.score ?? "n/a"}`
  );
}
