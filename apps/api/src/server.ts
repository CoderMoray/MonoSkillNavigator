import cors from "@fastify/cors";
import Fastify, { type FastifyReply } from "fastify";
import { pathToFileURL } from "node:url";
import { evaluateSkillSnapshot } from "@skill-platform/evaluator";
import { reviewSkillSnapshot } from "@skill-platform/review-engine";
import {
  applySkillPublishMetadata,
  findSkillEntryFile,
  getSkillSlug,
  parseSkillFrontmatterHints,
  readSkillZipBuffer,
  readSkillZipFrontmatterHints,
  skillSnapshotToZipBuffer,
  type SkillPublishMetadata,
  type SkillSnapshot
} from "@skill-platform/skill-spec";
import {
  aggregateCreators,
  createAuthStoreFromEnv,
  createEmptyCreatorSummary,
  createRegistryStoreFromEnv,
  isSkillContributor,
  isSkillOwner,
  listCreators,
  loadDotEnvIfPresent,
  mergeOwnerUnpublishedSkills,
  normalizeCategoryFilters,
  normalizeHandle,
  type ContributorRole,
  type IssueSeverity,
  type IssueStatus,
  type IssueType,
  type LeaderboardSort,
  type PublicUser,
  type RegistrySkill
} from "@skill-platform/storage";

loadDotEnvIfPresent();

interface PublishBody {
  snapshot?: SkillSnapshot;
  archiveBase64?: string;
  version?: string;
  metadata?: SkillPublishMetadata;
  changelog?: string;
}

interface ReviewBody {
  snapshot?: SkillSnapshot;
  archiveBase64?: string;
  version?: string;
}

interface ContributorBody {
  name: string;
  role: ContributorRole;
}

interface IssueBody {
  type: IssueType;
  severity?: IssueSeverity;
  title: string;
  body?: string;
  createdBy?: string;
}

interface RatingBody {
  version?: string;
  user?: string;
  score: number;
  comment?: string;
}

interface RegisterBody {
  username: string;
  password: string;
}

