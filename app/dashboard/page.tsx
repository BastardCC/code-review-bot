"use client";

import { useMemo, useState } from "react";
import { DashboardHeader } from "./_components/DashboardHeader";
import { DashboardStats } from "./_components/DashboardStats";
import { PrCard } from "./_components/PrCard";
import { PrFilterBar } from "./_components/PrFilterBar";
import { PrListEmpty } from "./_components/PrListEmpty";
import { PrListSkeleton } from "./_components/PrListSkeleton";
import { filterPrs, PrFilter } from "./_lib/pr-filter";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";

const filteredEmptyMessages: Record<
  Exclude<PrFilter, "all">,
  { title: string; description: string }
> = {
  passed: {
    title: "No passed pull requests",
    description: "Pull requests analyzed without blocking issues will appear here.",
  },
  needs_review: {
    title: "No pull requests need review",
    description: "Pull requests requiring manual review will appear here.",
  },
};

const DashboardPage = () => {
  const prs = useQuery(api.prs.getPrs);
  const [filter, setFilter] = useState<PrFilter>("all");

  const filteredPrs = useMemo(
    () => (prs ? filterPrs(prs, filter) : undefined),
    [prs, filter],
  );

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <DashboardHeader />
      <DashboardStats prs={prs} />

      {prs === undefined && <PrListSkeleton />}

      {prs?.length === 0 && <PrListEmpty />}

      {prs && prs.length > 0 && (
        <>
          <PrFilterBar prs={prs} value={filter} onChange={setFilter} />

          {filteredPrs!.length === 0 ? (
            filter !== "all" ? (
              <PrListEmpty {...filteredEmptyMessages[filter]} />
            ) : (
              <PrListEmpty />
            )
          ) : (
            <div className="flex flex-col gap-4">
              {filteredPrs!.map((pr) => (
                <PrCard key={pr._id} pr={pr} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
};

export default DashboardPage;
