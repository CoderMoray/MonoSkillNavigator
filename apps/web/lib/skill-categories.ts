export const SKILL_CATEGORY_OPTIONS = [
  "Automation",
  "Developer Tools",
  "Documentation",
  "Productivity",
  "Data & Analytics",
  "Security",
  "Design & Creative",
  "Communication",
  "Other"
] as const;

export const MAX_SKILL_CATEGORY_FILTERS = 3;

export function normalizeSkillCategoryFilters(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(0, MAX_SKILL_CATEGORY_FILTERS);
}

export function skillMatchesCategories(skillCategories: string[] | undefined, selectedCategories: string[]): boolean {
  if (selectedCategories.length === 0) {
    return true;
  }

  const normalizedSelected = selectedCategories.map((item) => item.trim().toLowerCase());
  const normalizedSkill = (skillCategories ?? []).map((item) => item.trim().toLowerCase());
  return normalizedSelected.every((item) => normalizedSkill.includes(item));
}
