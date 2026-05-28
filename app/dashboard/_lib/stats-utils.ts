import { Doc } from "@/convex/_generated/dataModel";

export type DashboardStats = {
  total: number;
  inProgress: number;
  needsReview: number;
  averageScore: number | null;
};

export function computeDashboardStats(prs: Doc<"prs">[]): DashboardStats {
  const inProgress = prs.filter(
    (pr) => pr.status === "pending" || pr.status === "analyzing",
  ).length;
  const needsReview = prs.filter((pr) => pr.status === "needs_review").length;

  const scored = prs
    .map((pr) => pr.quality_score)
    .filter((score): score is number => score !== undefined);

  const averageScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length)
      : null;

  return {
    total: prs.length,
    inProgress,
    needsReview,
    averageScore,
  };
}
