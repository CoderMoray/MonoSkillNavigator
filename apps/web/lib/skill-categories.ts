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

export const ALL_SKILL_CATEGORIES_LABEL = "All categories";

export function skillMatchesCategory(categories: string[] | undefined, category: string): boolean {
  if (!category || category === ALL_SKILL_CATEGORIES_LABEL) {
    return true;
  }

  const normalized = category.trim().toLowerCase();
  return (categories ?? []).some((item) => item.trim().toLowerCase() === normalized);
}
