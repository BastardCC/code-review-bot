import { Doc } from "@/convex/_generated/dataModel";

export type PrFilter = "all" | "conformes" | "needs_review";

export const prFilterOptions: {
  value: PrFilter;
  label: string;
}[] = [
  { value: "all", label: "Tout" },
  { value: "conformes", label: "Conformes" },
  { value: "needs_review", label: "À relire" },
];

export function filterPrs(
  prs: Doc<"prs">[],
  filter: PrFilter,
): Doc<"prs">[] {
  switch (filter) {
    case "all":
      return prs;
    case "conformes":
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
