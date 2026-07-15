import { evaluateSkillSnapshot } from "@skill-platform/evaluator";
import { reviewSkillSnapshot } from "@skill-platform/review-engine";
import { createRegistryStoreFromEnv, loadDotEnvIfPresent } from "@skill-platform/storage";

loadDotEnvIfPresent();
const store = createRegistryStoreFromEnv();

const reviewed = await store.reviewAll(
  (snapshot, version) => reviewSkillSnapshot(snapshot, version),
  (snapshot) => evaluateSkillSnapshot(snapshot)
);

console.log(`Reviewed ${reviewed.length} skill versions`);
for (const item of reviewed) {
  console.log(
    `${item.review.skillSlug} (${item.manifest.name})@${item.version}: ${item.status} overall=${item.review.scores.overallScore} functional=${item.evaluation?.score ?? "n/a"}`
  );
}
