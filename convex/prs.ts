import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

type GithubPullPayload = {
  title?: string;
  user?: { login?: string };
  additions?: number;
  deletions?: number;
  created_at?: string;
};

export const getPrs = query({
  handler: async (ctx) => {
    return await ctx.db.query("prs").collect();
  },
});

function splitRepo(fullName: string): { owner: string; repo: string } | null {
  const i = fullName.indexOf("/");
  if (i <= 0 || i === fullName.length - 1) return null;
  return {
    owner: fullName.slice(0, i),
    repo: fullName.slice(i + 1),
  };
}

export const upsertFromGithub = internalMutation({
  args: {
    repo: v.string(),
    pr_number: v.number(),
    title: v.string(),
    author: v.string(),
    additions: v.number(),
    deletions: v.number(),
    created_at: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("prs")
      .withIndex("by_repo_and_pr", (q) =>
        q.eq("repo", args.repo).eq("pr_number", args.pr_number),
      )
      .first();

    const row = {
      repo: args.repo,
      pr_number: args.pr_number,
      title: args.title,
      author: args.author,
      additions: args.additions,
      deletions: args.deletions,
      status: "pending" as const,
      created_at: args.created_at,
    };

    if (existing) {
      await ctx.db.patch("prs", existing._id, {
        title: row.title,
        author: row.author,
        additions: row.additions,
        deletions: row.deletions,
      });
      return existing._id;
    }

    return await ctx.db.insert("prs", row);
  },
});

const prStatusLl = v.union(v.literal("analyzed"), v.literal("needs_review"));

export const markPrAnalyzing = internalMutation({
  args: {
    repo: v.string(),
    pr_number: v.number(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("prs")
      .withIndex("by_repo_and_pr", (q) =>
        q.eq("repo", args.repo).eq("pr_number", args.pr_number),
      )
      .first();
    if (!doc) throw new Error(`prs row not found: ${args.repo}#${args.pr_number}`);
    await ctx.db.patch("prs", doc._id, { status: "analyzing" });
  },
});

export const applyLlmReview = internalMutation({
  args: {
    repo: v.string(),
    pr_number: v.number(),
    quality_score: v.number(),
    suggestions: v.array(v.string()),
    status: prStatusLl,
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("prs")
      .withIndex("by_repo_and_pr", (q) =>
        q.eq("repo", args.repo).eq("pr_number", args.pr_number),
      )
      .first();
    if (!doc) throw new Error(`prs row not found: ${args.repo}#${args.pr_number}`);
    await ctx.db.patch("prs", doc._id, {
      quality_score: args.quality_score,
      suggestions: args.suggestions,
      status: args.status,
    });
  },
});

/** Fetches the PR from GitHub REST and writes/updates `prs`. */
export const fetchAndUpsertFromGithub = internalAction({
  args: {
    repo_full_name: v.string(),
    pr_number: v.number(),
  },
  handler: async (ctx, args) => {
    const token = process.env.GITHUB_TOKEN ?? "";
    if (!token) {
      throw new Error("GITHUB_TOKEN is not set");
    }

    const parts = splitRepo(args.repo_full_name);
    if (!parts) {
      throw new Error(`Invalid repo full_name: ${args.repo_full_name}`);
    }

    const url = `https://api.github.com/repos/${parts.owner}/${parts.repo}/pulls/${args.pr_number}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 500)}`);
    }

    const pr = (await res.json()) as GithubPullPayload;
    const title = pr.title ?? "(no title)";
    const author = pr.user?.login ?? "unknown";
    const additions = typeof pr.additions === "number" ? pr.additions : 0;
    const deletions = typeof pr.deletions === "number" ? pr.deletions : 0;
    const created_at = pr.created_at
      ? Date.parse(pr.created_at)
      : Date.now();

    const id: string = await ctx.runMutation(internal.prs.upsertFromGithub, {
      repo: args.repo_full_name,
      pr_number: args.pr_number,
      title,
      author,
      additions,
      deletions,
      created_at,
    });

    return { pr_id: id };
  },
});