interface LoginBody {
  username: string;
  password: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

interface SkillParams {
  slug: string;
}

interface CreatorParams {
  username: string;
}

interface VersionParams {
  slug: string;
  version: string;
}

type LeaderboardQuerySort = LeaderboardSort | "compliance" | "privacy";

function filterSkillVersionsForViewer(skill: RegistrySkill, user: PublicUser | undefined): RegistrySkill {
  if (user && isSkillOwner(skill, user)) {
    return skill;
  }

  return {
    ...skill,
    versions: Object.fromEntries(
      Object.entries(skill.versions).filter(([, version]) => version.published !== false)
    )
  };
}

function canAccessVersion(
  skill: RegistrySkill | undefined,
  version: { published?: boolean } | undefined,
  user: PublicUser | undefined
): boolean {
  if (!skill || !version) {
    return false;
  }
  if (version.published !== false) {
    return true;
  }
  return Boolean(user && isSkillOwner(skill, user));
}

function versionManageErrorStatus(message: string): number {
  if (message === "cannot_unpublish_latest_version") {
    return 400;
  }
  if (message === "version_already_unpublished" || message === "version_already_published") {
    return 409;
  }
  if (message.includes("Version not found") || message.includes("Skill not found")) {
    return 404;
  }
  return 400;
}

export function buildServer() {
  const app = Fastify({
    logger: true
  });
  const store = createRegistryStoreFromEnv();
  const authStore = createAuthStoreFromEnv();

  const runRecycleBinPurge = () => {
    void store
      .purgeExpiredRecycleBinSkills()
      .then((count) => {
        if (count > 0) {
          app.log.info({ count }, "Purged expired recycle-bin skills");
        }
      })
      .catch((error) => {
        app.log.error({ err: error }, "Recycle-bin purge failed");
      });
  };
  runRecycleBinPurge();
  const recycleBinPurgeTimer = setInterval(runRecycleBinPurge, 6 * 60 * 60 * 1000);
  recycleBinPurgeTimer.unref?.();

  app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });

  app.get("/health", async () => ({
    ok: true,
    service: "skill-platform-api",
    timestamp: new Date().toISOString()
  }));

  app.post<{ Body: RegisterBody }>("/auth/register", async (request, reply) => {
    try {
      const user = await authStore.register(request.body.username, request.body.password);
      const session = await authStore.login(request.body.username, request.body.password);
      return reply.code(201).send({ user, token: session.token, expiresAt: session.expiresAt });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
    try {
      const session = await authStore.login(request.body.username, request.body.password);
      return { user: session.user, token: session.token, expiresAt: session.expiresAt };
    } catch (error) {
      return reply.code(401).send({ error: errorMessage(error) });
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    await authStore.logout(token);
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    const user = token ? await authStore.getUserByToken(token) : undefined;
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    return { user };
  });

  app.post<{ Body: ChangePasswordBody }>("/auth/change-password", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
      const user = await authStore.changePassword(
        token,
        request.body.currentPassword,
        request.body.newPassword
      );
      return { user };
    } catch (error) {
      const message = errorMessage(error);
      return reply.code(message === "Unauthorized" ? 401 : 400).send({ error: message });
    }
  });

  app.get<{ Querystring: { query?: string; category?: string | string[] } }>("/skills", async (request) => {
    return {
      items: await store.search(request.query.query ?? "", normalizeCategoryFilters(request.query.category))
    };
  });

  app.get<{ Querystring: { query?: string } }>("/creators", async (request) => {
    const skills = await store.search("");
    const users = await authStore.listUsers();
    const normalizedQuery = request.query.query?.trim().toLowerCase() ?? "";
    const items = listCreators(skills, users).filter((creator) => {
      if (!normalizedQuery) {
        return true;
      }
      return (
        creator.name.toLowerCase().includes(normalizedQuery) ||
        creator.handle.includes(normalizedQuery)
      );
    });

    return { items };
  });

  app.get<{ Params: CreatorParams }>("/creators/:username", async (request, reply) => {
    const handle = normalizeHandle(request.params.username);
    const viewer = await getAuthenticatedUser(request.headers.authorization, authStore);
    const skills = await store.search("");
    const isProfileOwner = Boolean(viewer && normalizeHandle(viewer.username) === handle);
    let unpublished: Awaited<ReturnType<typeof store.listUnpublishedSkillsForOwner>> = [];
    if (isProfileOwner && viewer) {
      unpublished = await store.listUnpublishedSkillsForOwner(viewer.id);
    }

    const matched = aggregateCreators(skills).find((item) => item.handle === handle);
    if (matched) {
      return {
        creator: isProfileOwner ? mergeOwnerUnpublishedSkills(matched, unpublished) : matched
      };
    }

    const user = await authStore.getUserByUsername(handle);
    if (!user) {
      return reply.code(404).send({ error: "Creator not found" });
    }

    let creator = createEmptyCreatorSummary(user.username);
    if (isProfileOwner) {
      creator = mergeOwnerUnpublishedSkills(creator, unpublished);
    }
    return { creator };
  });

  app.post<{ Body: PublishBody }>("/skills/publish/preview", async (request, reply) => {
    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
      if (request.body.archiveBase64) {
        const buffer = Buffer.from(stripDataUrlPrefix(request.body.archiveBase64), "base64");
        const preview = readSkillZipFrontmatterHints(buffer);
        return {
          entryPath: preview.entryPath,
          frontmatter: preview.frontmatter ?? {}
        };
      }

      const uploaded = readSkillFromBody(request.body);
      return extractPublishPreview(uploaded.snapshot);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post<{ Body: PublishBody }>("/skills/publish", async (request, reply) => {
    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
      const changelog = normalizeChangelog(request.body.changelog);
      const uploaded = readSkillFromBody(request.body);
      const snapshot = request.body.metadata
        ? applySkillPublishMetadata(uploaded.snapshot, request.body.metadata)
        : uploaded.snapshot;
      const version = request.body.metadata?.version ?? uploaded.version;
      const slug = getSkillSlug(snapshot.manifest);
      const existingSkill = await store.getSkill(slug);
      if (existingSkill?.deletedAt) {
        return reply.code(409).send({ error: "skill_in_recycle_bin" });
      }
      if (existingSkill && !isSkillContributor(existingSkill, user)) {
        return reply.code(403).send({ error: "Only skill contributors can publish new versions" });
      }

      const evaluation = await evaluateSkillSnapshot(snapshot);
      const review = await reviewSkillSnapshot(snapshot, version, evaluation);
      const registryVersion = await store.publishSnapshot(snapshot, review, evaluation, {
        owner: {
          userId: user.id,
          username: user.username
        },
        releaseTags: request.body.metadata?.releaseTags,
        changelog
      });

      return reply.code(201).send({
        slug,
        name: registryVersion.manifest.name,
        version: registryVersion.version,
        releaseTags: registryVersion.releaseTags,
        status: registryVersion.status,
        contentHash: registryVersion.contentHash,
        review: registryVersion.review,
        evaluation: registryVersion.evaluation,
        changelog: registryVersion.changelog
      });
    } catch (error) {
      const message = errorMessage(error);
      return reply.code(
        message.includes("already exists") || message === "skill_in_recycle_bin" ? 409 : 400
      ).send({ error: message });
    }
  });

  app.post<{ Body: ReviewBody }>("/reviews/run", async (request) => {
    const { snapshot, version } = readSkillFromBody(request.body);
    const evaluation = await evaluateSkillSnapshot(snapshot);
    return {
      review: await reviewSkillSnapshot(snapshot, version, evaluation),
      evaluation
    };
  });

  app.post<{ Body: ReviewBody }>("/evaluations/run", async (request) => {
    const { snapshot } = readSkillFromBody(request.body);
    return {
      evaluation: await evaluateSkillSnapshot(snapshot)
    };
  });

  app.post("/reviews/rebuild", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden" });
    }

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
    return {
      reviewed: reviewed.length,
      items: reviewed.map((item) => ({
        slug: getSkillSlug(item.manifest),
        name: item.manifest.name,
        version: item.version,
        status: item.status,
        scores: item.review.scores,
        evaluation: item.evaluation
      }))
    };
  });

  app.get<{ Querystring: { sort?: LeaderboardQuerySort; limit?: string; category?: string | string[] } }>("/leaderboard", async (request) => {
    return {
      items: await store.leaderboard(
        normalizeLeaderboardSort(request.query.sort),
        Number(request.query.limit ?? 20),
        normalizeCategoryFilters(request.query.category)
      )
    };
  });

  app.post<{ Params: SkillParams; Body: ContributorBody }>("/skills/:slug/contributors", async (request, reply) => {
    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Only skill owners can add contributors" });
    }

    const contributorName = request.body.name.trim();
    if (!contributorName) {
      return reply.code(400).send({ error: "contributor_username_required" });
    }

    let contributorUser: Awaited<ReturnType<typeof authStore.getUserByUsername>>;
    try {
      contributorUser = await authStore.getUserByUsername(contributorName);
    } catch {
      return reply.code(404).send({ error: "user_not_found" });
    }
    if (!contributorUser) {
      return reply.code(404).send({ error: "user_not_found" });
    }

    const contributor = await store.addContributor(request.params.slug, {
      role: request.body.role,
      name: contributorUser.username,
      username: contributorUser.username,
      userId: contributorUser.id
    });
    return reply.code(201).send({ contributor });
  });

  app.post<{ Params: SkillParams; Body: IssueBody }>("/skills/:slug/issues", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    try {
      const issue = await store.createIssue(request.params.slug, {
        ...request.body,
        createdBy: user.username
      });
      return reply.code(201).send({ issue });
    } catch {
      return reply.code(404).send({ error: "skill_not_found" });
    }
  });

  app.get<{ Params: SkillParams; Querystring: { status?: IssueStatus } }>(
    "/skills/:slug/issues",
    async (request, reply) => {
      const skill = await store.getSkill(request.params.slug);
      if (!skill) {
        return reply.code(404).send({ error: "skill_not_found" });
      }

      return {
        items: await store.listIssues(request.params.slug, request.query.status)
      };
    }
  );

  app.post<{ Params: SkillParams; Body: RatingBody }>("/skills/:slug/ratings", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    try {
      const rating = await store.addRating(request.params.slug, {
        ...request.body,
        user: user.username
      });
      const skill = await store.getSkill(request.params.slug);
      return reply.code(201).send({
        rating,
        averageRating: skill?.averageRating ?? 0,
        ratingCount: skill?.ratingCount ?? 0
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "rating_failed";
      const status =
        message === "rating_already_submitted" ? 409 : message.includes("score") ? 400 : 404;
      return reply.code(status).send({ error: message });
    }
  });

  app.get<{ Params: SkillParams }>("/skills/:slug/availability", async (request) => {
    const availability = await store.getSkillSlugAvailability(request.params.slug);
    if (availability.status !== "active") {
      return availability;
    }

    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!user) {
      return availability;
    }

    const skill = await store.getSkill(request.params.slug);
    return {
      ...availability,
      viewerCanPublish: skill ? isSkillContributor(skill, user) : false,
    };
  });

  app.get<{ Params: SkillParams }>("/skills/:slug", async (request, reply) => {
    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }

    if (skill.published === false) {
      const user = await getAuthenticatedUser(request.headers.authorization, authStore);
      if (!user || !isSkillOwner(skill, user)) {
        return reply.code(404).send({ error: "skill_not_found" });
      }
    }

    if (skill.deletedAt) {
      return reply.code(404).send({ error: "skill_not_found" });
    }

    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    const bookmarkedByViewer = user
      ? await store.isSkillBookmarked(user.id, request.params.slug)
      : undefined;

    return {
      ...filterSkillVersionsForViewer(skill, user),
      bookmarkedByViewer
    };
  });

  app.get<{ Params: VersionParams }>("/skills/:slug/versions/:version", async (request, reply) => {
    const skill = await store.getSkill(request.params.slug);
    const registryVersion = await store.getVersion(request.params.slug, request.params.version);
    if (!registryVersion) {
      return reply.code(404).send({ error: "version_not_found" });
    }

    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!canAccessVersion(skill, registryVersion, user)) {
      return reply.code(404).send({ error: "version_not_found" });
    }

    const { snapshot: _snapshot, ...metadata } = registryVersion;
    return metadata;
  });

  app.get<{ Params: VersionParams }>("/skills/:slug/versions/:version/download", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (skill.deletedAt) {
      return reply.code(404).send({ error: "skill_not_found" });
    }

    if (skill.published === false && !isSkillOwner(skill, user)) {
      return reply.code(404).send({ error: "skill_unpublished" });
    }

    const registryVersion = await store.getVersion(request.params.slug, request.params.version);
    if (!canAccessVersion(skill, registryVersion, user)) {
      return reply.code(404).send({ error: "version_unpublished" });
    }

    const snapshot = await store.downloadSnapshot(request.params.slug, request.params.version);
    if (!snapshot) {
      return reply.code(404).send({ error: "version_not_found" });
    }

    const fileName = `${getSkillSlug(snapshot.manifest)}-${request.params.version}.zip`;
    return reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="${fileName}"`)
      .send(skillSnapshotToZipBuffer(snapshot));
  });

  app.post<{ Params: SkillParams }>("/skills/:slug/unpublish", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const updated = await store.unpublishSkill(request.params.slug);
      return { skill: updated };
    } catch {
      return reply.code(404).send({ error: "skill_not_found" });
    }
  });

  app.post<{ Params: SkillParams }>("/skills/:slug/republish", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    if (skill.published !== false) {
      return reply.code(400).send({ error: "skill_already_published" });
    }

    try {
      const updated = await store.republishSkill(request.params.slug);
      return { skill: updated };
    } catch {
      return reply.code(404).send({ error: "skill_not_found" });
    }
  });

  app.post<{ Params: VersionParams }>("/skills/:slug/versions/:version/unpublish", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const updated = await store.unpublishVersion(request.params.slug, request.params.version);
      return { skill: filterSkillVersionsForViewer(updated, user) };
    } catch (error) {
      const message = errorMessage(error);
      return reply.code(versionManageErrorStatus(message)).send({ error: message });
    }
  });

  app.post<{ Params: VersionParams }>("/skills/:slug/versions/:version/republish", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const updated = await store.republishVersion(request.params.slug, request.params.version);
      return { skill: filterSkillVersionsForViewer(updated, user) };
    } catch (error) {
      const message = errorMessage(error);
      return reply.code(versionManageErrorStatus(message)).send({ error: message });
    }
  });

  app.delete<{ Params: SkillParams }>("/skills/:slug", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      await store.deleteSkill(request.params.slug);
      const deletedAt = new Date();
      const { skillRecyclePurgeAt } = await import("@skill-platform/storage");
      return {
        ok: true,
        recycleBin: true,
        deletedAt: deletedAt.toISOString(),
        purgeAt: skillRecyclePurgeAt(deletedAt).toISOString()
      };
    } catch {
      return reply.code(404).send({ error: "skill_not_found" });
    }
  });

  app.post<{ Params: SkillParams }>("/skills/:slug/restore", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill?.deletedAt) {
      return reply.code(404).send({ error: "skill_not_in_recycle_bin" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const restored = await store.restoreSkill(request.params.slug);
      return { skill: restored };
    } catch {
      return reply.code(404).send({ error: "skill_not_in_recycle_bin" });
    }
  });

  app.delete<{ Params: SkillParams }>("/skills/:slug/purge", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill?.deletedAt) {
      return reply.code(404).send({ error: "skill_not_in_recycle_bin" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      await store.purgeRecycleBinSkill(request.params.slug);
      return { ok: true, purged: true, slug: request.params.slug };
    } catch {
      return reply.code(404).send({ error: "skill_not_in_recycle_bin" });
    }
  });

  app.get("/users/me/recycle-bin", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    return { items: await store.listRecycleBinForOwner(user.id) };
  });

  app.get("/users/me/bookmarks", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    return { items: await store.listBookmarkedSkills(user.id) };
  });

  app.put<{ Params: SkillParams }>("/skills/:slug/bookmark", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill || skill.deletedAt) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (skill.published === false && !isSkillOwner(skill, user)) {
      return reply.code(404).send({ error: "skill_not_found" });
    }

    try {
      await store.bookmarkSkill(user.id, request.params.slug);
      return { ok: true, bookmarked: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.delete<{ Params: SkillParams }>("/skills/:slug/bookmark", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    await store.unbookmarkSkill(user.id, request.params.slug);
    return { ok: true, bookmarked: false };
  });

  return app;
}

function readBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  return authorization.slice("Bearer ".length).trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function getAuthenticatedUser(
  authorization: string | undefined,
  authStore: ReturnType<typeof createAuthStoreFromEnv>
): Promise<PublicUser | undefined> {
  const token = readBearerToken(authorization);
  return token ? authStore.getUserByToken(token) : undefined;
}

async function requireAuthenticatedUser(
  authorization: string | undefined,
  authStore: ReturnType<typeof createAuthStoreFromEnv>,
  reply: FastifyReply
): Promise<PublicUser | undefined> {
  const user = await getAuthenticatedUser(authorization, authStore);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return undefined;
  }
  return user;
}

function extractPublishPreview(snapshot: SkillSnapshot) {
  const entry = findSkillEntryFile(snapshot.files);
  if (!entry) {
    throw new Error("Skill package must include SKILL.md, skill.md, or skills.md");
  }

  const frontmatter = parseSkillFrontmatterHints(entry.content);
  return {
    entryPath: entry.path,
    frontmatter: frontmatter ?? {}
  };
}

function readSkillFromBody(body: PublishBody | ReviewBody): { snapshot: SkillSnapshot; version?: string } {
  if (body.archiveBase64) {
    return {
      snapshot: readSkillZipBuffer(Buffer.from(stripDataUrlPrefix(body.archiveBase64), "base64")),
      version: body.version
    };
  }

  if (body.snapshot) {
    return {
      snapshot: body.snapshot,
      version: body.version
    };
  }

  throw new Error("Request body must include snapshot or archiveBase64");
}

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(",");
  return value.startsWith("data:") && commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

function normalizeChangelog(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("Changelog must be text");
  }

  const changelog = value.trim();
  if (changelog.length > 10_000) {
    throw new Error("Changelog must not exceed 10000 characters");
  }
  return changelog || undefined;
}

function normalizeLeaderboardSort(sort: LeaderboardQuerySort | undefined): LeaderboardSort {
  if (sort === "compliance") {
    return "quality";
  }
  if (sort === "privacy") {
    return "security";
  }
  return sort ?? "downloads";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  const app = buildServer();

  await app.listen({ port, host });
}
