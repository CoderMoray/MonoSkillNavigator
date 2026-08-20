import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";

/** Build an API URL preserving any base path prefix (e.g. "/MonoSkillNavigator/api"). */
function apiUrl(path: string): URL {
  return new URL(path.replace(/^\/+/, ""), `${API_BASE_URL.replace(/\/+$/, "")}/`);
}
const DOC_SLUGS = [
  "monoskill-navigator",
  "skill-format",
  "publish-workflow",
  "security-scan",
  "halucatch-review"
] as const;

interface SkillFixture {
  slug: string;
  name: string;
  status: string;
}

interface CreatorFixture {
  handle: string;
  name: string;
  published: number;
}

interface SiteFixtures {
  skill: SkillFixture;
  creator: CreatorFixture;
}

interface DisposableAccount {
  username: string;
  password: string;
}

let disposableAccount: DisposableAccount | null = null;

async function loadFixtures(): Promise<SiteFixtures> {
  const [skillsResponse, creatorsResponse] = await Promise.all([
    fetch(apiUrl("/skills")),
    fetch(apiUrl("/creators"))
  ]);

  expect(skillsResponse.ok, "The API must expose at least one Skill for route coverage.").toBeTruthy();
  expect(creatorsResponse.ok, "The API must expose at least one Creator for route coverage.").toBeTruthy();

  const skills = (await skillsResponse.json()) as { items: SkillFixture[] };
  const creators = (await creatorsResponse.json()) as { items: CreatorFixture[] };
  const skill = skills.items.find((item) => item.status === "published") ?? skills.items[0];
  const creator = creators.items.find((item) => item.published > 0) ?? creators.items[0];

  expect(skill, "No Skill is available for dynamic-page coverage.").toBeDefined();
  expect(creator, "No Creator is available for dynamic-page coverage.").toBeDefined();

  return { skill: skill!, creator: creator! };
}

function monitorRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`Uncaught error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`Console error: ${message.text()} (${message.location().url})`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  return errors;
}

async function visit(page: Page, pathName: string): Promise<void> {
  const response = await page.goto(pathName);
  expect(response, `No document response when opening ${pathName}.`).not.toBeNull();
  expect(response!.status(), `${pathName} returned an HTTP error.`).toBeLessThan(400);
  await expect(page.locator("main")).toBeVisible();
}

function expectNoRuntimeErrors(errors: string[]): void {
  expect(errors, errors.join("\n")).toEqual([]);
}

async function cleanupDisposableAccount(): Promise<void> {
  if (!disposableAccount) {
    return;
  }

  const account = disposableAccount;
  disposableAccount = null;
  const loginResponse = await fetch(apiUrl("/auth/login"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(account)
  });
  if (loginResponse.status === 401) {
    return;
  }

  expect(loginResponse.ok, `Could not log in to clean up ${account.username}.`).toBeTruthy();
  const { token } = (await loginResponse.json()) as { token: string };
  const deleteResponse = await fetch(apiUrl("/auth/delete-account"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ password: account.password })
  });
  expect(deleteResponse.ok, `Could not delete disposable account ${account.username}.`).toBeTruthy();
}

test.describe.serial("MonoSkillNavigator browser flows", () => {
  test.afterEach(async () => {
    await cleanupDisposableAccount();
  });

  test("shows a visible home-page error when leaderboard loading fails", async ({ page }) => {
    await page.route(
      (url) =>
        url.origin === API_BASE_URL &&
        url.pathname === "/leaderboard" &&
        url.searchParams.get("sort") === "downloads" &&
        url.searchParams.get("limit") === "12",
      async (route) => {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "E2E leaderboard unavailable" })
        });
      }
    );

    await visit(page, "/");
    await expect(page.getByText("E2E leaderboard unavailable")).toBeVisible();
    await expect(page.getByText(/请确认 API 已通过 npm run dev:api 启动。/)).toBeVisible();
  });

  test("loads all public, documentation, and dynamic pages", async ({ page }) => {
    const errors = monitorRuntimeErrors(page);
    const { creator, skill } = await loadFixtures();

    await visit(page, "/");
    await expect(page.getByRole("heading", { name: "Discover trusted skills from standout creators." })).toBeVisible();
    await page.getByRole("textbox", { name: "搜索 Skill" }).fill(skill.name);
    await page.getByRole("textbox", { name: "搜索 Skill" }).press("Enter");
    await expect(page).toHaveURL(new RegExp(`/skills\\?query=${encodeURIComponent(skill.name)}`));
    await expect(page.getByText(skill.name).first()).toBeVisible();

    await visit(page, "/skills");
    await expect(page.getByRole("button", { name: "Plugins", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Plugins", exact: true }).click();
    await expect(page.getByText("Plugins 页面正在建设中，当前先开放 Skills 市场。")).toBeVisible();
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await expect(page.getByText(skill.name).first()).toBeVisible();

    await visit(page, "/creators");
    await expect(page.getByText(creator.name).first()).toBeVisible();
    await page.getByRole("textbox", { name: "搜索 Creator" }).fill(creator.handle);
    await expect(page.getByText(`@${creator.handle}`)).toBeVisible();

    await visit(page, `/creators/${encodeURIComponent(creator.handle)}`);
    await expect(page.getByRole("heading", { name: creator.name, exact: true })).toBeVisible();

    await visit(page, "/leaderboard");
    await expect(page.getByRole("heading", { name: "Skill 榜单" })).toBeVisible();
    await page.getByRole("button", { name: "排序方式" }).click();
    await page.getByRole("option", { name: "用户评分" }).click();
    await expect(page.getByRole("button", { name: "排序方式" })).toContainText("用户评分");

    await visit(page, "/reviews");
    await expect(page.getByRole("checkbox", { name: "全选全部 Skill" })).toBeVisible();
    await page.getByRole("checkbox", { name: "全选全部 Skill" }).check();
    await expect(page.getByText(/已选 \d+ 条/)).toBeVisible();

    await visit(page, `/skills/${encodeURIComponent(skill.slug)}`);
    await expect(page.getByRole("heading", { name: skill.name, exact: true })).toBeVisible();
    for (const tabName of ["Skill Card", "Files", "Versions", "审查与评估", "Issue 与评分"]) {
      await page.getByRole("tab", { name: tabName }).click();
      await expect(page.getByRole("tabpanel")).toContainText(tabName);
    }

    await visit(page, `/skills/${encodeURIComponent(skill.slug)}/halucatch`);
    await expect(page.locator(".error")).toHaveCount(0);
    await expect(
      page.getByText(/HaluCatch 完整报告|该版本暂无 HaluCatch 完整报告/)
    ).toBeVisible();

    await visit(page, "/docs");
    await expect(page).toHaveURL(/\/docs\/monoskill-navigator$/);
    await expect(page.locator("article")).toBeVisible();
    for (const slug of DOC_SLUGS) {
      await visit(page, `/docs/${slug}`);
      await expect(page.locator("article")).toBeVisible();
    }

    await visit(page, "/account");
    await expect(page.getByRole("heading", { name: "尚未登录" })).toBeVisible();
    await visit(page, "/account/change-password");
    await expect(page.getByText("请先登录后再修改密码。")).toBeVisible();
    await visit(page, "/account/delete");
    await expect(page.getByText("请先登录后再注销账户。")).toBeVisible();
    await visit(page, "/skills/publish");
    await expect(page.getByRole("heading", { name: "请先登录" })).toBeVisible();

    expectNoRuntimeErrors(errors);
  });

  test("registers, manages, and removes a disposable account", async ({ page }) => {
    const errors = monitorRuntimeErrors(page);
    const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const username = `e2e-${uniqueSuffix}`;
    const email = `${username}@example.test`;
    const initialPassword = "E2ePassword!1";
    const changedPassword = "E2ePassword!2";

    await visit(page, "/register");
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码", { exact: true }).fill(initialPassword);
    await page.getByLabel("确认密码").fill(initialPassword);
    await page.getByRole("button", { name: "注册并登录" }).click();
    await expect(page).toHaveURL(new RegExp(`/creators/${username}$`));
    await expect(page.getByRole("heading", { name: username, exact: true })).toBeVisible();
    disposableAccount = { username, password: initialPassword };

    await page.getByRole("button", { name: username, exact: true }).click();
    await page.getByRole("menuitem", { name: "登出" }).click();
    await expect(page).toHaveURL(new RegExp(`/creators/${username}$`));
    await expect(page.getByRole("link", { name: "登录" })).toBeVisible();
    await visit(page, "/login");
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("密码").fill(initialPassword);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(new RegExp(`/creators/${username}$`));

    await visit(page, "/account");
    await expect(page).toHaveURL(new RegExp(`/creators/${username}$`));

    await visit(page, "/skills/publish");
    await expect(page.getByRole("heading", { name: "添加 Skill" })).toBeVisible();
    await page
      .locator('input[type="file"][accept=".zip,application/zip"]')
      .setInputFiles(path.resolve("examples/demo-skill.zip"));
    await expect(page.getByLabel("Display Name")).toHaveValue("Demo Skill");
    await page.getByLabel("Slug").fill(`${username}-draft`);
    await page.getByRole("button", { name: "请选择分类" }).click();
    await page.getByRole("option", { name: "Productivity" }).click();
    await expect(page.getByRole("button", { name: "发布 Skill" })).toBeEnabled();

    let publishCalls = 0;
    await page.route("**/skills/publish", async (route) => {
      publishCalls += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "review_pipeline_incomplete",
          retryable: true,
          failedStages: [{ stage: "virustotal", message: "E2E simulated review timeout" }]
        })
      });
    });
    await page.getByRole("button", { name: "发布 Skill" }).click();
    const reviewFailure = page.locator(".publish-form-feedback[role='alert']");
    await expect(reviewFailure).toContainText("审查流程未完成，Skill 尚未保存。");
    await expect(reviewFailure).toContainText(/VirusTotal 扫描：\s*E2E simulated review timeout/);
    await page.getByRole("button", { name: "重新运行完整审查" }).click();
    await expect.poll(() => publishCalls).toBe(2);
    await page.unroute("**/skills/publish");

    await visit(page, "/account/change-password");
    await page.getByLabel("当前密码").fill(initialPassword);
    await page.getByLabel("新密码", { exact: true }).fill(changedPassword);
    await page.getByLabel("确认新密码").fill(changedPassword);
    await page.getByRole("button", { name: "保存新密码" }).click();
    await expect(page).toHaveURL(new RegExp(`/creators/${username}$`));
    disposableAccount.password = changedPassword;

    await visit(page, "/account/delete");
    await page.getByLabel("当前密码").fill(changedPassword);
    await page.getByRole("button", { name: "申请注销" }).click();
    await expect(page.getByRole("alertdialog", { name: "确认注销账户" })).toBeVisible();
    await page.getByRole("button", { name: "确认注销" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "登录" })).toBeVisible();

    expectNoRuntimeErrors(errors.filter((error) => !/503.*\/skills\/publish/.test(error)));
  });
});
