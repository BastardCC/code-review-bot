import { Doc } from "@/convex/_generated/dataModel";
import {
  countByFilter,
  PrFilter,
  prFilterOptions,
} from "../_lib/pr-filter";

export function PrFilterBar({
  prs,
  value,
  onChange,
}: {
  prs: Doc<"prs">[];
  value: PrFilter;
  onChange: (filter: PrFilter) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {prFilterOptions.map((option) => {
        const count = countByFilter(prs, option.value);
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`cursor-pointer inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
          >
            {option.label}
            <span
              className={`tabular-nums text-xs ${
                active
                  ? "text-zinc-300 dark:text-zinc-600"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
