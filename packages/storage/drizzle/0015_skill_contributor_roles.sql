UPDATE "skill_contributors"
SET "role" = 'contributor'
WHERE "role" IN ('maintainer', 'reviewer');
