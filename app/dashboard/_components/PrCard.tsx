import { Doc } from "@/convex/_generated/dataModel";
import { scoreTone } from "./status-config";
import { StatusBadge } from "./StatusBadge";

export function PrCard({ pr }: { pr: Doc<"prs"> }) {
  const githubUrl = `https://github.com/${pr.repo}/pull/${pr.pr_number}`;

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={pr.status} />
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {pr.repo}#{pr.pr_number}
            </span>
          </div>
          <h2 className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            {pr.title}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            par{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {pr.author}
            </span>
            {" · "}
            {new Date(pr.created_at).toLocaleString("fr-FR")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end">
          <div className="text-right">
            <p
              className={`text-3xl font-bold tabular-nums ${scoreTone(pr.quality_score)}`}
            >
              {pr.quality_score ?? "—"}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Score</p>
          </div>
          <div className="flex gap-2 font-mono text-sm">
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              +{pr.additions}
            </span>
            <span className="rounded-md bg-red-50 px-2 py-1 text-red-700 dark:bg-red-950/50 dark:text-red-400">
              −{pr.deletions}
            </span>
          </div>
        </div>
      </div>

      {pr.suggestions && pr.suggestions.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Suggestions
          </p>
          <ul className="space-y-1.5">
            {pr.suggestions.map((suggestion, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-zinc-400" />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex justify-end border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Voir sur GitHub
          <span aria-hidden>↗</span>
        </a>
      </div>
    </article>
  );
}
