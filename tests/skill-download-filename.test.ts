import { describe, expect, it } from "vitest";
import {
  buildSkillDownloadFileName,
  parseSkillDownloadVersion,
  sanitizeSkillDownloadBaseName
} from "@skill-platform/skill-spec/skill-format";

describe("skill download filename", () => {
  it("builds skillname-version.zip from display name", () => {
    expect(buildSkillDownloadFileName("Demo Skill", "0.1.0")).toBe("Demo-Skill-0.1.0.zip");
    expect(sanitizeSkillDownloadBaseName("Demo Skill")).toBe("Demo-Skill");
  });

  it("parses version back out of the download filename", () => {
    const fileName = buildSkillDownloadFileName("Demo Skill", "1.2.3");
    expect(parseSkillDownloadVersion(fileName, "Demo Skill")).toBe("1.2.3");
    expect(parseSkillDownloadVersion("demo-skill-latest.zip", "Demo Skill")).toBeUndefined();
  });
});
