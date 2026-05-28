import { Doc } from "@/convex/_generated/dataModel";

export type PrStatus = Doc<"prs">["status"];

export const statusConfig: Record<
  PrStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "En attente",
    className:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
  analyzing: {
    label: "Analyse…",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  analyzed: {
    label: "Analysée",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  approved: {
    label: "Approuvée",
    className:
      "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  needs_review: {
    label: "À relire",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
};

export function scoreTone(score: number | undefined) {
  if (score === undefined) return "text-zinc-400";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
