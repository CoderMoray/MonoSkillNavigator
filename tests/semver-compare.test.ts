import { describe, expect, test } from "vitest";
import { compareSemver, isSemverGreaterThan } from "@skill-platform/skill-spec/skill-format";

describe("compareSemver", () => {
  test("orders core semver versions", () => {
    expect(compareSemver("1.0.2", "1.0.1")).toBe(1);
    expect(compareSemver("0.1.3", "1.0.1")).toBe(-1);
    expect(compareSemver("1.0.1", "1.0.1")).toBe(0);
  });

  test("treats release versions as greater than prereleases", () => {
    expect(compareSemver("1.0.1", "1.0.1-rc.1")).toBe(1);
    expect(compareSemver("1.0.1-rc.2", "1.0.1-rc.1")).toBe(1);
  });

  test("returns null for invalid semver", () => {
    expect(compareSemver("1.0", "1.0.0")).toBeNull();
  });

  test("isSemverGreaterThan reflects compareSemver", () => {
    expect(isSemverGreaterThan("1.0.2", "1.0.1")).toBe(true);
    expect(isSemverGreaterThan("0.1.3", "1.0.1")).toBe(false);
  });
});
