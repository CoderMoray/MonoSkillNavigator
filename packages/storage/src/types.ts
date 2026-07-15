import type { ReviewReport, ReviewVerdict } from "@skill-platform/review-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import type { SkillManifest, SkillSnapshot } from "@skill-platform/skill-spec";

export type ContributorRole = "owner" | "maintainer" | "reviewer" | "contributor";
export type IssueType = "bug" | "security" | "compatibility" | "feature" | "docs";
export type IssueStatus = "open" | "triaged" | "closed";
export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type LeaderboardSort = "downloads" | "rating" | "quality" | "security" | "functional" | "recent";
export type ArtifactProvider = "minio";

export interface ArtifactDescriptor {
  provider: ArtifactProvider;
  bucket: string;
  objectKey: string;
  contentHash: string;
  size: number;
  storedAt: string;
}

export interface ArtifactStore {
  putSnapshot(slug: string, version: string, snapshot: SkillSnapshot): Promise<ArtifactDescriptor>;
  getSnapshot(descriptor: ArtifactDescriptor): Promise<SkillSnapshot>;
}

export interface RegistryContributor {
  id: string;
  userId?: string;
  username?: string;
  name: string;
  role: ContributorRole;
  addedAt: string;
}

export interface RegistryIssue {
  id: string;
  type: IssueType;
  status: IssueStatus;
  severity: IssueSeverity;
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
  snapshot: SkillSnapshot;
  artifact?: ArtifactDescriptor;
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

export interface RegistryData {
  skills: Record<string, RegistrySkill>;
}

export interface SkillSearchResult {
  slug: string;
  name: string;
  description: string;
  latestVersion: string;
  status: ReviewVerdict;
  scores: ReviewReport["scores"];
  averageRating: number;
  ratingCount: number;
  openIssues: number;
  contributors: RegistryContributor[];
  downloads: number;
  updatedAt: string;
}

export interface CreateIssueInput {
  type: IssueType;
  severity?: IssueSeverity;
  title: string;
  body?: string;
  createdBy?: string;
}

export interface CreateRatingInput {
  version?: string;
  user: string;
  score: number;
  comment?: string;
}

export interface PublishSnapshotOptions {
  owner?: {
    userId: string;
    username: string;
  };
  releaseTags?: string[];
}

export interface PostgresRegistryStoreOptions {
  artifactStore?: ArtifactStore;
}

export interface FileRegistryStoreOptions {
  artifactStore?: ArtifactStore;
}

export interface MinioArtifactStoreOptions {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

export interface RegistryStore {
  publishSnapshot(
    snapshot: SkillSnapshot,
    review: ReviewReport,
    evaluation?: FunctionalEvaluationReport,
    options?: PublishSnapshotOptions
  ): Promise<RegistryVersion>;
  upsertReview(slug: string, version: string, review: ReviewReport): Promise<RegistryVersion>;
  upsertEvaluation(slug: string, version: string, evaluation: FunctionalEvaluationReport): Promise<RegistryVersion>;
  addContributor(slug: string, contributor: Omit<RegistryContributor, "id" | "addedAt">): Promise<RegistryContributor>;
  createIssue(slug: string, issue: CreateIssueInput): Promise<RegistryIssue>;
  listIssues(slug: string, status?: IssueStatus): Promise<RegistryIssue[]>;
  addRating(slug: string, rating: CreateRatingInput): Promise<RegistryRating>;
  search(query?: string): Promise<SkillSearchResult[]>;
  getSkill(slug: string): Promise<RegistrySkill | undefined>;
  getVersion(slug: string, version?: string): Promise<RegistryVersion | undefined>;
  leaderboard(sort?: LeaderboardSort, limit?: number): Promise<SkillSearchResult[]>;
  downloadSnapshot(slug: string, version?: string): Promise<SkillSnapshot | undefined>;
  reviewAll(
    reviewFn: (snapshot: SkillSnapshot, version: string) => ReviewReport,
    evaluationFn?: (snapshot: SkillSnapshot) => FunctionalEvaluationReport
  ): Promise<RegistryVersion[]>;
}
