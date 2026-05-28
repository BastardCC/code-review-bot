"use client";

import { DashboardHeader } from "./_components/DashboardHeader";
import { PrCard } from "./_components/PrCard";
import { PrListEmpty } from "./_components/PrListEmpty";
import { PrListSkeleton } from "./_components/PrListSkeleton";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";

const DashboardPage = () => {
  const prs = useQuery(api.prs.getPrs);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <DashboardHeader />

      {prs === undefined && <PrListSkeleton />}

      {prs?.length === 0 && <PrListEmpty />}

      {prs && prs.length > 0 && (
        <div className="flex flex-col gap-4">
          {prs.map((pr) => (
            <PrCard key={pr._id} pr={pr} />
          ))}
        </div>
      )}
    </main>
  );
};

export default DashboardPage;
