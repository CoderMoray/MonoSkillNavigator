import cors from "@fastify/cors";
import Fastify, { type FastifyReply } from "fastify";
import { pathToFileURL } from "node:url";
import { evaluateSkillSnapshot } from "@skill-platform/evaluator";
import { reviewSkillSnapshot } from "@skill-platform/review-engine";
import {
  applySkillPublishMetadata,
  findSkillEntryFile,
  getSkillSlug,
  parseSkillMarkdown,
  readSkillZipBuffer,
  skillSnapshotToZipBuffer,
  type SkillPublishMetadata,
  type SkillSnapshot
} from "@skill-platform/skill-spec";
import {
  createAuthStoreFromEnv,
  createRegistryStoreFromEnv,
  isSkillContributor,
  loadDotEnvIfPresent,
  type ContributorRole,
  type IssueSeverity,
  type IssueStatus,
  type IssueType,
  type LeaderboardSort,
  type PublicUser
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

interface VersionParams {
  slug: string;
  version: string;
}

export function buildServer() {
  const app = Fastify({
    logger: true
  });
  const store = createRegistryStoreFromEnv();
  const authStore = createAuthStoreFromEnv();

  app.register(cors, {
    origin: true
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

  app.get<{ Querystring: { query?: string } }>("/skills", async (request) => {
    return {
      items: await store.search(request.query.query ?? "")
    };
  });

  app.post<{ Body: PublishBody }>("/skills/publish/preview", async (request, reply) => {
    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
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
      if (existingSkill && !isSkillContributor(existingSkill, user)) {
        return reply.code(403).send({ error: "Only skill contributors can publish new versions" });
      }

      const evaluation = evaluateSkillSnapshot(snapshot);
      const review = reviewSkillSnapshot(snapshot, version);
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
      return reply.code(message.includes("already exists") ? 409 : 400).send({ error: message });
    }
  });

  app.post<{ Body: ReviewBody }>("/reviews/run", async (request) => {
    const { snapshot, version } = readSkillFromBody(request.body);
    return {
      review: reviewSkillSnapshot(snapshot, version),
      evaluation: evaluateSkillSnapshot(snapshot)
    };
  });

  app.post<{ Body: ReviewBody }>("/evaluations/run", async (request) => {
    const { snapshot } = readSkillFromBody(request.body);
    return {
      evaluation: evaluateSkillSnapshot(snapshot)
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

    const reviewed = await store.reviewAll(
      (snapshot, version) => reviewSkillSnapshot(snapshot, version),
      (snapshot) => evaluateSkillSnapshot(snapshot)
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

  app.get<{ Querystring: { sort?: LeaderboardSort; limit?: string } }>("/leaderboard", async (request) => {
    return {
      items: await store.leaderboard(request.query.sort ?? "downloads", Number(request.query.limit ?? 20))
    };
  });

  app.post<{ Params: SkillParams; Body: ContributorBody }>("/skills/:slug/contributors", async (request, reply) => {
    try {
      const user = await getAuthenticatedUser(request.headers.authorization, authStore);
      if (!user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const skill = await store.getSkill(request.params.slug);
      if (!skill) {
        return reply.code(404).send({ error: "skill_not_found" });
      }
      if (!isSkillContributor(skill, user)) {
        return reply.code(403).send({ error: "Only skill contributors can add contributors" });
      }

      const contributorUser = await authStore.getUserByUsername(request.body.name).catch(() => undefined);
      const contributor = await store.addContributor(request.params.slug, {
        role: request.body.role,
        name: contributorUser?.username ?? request.body.name,
        username: contributorUser?.username,
        userId: contributorUser?.id
      });
      return reply.code(201).send({ contributor });
    } catch {
      return reply.code(404).send({ error: "skill_not_found" });
    }
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
      return reply.code(message.includes("score") ? 400 : 404).send({ error: message });
    }
  });

  app.get<{ Params: SkillParams }>("/skills/:slug", async (request, reply) => {
    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }

    return skill;
  });

  app.get<{ Params: VersionParams }>("/skills/:slug/versions/:version", async (request, reply) => {
    const registryVersion = await store.getVersion(request.params.slug, request.params.version);
    if (!registryVersion) {
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

  const parsed = parseSkillMarkdown(entry.content);
  let slug: string | undefined;
  try {
    slug = getSkillSlug(parsed.manifest);
  } catch {
    slug = typeof parsed.manifest.slug === "string" ? parsed.manifest.slug : undefined;
  }

  return {
    entryPath: entry.path,
    frontmatter: {
      name: parsed.manifest.name,
      description: parsed.manifest.description,
      slug,
      version: parsed.manifest.version,
      categories: parsed.manifest.categories,
      topics: parsed.manifest.topics
    }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  const app = buildServer();

  await app.listen({ port, host });
}
