import { Doc } from "@/convex/_generated/dataModel";

export type PrFilter = "all" | "passed" | "needs_review";

export const prFilterOptions: {
  value: PrFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "passed", label: "Passed" },
  { value: "needs_review", label: "Needs review" },
];

export function filterPrs(
  prs: Doc<"prs">[],
  filter: PrFilter,
): Doc<"prs">[] {
  switch (filter) {
    case "all":
      return prs;
    case "passed":
      return prs.filter(
        (pr) => pr.status === "analyzed" || pr.status === "approved",
      );
    case "needs_review":
      return prs.filter((pr) => pr.status === "needs_review");
  }
}

export function countByFilter(prs: Doc<"prs">[], filter: PrFilter): number {
  return filterPrs(prs, filter).length;
}
