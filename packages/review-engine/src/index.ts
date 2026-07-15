import {
  getSkillSlug,
  normalizeTools,
  type SkillSnapshot,
  validateSkillSnapshot
} from "@skill-platform/skill-spec";
import { evaluateSkillSnapshot } from "@skill-platform/evaluator";

export type ReviewCategory = "compliance" | "leakage" | "privacy" | "security" | "functional";
export type ReviewSeverity = "low" | "medium" | "high" | "critical";
export type ReviewVerdict = "published" | "needs-review" | "rejected";

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

export interface ReviewScores {
  qualityScore: number;
  securityScore: number;
  privacyScore: number;
  functionalScore: number;
  overallScore: number;
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

interface PatternRule {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  title: string;
  pattern: RegExp;
  recommendation: string;
}

const riskyToolPattern = /^(Shell|Bash|PowerShell|WebFetch|WebSearch|CallMcpTool|FetchMcpResource)/i;

const contentRules: PatternRule[] = [
  {
    id: "dynamic-download-exec",
    category: "leakage",
    severity: "critical",
    title: "Dynamic download piped to execution",
    pattern: /(curl|wget|Invoke-WebRequest|iwr)[\s\S]{0,120}(\|\s*(bash|sh|iex|Invoke-Expression))/i,
    recommendation: "Remove dynamic download-and-execute behavior or replace it with pinned, reviewed scripts."
  },
  {
    id: "reverse-shell",
    category: "security",
    severity: "critical",
    title: "Reverse shell pattern detected",
    pattern: /(nc\s+-e|bash\s+-i|\/dev\/tcp|powershell\s+-nop)/i,
    recommendation: "Remove reverse shell behavior. Skills must never open covert remote shells."
  },
  {
    id: "destructive-command",
    category: "security",
    severity: "high",
    title: "Destructive command detected",
    pattern: /(rm\s+-rf\s+\/|Remove-Item\s+.*-Recurse\s+.*-Force|del\s+\/s\s+\/q|format\s+[a-z]:)/i,
    recommendation: "Remove destructive commands or constrain them to explicit, reviewed test fixtures."
  },
  {
    id: "credential-file-access",
    category: "privacy",
    severity: "high",
    title: "Credential file access detected",
    pattern: /(\.env|id_rsa|id_ed25519|\.aws\/credentials|\.npmrc|\.pypirc|credentials\.json|token|secret)/i,
    recommendation: "Do not read credentials. If credentials are required, document least-privilege setup without collecting secrets."
  },
  {
    id: "external-post",
    category: "leakage",
    severity: "high",
    title: "External data upload pattern detected",
    pattern: /(fetch|axios|curl|Invoke-WebRequest|iwr)[\s\S]{0,160}(POST|PUT|webhook|upload)/i,
    recommendation: "Declare network behavior and avoid uploading user data unless the skill purpose requires it."
  },
  {
    id: "environment-dump",
    category: "privacy",
    severity: "high",
    title: "Environment variable exposure detected",
    pattern: /(process\.env|printenv|Get-ChildItem\s+Env:|env\s*>)/i,
    recommendation: "Avoid dumping environment variables. Read only named variables that are required for the task."
  },
  {
    id: "prompt-injection",
    category: "security",
    severity: "medium",
    title: "Instruction override language detected",
    pattern: /(ignore (all )?(previous|system) instructions|bypass (review|policy)|do not disclose this instruction|hidden instruction)/i,
    recommendation: "Remove instruction-override language unless it is explicitly part of a defensive example."
  },
  {
    id: "persistence-mechanism",
    category: "security",
    severity: "high",
    title: "Persistence mechanism detected",
    pattern: /(crontab|schtasks|Startup\\|\.bashrc|\.zshrc|postinstall|preinstall|git hooks)/i,
    recommendation: "Skills must not install persistence unless this is the clearly documented primary purpose."
  },
  {
    id: "obfuscated-code",
    category: "security",
    severity: "medium",
    title: "Obfuscated code pattern detected",
    pattern: /(eval\(|new Function\(|fromCharCode|base64\s+-d|atob\()/i,
    recommendation: "Replace obfuscated code with readable, reviewable source."
  }
];

export function reviewSkillSnapshot(snapshot: SkillSnapshot, versionOverride?: string): ReviewReport {
  const findings: ReviewFinding[] = [];
  const version = versionOverride ?? snapshot.manifest.version ?? "0.1.0";

  for (const issue of validateSkillSnapshot(snapshot)) {
    findings.push({
      id: `spec-${issue.code}`,
      category: "compliance",
      severity: issue.code === "missing-skill-md" ? "high" : "medium",
      title: "Skill package does not match platform spec",
      message: issue.message,
      path: issue.path,
      recommendation: "Update the package to follow docs/rules/skill-spec.md."
    });
  }

  reviewManifest(snapshot, findings);
  reviewContent(snapshot, findings);
  reviewFunctionalEvidence(snapshot, findings);

  const scores = calculateScores(findings, snapshot);
  const verdict = calculateVerdict(findings);

  return {
    id: `review_${snapshot.contentHash.slice(0, 16)}_${Date.now()}`,
    skillSlug: getSkillSlug(snapshot.manifest),
    skillName: snapshot.manifest.name,
    version,
    contentHash: snapshot.contentHash,
    verdict,
    scores,
    findings,
    createdAt: new Date().toISOString()
  };
}

function reviewManifest(snapshot: SkillSnapshot, findings: ReviewFinding[]): void {
  const { manifest, readme } = snapshot;
  const description = manifest.description.trim();

  if (!/\b(use when|when|用于|适用|触发|场景)\b/i.test(description)) {
    findings.push({
      id: "description-trigger-missing",
      category: "compliance",
      severity: "medium",
      title: "Description lacks trigger scenario",
      message: "Description should explain both what the skill does and when the agent should use it.",
      recommendation: "Add concrete trigger phrases or usage scenarios to the description."
    });
  }

  if (!manifest.version) {
    findings.push({
      id: "version-missing",
      category: "compliance",
      severity: "low",
      title: "Version is missing",
      message: "The manifest does not declare a version.",
      recommendation: "Add a semantic version to frontmatter."
    });
  }

  if (!manifest.license) {
    findings.push({
      id: "license-missing",
      category: "compliance",
      severity: "low",
      title: "License is missing",
      message: "The manifest does not declare a license.",
      recommendation: "Add a license so users understand redistribution terms."
    });
  }

  if (!manifest.tags?.length) {
    findings.push({
      id: "tags-missing",
      category: "compliance",
      severity: "low",
      title: "Tags are missing",
      message: "The manifest does not include tags.",
      recommendation: "Add tags to improve discovery and categorization."
    });
  }

  const allowedTools = normalizeTools(manifest["allowed-tools"]);
  for (const tool of allowedTools) {
    if (riskyToolPattern.test(tool)) {
      findings.push({
        id: `risky-tool-${tool.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        category: tool.match(/web/i) ? "leakage" : "security",
        severity: "medium",
        title: "Risky allowed tool requested",
        message: `The skill requests pre-approval for ${tool}.`,
        evidence: tool,
        recommendation: "Scope allowed tools as narrowly as possible and document why the permission is needed."
      });
    }
  }

  const skillMd = snapshot.files.find((file) => file.path === "SKILL.md");
  if (skillMd && skillMd.content.split(/\r?\n/).length > 500) {
    findings.push({
      id: "skill-md-too-long",
      category: "compliance",
      severity: "low",
      title: "SKILL.md is long",
      message: "SKILL.md exceeds the recommended 500 line limit.",
      path: "SKILL.md",
      recommendation: "Move detailed reference material into references/ and link it from SKILL.md."
    });
  }

  if (readme.trim().length < 80) {
    findings.push({
      id: "instructions-too-short",
      category: "functional",
      severity: "medium",
      title: "Skill instructions are too short",
      message: "The instruction body is too short to guide reliable agent behavior.",
      path: "SKILL.md",
      recommendation: "Add clear workflow steps, expected outputs, and constraints."
    });
  }
}

function reviewContent(snapshot: SkillSnapshot, findings: ReviewFinding[]): void {
  for (const file of snapshot.files) {
    for (const rule of contentRules) {
      const match = rule.pattern.exec(file.content);
      if (!match) {
        continue;
      }

      findings.push({
        id: `${rule.id}-${file.path}`,
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        message: `${rule.title} in ${file.path}.`,
        path: file.path,
        evidence: excerpt(file.content, match.index),
        recommendation: rule.recommendation
      });
    }
  }
}

function reviewFunctionalEvidence(snapshot: SkillSnapshot, findings: ReviewFinding[]): void {
  const hasTests = snapshot.files.some((file) => file.path.startsWith("tests/"));
  const hasExamples = snapshot.files.some((file) => file.path.startsWith("examples/"));
  const hasAcceptanceLanguage = snapshot.files.some((file) =>
    /(expected output|验收|禁止行为|success criteria|acceptance criteria|test task)/i.test(file.content)
  );

  if (!hasTests) {
    findings.push({
      id: "tests-missing",
      category: "functional",
      severity: "medium",
      title: "Functional tests are missing",
      message: "No tests/ directory was found.",
      recommendation: "Add tests/ with sample tasks, expected outputs, and forbidden behaviors."
    });
  }

  if (!hasExamples) {
    findings.push({
      id: "examples-missing",
      category: "functional",
      severity: "low",
      title: "Examples are missing",
      message: "No examples/ directory was found.",
      recommendation: "Add examples/ to make expected behavior easier to review."
    });
  }

  if (!hasAcceptanceLanguage) {
    findings.push({
      id: "acceptance-criteria-missing",
      category: "functional",
      severity: "low",
      title: "Acceptance criteria are missing",
      message: "The skill does not describe expected outputs or forbidden behavior.",
      recommendation: "Add acceptance criteria to SKILL.md or tests/."
    });
  }
}

function calculateScores(findings: ReviewFinding[], snapshot: SkillSnapshot): ReviewScores {
  const qualityScore = clampScore(100 - penalty(findings, ["compliance"]));
  const securityScore = clampScore(100 - penalty(findings, ["security", "leakage"]));
  const privacyScore = clampScore(100 - penalty(findings, ["privacy"]));
  const functionalScore = calculateFunctionalScore(findings, snapshot);
  const overallScore = Math.round(
    qualityScore * 0.3 + securityScore * 0.35 + privacyScore * 0.25 + functionalScore * 0.1
  );

  return {
    qualityScore,
    securityScore,
    privacyScore,
    functionalScore,
    overallScore
  };
}

function calculateFunctionalScore(findings: ReviewFinding[], snapshot: SkillSnapshot): number {
  const evaluation = evaluateSkillSnapshot(snapshot);
  const staticEvidenceBonus = snapshot.files.some((file) => file.path.startsWith("examples/")) ? 5 : 0;
  return clampScore(evaluation.score + staticEvidenceBonus - penalty(findings, ["functional"]) / 2);
}

function calculateVerdict(findings: ReviewFinding[]): ReviewVerdict {
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
    return "rejected";
  }

  if (findings.some((finding) => finding.severity === "medium")) {
    return "needs-review";
  }

  return "published";
}

function penalty(findings: ReviewFinding[], categories: ReviewCategory[]): number {
  return findings
    .filter((finding) => categories.includes(finding.category))
    .reduce((total, finding) => total + severityPenalty(finding.severity), 0);
}

function severityPenalty(severity: ReviewSeverity): number {
  switch (severity) {
    case "critical":
      return 45;
    case "high":
      return 25;
    case "medium":
      return 10;
    case "low":
      return 3;
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function excerpt(content: string, index: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + 160);
  return content.slice(start, end).replace(/\s+/g, " ").trim();
}
