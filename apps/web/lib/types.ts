export type ReviewVerdict = "published" | "needs-review" | "rejected";
export type ReviewSeverity = "low" | "medium" | "high" | "critical";
export type ReviewCategory = "compliance" | "leakage" | "privacy" | "security" | "functional";
export type EvaluationStatus = "passed" | "partial" | "failed" | "not-configured";

export interface ReviewScores {
  qualityScore: number;
  securityScore: number;
  privacyScore: number;
  functionalScore: number;
  overallScore: number;
}

export interface ReviewFinding {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  title: string;
  message: string;
  path?: string;
  evidence?: string;
  recommendation: string;
}

export interface ReviewReport {
  id: string;
  skillSlug: string;
  skillName: string;
  version: string;
  contentHash: string;
  verdict: ReviewVerdict;
  scores: ReviewScores;
  findings: ReviewFinding[];
  createdAt: string;
}

export interface FunctionalEvaluationFinding {
  id: string;
  task?: string;
  severity: "low" | "medium" | "high";
  message: string;
  recommendation: string;
}

export interface FunctionalEvaluationTaskResult {
  name: string;
  score: number;
  findings: FunctionalEvaluationFinding[];
}

export interface FunctionalEvaluationReport {
  id: string;
  provider: "static-taskset" | "halucatch-adapter";
  status: EvaluationStatus;
  score: number;
  tasksTotal: number;
  tasksPassed: number;
  taskResults: FunctionalEvaluationTaskResult[];
  findings: FunctionalEvaluationFinding[];
  createdAt: string;
}

export interface SkillManifest {
  slug: string;
  name: string;
  description: string;
  version?: string;
  categories?: string[];
  topics?: string[];
  "release-tags"?: string[];
  author?: string;
  license?: string;
  tags?: string[];
  supportedAgents?: string[];
}

export interface RegistryContributor {
  id: string;
  userId?: string;
  username?: string;
  name: string;
  role: "owner" | "maintainer" | "reviewer" | "contributor";
  addedAt: string;
}

export interface RegistryIssue {
  id: string;
  type: "bug" | "security" | "compatibility" | "feature" | "docs";
  status: "open" | "triaged" | "closed";
  severity: ReviewSeverity;
  title: string;
  body?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryRating {
  id: string;
  version?: string;
  user: string;
  score: number;
  comment?: string;
  createdAt: string;
}

export interface RegistryVersion {
  version: string;
  manifest: SkillManifest;
  contentHash: string;
  review: ReviewReport;
  evaluation?: FunctionalEvaluationReport;
  status: ReviewVerdict;
  releaseTags: string[];
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrySkill {
  slug: string;
  name: string;
  description: string;
  ownerUserId?: string;
  latestVersion: string;
  versions: Record<string, RegistryVersion>;
  contributors: RegistryContributor[];
  issues: RegistryIssue[];
  ratings: RegistryRating[];
  averageRating: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SkillSearchResult {
  slug: string;
  name: string;
  description: string;
  latestVersion: string;
  status: ReviewVerdict;
  scores: ReviewScores;
  averageRating: number;
  ratingCount: number;
  openIssues: number;
  contributors: RegistryContributor[];
  downloads: number;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
}
