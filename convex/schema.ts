import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  prs: defineTable({
    repo: v.string(),
    pr_number: v.number(),
    title: v.string(),
    author: v.string(),
    additions: v.number(),
    deletions: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("analyzing"),
      v.literal("analyzed"),
      v.literal("approved"),
      v.literal("needs_review"),
    ),
    quality_score: v.optional(v.number()),
    suggestions: v.optional(v.array(v.string())),
    auto_approved: v.optional(v.boolean()),
    created_at: v.number(),
  }).index("by_repo_and_pr", ["repo", "pr_number"]),

  /** GitHub `X-GitHub-Delivery` ids already processed — avoids double-handling retries. */
  webhook_deliveries: defineTable({
    delivery_id: v.string(),
  }).index("by_delivery_id", ["delivery_id"]),
});
