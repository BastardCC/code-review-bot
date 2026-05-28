"use client";

import { api } from '@/convex/_generated/api';
import { useQuery } from 'convex/react';

const DashboardPage = () => {

    const prs = useQuery(api.prs.getPrs);
  return (
    <div>
        <h1>List of PR</h1>
        <ul>
            {prs?.map((pr) => (
                <li key={pr._id}>{pr.title}</li>
            ))}
        </ul>
    </div>
  )
}

export default DashboardPage