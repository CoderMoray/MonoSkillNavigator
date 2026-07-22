## Description: <br>
HaluCatch evaluates AI skill execution reliability across data pipeline integrity, code risk, business logic ambiguity, and interpretation guardrails to support audits for trustworthiness and reproducibility. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[codermoray](https://clawhub.ai/user/codermoray) <br>

### License/Terms of Use: <br>
MIT <br>


## Use Case: <br>
Developers and skill maintainers use HaluCatch to audit a local skill directory, generate Markdown reliability reports, and review suggested fixes before deployment or sharing. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The skill recursively reads the user-selected skill folder, so an overly broad target may expose unrelated private files in generated reports. <br>
Mitigation: Run it only against the intended skill folder and avoid using a home directory or unrelated private project as the target. <br>
Risk: The skill writes local Markdown audit reports to its default reports directory or to a user-specified output directory. <br>
Mitigation: Confirm the output location before running and use --output-dir only when the destination is intentional and writable. <br>


## Reference(s): <br>
- [ClawHub Skill Page](https://clawhub.ai/codermoray/skills/halucatch) <br>
- [HaluCatch Repository](https://github.com/CoderMoray/HaluCatch) <br>
- [HaluCatch Documentation and Demo](https://codermoray.github.io/HaluCatch/) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, shell commands, guidance] <br>
**Output Format:** [Markdown reports and concise conversational text] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Generates standard, professional, and action-oriented Markdown audit reports; suggested fixes require user review before application.] <br>

## Skill Version(s): <br>
1.8.8 (source: frontmatter, manifest.json, changelog, ClawHub release metadata) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
