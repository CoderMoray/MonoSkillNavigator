import { describe, expect, test, vi } from "vitest";
import {
  getPasswordResetExpiresMs,
  isLoginErrorStrict,
  isPublicRegistrationEnabled,
  loadDotEnvIfPresent,
} from "@skill-platform/storage";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("isLoginErrorStrict", () => {
  test("未设置时默认 true（严格模式）", () => {
    expect(isLoginErrorStrict({})).toBe(true);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "" })).toBe(true);
  });

  test("显式 true 值", () => {
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "true" })).toBe(true);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "1" })).toBe(true);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "yes" })).toBe(true);
  });

  test("显式 false 值（宽松模式）", () => {
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "false" })).toBe(false);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "0" })).toBe(false);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "no" })).toBe(false);
  });
});

describe("isPublicRegistrationEnabled", () => {
  test("未设置时默认 true（开放注册）", () => {
    expect(isPublicRegistrationEnabled({})).toBe(true);
  });

  test("显式 false 关闭注册", () => {
    expect(isPublicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "false" })).toBe(false);
    expect(isPublicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "0" })).toBe(false);
  });

  test("显式 true 开放注册", () => {
    expect(isPublicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "true" })).toBe(true);
  });
});

describe("getPasswordResetExpiresMs", () => {
  test("默认 1 小时", () => {
    expect(getPasswordResetExpiresMs({})).toBe(3_600_000);
  });

  test("自定义值", () => {
    expect(getPasswordResetExpiresMs({ PASSWORD_RESET_EXPIRES_MS: "60000" })).toBe(60_000);
  });

  test("非法值抛错", () => {
    expect(() => getPasswordResetExpiresMs({ PASSWORD_RESET_EXPIRES_MS: "abc" })).toThrow(
      "PASSWORD_RESET_EXPIRES_MS"
    );
  });
});

describe("loadDotEnvIfPresent 的 DOTENV_FILE", () => {
  test("DOTENV_FILE 显式指定的文件被加载", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "skillnav-dotenv-"));
    const file = path.join(dir, "custom.env");
    writeFileSync(file, "DOTENV_PROBE=hello\n");
    vi.stubEnv("DOTENV_FILE", file);

    try {
      loadDotEnvIfPresent();
      expect(process.env.DOTENV_PROBE).toBe("hello");
    } finally {
      vi.unstubAllEnvs();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
