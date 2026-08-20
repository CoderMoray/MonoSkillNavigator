import { describe, expect, test, vi } from "vitest";

/**
 * apiUrl is read from NEXT_PUBLIC_API_URL at module load time, so each case
 * must reload the module with a fresh env value via vi.resetModules().
 */
async function loadApiUrl() {
  vi.resetModules();
  const { apiUrl } = await import("../apps/web/lib/api");
  return apiUrl;
}

describe("apiUrl 保留 base 前缀（子路径嵌入场景）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("独立部署：无前缀 base 拼接", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:3000");
    const apiUrl = await loadApiUrl();
    expect(apiUrl("/auth/forgot-password").toString()).toBe(
      "http://127.0.0.1:3000/auth/forgot-password"
    );
  });

  test("嵌入部署：base 带 /MonoSkillNavigator/api 前缀保留", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:8081/MonoSkillNavigator/api");
    const apiUrl = await loadApiUrl();
    expect(apiUrl("/auth/forgot-password").toString()).toBe(
      "http://127.0.0.1:8081/MonoSkillNavigator/api/auth/forgot-password"
    );
  });

  test("base 带尾斜杠也不重复", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:8081/MonoSkillNavigator/api/");
    const apiUrl = await loadApiUrl();
    expect(apiUrl("/skills").toString()).toBe(
      "http://127.0.0.1:8081/MonoSkillNavigator/api/skills"
    );
  });

  test("带查询参数模板的路径保留前缀", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:8081/MonoSkillNavigator/api");
    const apiUrl = await loadApiUrl();
    const url = apiUrl(`/skills/${encodeURIComponent("demo-skill")}/issues`);
    expect(url.toString()).toBe(
      "http://127.0.0.1:8081/MonoSkillNavigator/api/skills/demo-skill/issues"
    );
  });
});
