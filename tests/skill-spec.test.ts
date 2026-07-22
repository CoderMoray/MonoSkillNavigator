import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSkillFrontmatterFromZip } from "../apps/web/lib/parse-skill-archive.js";
import {
  findSkillEntryPath,
  isValidSkillSlug,
  parseSkillFrontmatterHints,
  validatePublishMetadataInput
} from "../packages/skill-spec/src/skill-format.js";
import { parseSkillMarkdown, readSkillZipBuffer, validateSkillSnapshot } from "../packages/skill-spec/src/index.js";

describe("Slug validation", () => {
  it("accepts unscoped npm-safe slugs", () => {
    expect(isValidSkillSlug("demo-skill")).toBe(true);
    expect(isValidSkillSlug("a")).toBe(true);
  });

  it("accepts scoped slugs", () => {
    expect(isValidSkillSlug("@example.tools/demo-plugin")).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(isValidSkillSlug("Demo-Skill")).toBe(false);
    expect(isValidSkillSlug("@scope/")).toBe(false);
  });
});

describe("Skill entry file discovery", () => {
  it("prefers SKILL.md over legacy names", () => {
    expect(findSkillEntryPath(["skill.md", "SKILL.md", "skills.md"])).toBe("SKILL.md");
  });

  it("accepts legacy skills.md", () => {
    expect(findSkillEntryPath(["readme.txt", "skills.md"])).toBe("skills.md");
  });
});

describe("Skill snapshot validation", () => {
  it("parses frontmatter with semver version", () => {
    const parsed = parseSkillMarkdown(`---
name: demo-skill
description: A short summary for testing the parser.
version: 1.0.0
---
# Body
`);
    expect(parsed.manifest.version).toBe("1.0.0");
  });

  it("reads zip packages with skill.md entry file", async () => {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile(
      "my-skill/skill.md",
      Buffer.from(`---
name: legacy-skill
description: Legacy entry filename should still validate in the zip reader.
version: 2.0.0
---
# Legacy
`)
    );
    const snapshot = readSkillZipBuffer(zip.toBuffer());
    expect(snapshot.entryPath).toBe("skill.md");
    expect(snapshot.manifest.name).toBe("legacy-skill");
  });

  it("requires semver version in validateSkillSnapshot", () => {
    const issues = validateSkillSnapshot({
      manifest: {
        name: "demo-skill",
        description: "Missing version should be flagged.",
        slug: "demo-skill"
      },
      readme: "x".repeat(80),
      files: [
        {
          path: "SKILL.md",
          content: `---
name: demo-skill
description: Missing version should be flagged.
---
${"x".repeat(80)}
`,
          size: 100,
          sha256: "abc"
        }
      ],
      contentHash: "hash",
      createdAt: new Date().toISOString()
    });

    expect(issues.some((issue) => issue.code === "version-missing")).toBe(true);
  });
});

describe("Skill frontmatter hints", () => {
  it("extracts description from SKILL.md frontmatter", () => {
    const hints = parseSkillFrontmatterHints(`---
name: demo-skill
description: Reviews a short product idea and returns structured feedback.
version: 1.0.0
---
# Body
`);

    expect(hints?.description).toBe("Reviews a short product idea and returns structured feedback.");
  });
});

describe("Skill archive frontmatter", () => {
  it("reads description from demo-skill.zip", async () => {
    const buffer = readFileSync("examples/demo-skill.zip");
    const file = new File([buffer], "demo-skill.zip", { type: "application/zip" });
    const hints = await readSkillFrontmatterFromZip(file);

    expect(hints?.description).toContain("Reviews a short product idea");
  });
});

describe("Web publish metadata", () => {
  it("uses shared publish metadata validation", () => {
    const error = validatePublishMetadataInput({
      displayName: "Demo",
      slug: "demo-skill",
      summary: "A valid summary",
      categories: ["Developer Tools"],
      topics: [],
      version: "not-semver",
      releaseTags: ["latest"]
    });

    expect(error).toContain("SemVer");
  });
});
