import { Doc } from "@/convex/_generated/dataModel";
import { scoreTone } from "../_lib/status-config";
import { computeDashboardStats } from "../_lib/stats-utils";

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50 ${valueClassName ?? ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="h-[76px] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900"
        />
      ))}
    </div>
  );
}

export function DashboardStats({ prs }: { prs: Doc<"prs">[] | undefined }) {
  if (prs === undefined) {
    return <StatsSkeleton />;
  }

  const stats = computeDashboardStats(prs);

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Total PR" value={stats.total} />
      <StatCard
        label="En cours"
        value={stats.inProgress}
        valueClassName={
          stats.inProgress > 0
            ? "text-blue-600 dark:text-blue-400"
            : undefined
        }
      />
      <StatCard
        label="À relire"
        value={stats.needsReview}
        valueClassName={
          stats.needsReview > 0
            ? "text-amber-600 dark:text-amber-400"
            : undefined
        }
      />
      <StatCard
        label="Score moyen"
        value={stats.averageScore ?? "—"}
        valueClassName={scoreTone(stats.averageScore ?? undefined)}
      />
    </div>
  );
}
