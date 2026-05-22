import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { z } from "zod";

const GITHUB_HEADERS = (
  token: string,
): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

/** Max aggregated diff text fed to the model (characters). */
const MAX_DIFF_CHARS = 72_000;
/** Max chars per-file patch excerpt. */
const MAX_PATCH_PER_FILE = 14_000;
/** Max numbered suggestions stored on `prs`. */
const MAX_SUGGESTIONS = 12;
/** Rough cap on pagination (pages × per_page). */
const MAX_FILE_PAGES = 5;

function splitRepoFullName(fullName: string): { owner: string; repo: string } | null {
  const i = fullName.indexOf("/");
  if (i <= 0 || i === fullName.length - 1) return null;
  return { owner: fullName.slice(0, i), repo: fullName.slice(i + 1) };
}

type GithubPullFileItem = {
  filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string | null;
};

function parseNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function fetchPullRequestFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
): Promise<GithubPullFileItem[]> {
  const out: GithubPullFileItem[] = [];
  let url: string | null =
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`;

  for (let page = 0; page < MAX_FILE_PAGES && url; page++) {
    const res = await fetch(url, { headers: GITHUB_HEADERS(token) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub files API ${res.status}: ${text.slice(0, 400)}`);
    }
    const batch = (await res.json()) as unknown;
    if (!Array.isArray(batch)) {
      throw new Error("GitHub files API returned non-array JSON");
    }
    out.push(...(batch as GithubPullFileItem[]));
    url = parseNextUrl(res.headers.get("link"));
  }

  return out;
}

/** Build truncated diff summary for the LLM. */
function buildDiffSummaryForPrompt(
  repoFullName: string,
  prNumber: number,
  files: GithubPullFileItem[],
): string {
  const chunks: string[] = [
    `Repository: ${repoFullName}`,
    `Pull request: #${prNumber}`,
    `Changed files: ${files.length}`,
    "---",
  ];

  let total = chunks.join("\n").length;
  for (const f of files) {
    const name = typeof f.filename === "string" ? f.filename : "(unknown)";
    const st = typeof f.status === "string" ? f.status : "?";
    const add = typeof f.additions === "number" ? f.additions : 0;
    const del = typeof f.deletions === "number" ? f.deletions : 0;
    let patchPart =
      typeof f.patch === "string" && f.patch.length > 0
        ? f.patch.slice(0, MAX_PATCH_PER_FILE)
        : "(no unified diff — large/binary or omitted)";
    if (patchPart.length === MAX_PATCH_PER_FILE) patchPart += "\n… (truncated)";

    let block =
      `\n### ${name}\nstatus: ${st}  +${add} -${del}\n\`\`\`diff\n${patchPart}\n\`\`\`\n`;

    if (total + block.length > MAX_DIFF_CHARS) {
      chunks.push("\n---\n(rest of diff omitted for size limit)");
      break;
    }
    chunks.push(block);
    total += block.length;
  }

  return chunks.join("\n");
}

async function postGithubIssueComment(params: {
  owner: string;
  repo: string;
  /** PR number doubles as Issue number on GitHub. */
  issueNumber: number;
  body: string;
  token: string;
}): Promise<void> {
  const url = `https://api.github.com/repos/${params.owner}/${params.repo}/issues/${params.issueNumber}/comments`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...GITHUB_HEADERS(params.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: params.body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue comment API ${res.status}: ${text.slice(0, 400)}`);
  }
}

/** Markdown body visible on the PR conversation tab. */
function buildReviewCommentMarkdown(inputs: {
  repoFullName: string;
  prNumber: number;
  quality_score: number;
  suggestions: string[];
  status: "analyzed" | "needs_review";
  degraded: boolean;
}): string {
  const lines: string[] = [
    "### CodeReviewBot",
    "",
    `**Repository:** ${inputs.repoFullName} · **PR** #${inputs.prNumber}`,
    "",
    `- **Quality score:** ${inputs.quality_score}/100`,
    `- **Status:** \`${inputs.status}\``,
    "",
  ];

  if (inputs.degraded) {
    lines.push("_The model output could not be validated; storing a degraded review entry._", "");
  }

  lines.push("**Suggestions:**", "");

  if (inputs.suggestions.length === 0) {
    lines.push("_None._");
  } else {
    for (const s of inputs.suggestions) {
      lines.push(`- ${s}`);
    }
  }

  lines.push("", "---", "_Automated comment from CodeReviewBot._");
  return lines.join("\n");
}

const llmReviewSchema = z.object({
  quality_score: z.number().min(0).max(100),
  suggestions: z.array(z.string().max(500)).max(MAX_SUGGESTIONS),
  status: z.enum(["analyzed", "needs_review"]),
});

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1).trim();
  return t;
}

const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";

async function callOpenRouterStructuredReview(
  diffSummary: string,
  repoFullName: string,
  prNumber: number,
): Promise<{ quality_score: number; suggestions: string[]; status: "analyzed" | "needs_review" }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set on Convex deployment");

  const system = [
    "You are a senior code reviewer. Respond with a single JSON object only, no markdown, no prose outside JSON.",
    "Schema:",
    '{"quality_score": number 0-100, "suggestions": string[], "status": "analyzed"|"needs_review"}',
    "Use status \"needs_review\" if there are blocking issues or high risk changes; \"analyzed\" if the changes look safe and reasonably clean.",
    `At most ${MAX_SUGGESTIONS} short actionable suggestions.`,
  ].join(" ");

  const user = [
    `Review this pull request for ${repoFullName}#${prNumber}.`,
    "Diff excerpts follow.",
    "---",
    diffSummary,
    "---",
    "Answer with JSON only.",
  ].join("\n");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENROUTER_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 1_024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter API ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenRouter response missing assistant content");
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error("Failed to JSON-parse model output");
  }

  const parsed = llmReviewSchema.safeParse(parsedUnknown);
  if (!parsed.success) throw new Error(`Model JSON invalid: ${parsed.error.message}`);

  return {
    quality_score: Math.round(parsed.data.quality_score),
    suggestions: parsed.data.suggestions,
    status: parsed.data.status,
  };
}

async function runReviewOnceOrRetry(
  diffSummary: string,
  repoFullName: string,
  prNumber: number,
): Promise<{
  quality_score: number;
  suggestions: string[];
  status: "analyzed" | "needs_review";
} | null> {
  try {
    return await callOpenRouterStructuredReview(
      diffSummary,
      repoFullName,
      prNumber,
    );
  } catch (firstErr) {
    const errMsg =
      firstErr instanceof Error ? firstErr.message : String(firstErr);
    const clipped = errMsg.slice(0, 280);
    try {
      return await callOpenRouterStructuredReview(
        `${diffSummary}\n\n---\nIMPORTANT: Previous reply failed validation. Output only one JSON object: {"quality_score":0-100,"suggestions":["..."],"status":"analyzed"|"needs_review"}. Error hint: ${clipped}`,
        repoFullName,
        prNumber,
      );
    } catch {
      return null;
    }
  }
}

/**
 * Loads PR diff files from GitHub, runs OpenRouter review, patches `prs`.
 */
export const analyzePr = internalAction({
  args: {
    repo_full_name: v.string(),
    pr_number: v.number(),
  },
  handler: async (ctx, args) => {
    const githubToken = process.env.GITHUB_TOKEN ?? "";
    if (!githubToken) throw new Error("GITHUB_TOKEN is not set");

    const parts = splitRepoFullName(args.repo_full_name);
    if (!parts) throw new Error(`Invalid repo_full_name: ${args.repo_full_name}`);

    await ctx.runMutation(internal.prs.markPrAnalyzing, {
      repo: args.repo_full_name,
      pr_number: args.pr_number,
    });

    const files = await fetchPullRequestFiles(
      parts.owner,
      parts.repo,
      args.pr_number,
      githubToken,
    );

    const diffSummary = buildDiffSummaryForPrompt(
      args.repo_full_name,
      args.pr_number,
      files,
    );

    const modelResultOrNull = await runReviewOnceOrRetry(
      diffSummary,
      args.repo_full_name,
      args.pr_number,
    );

    let quality_score: number;
    let suggestions: string[];
    let status: "analyzed" | "needs_review";
    let degraded: boolean;

    if (modelResultOrNull === null) {
      degraded = true;
      quality_score = 0;
      suggestions = [
        "Automated LLM review failed after retry (invalid output or API error).",
      ];
      status = "needs_review";
    } else {
      degraded = false;
      quality_score = modelResultOrNull.quality_score;
      suggestions = modelResultOrNull.suggestions;
      status = modelResultOrNull.status;
    }

    await ctx.runMutation(internal.prs.applyLlmReview, {
      repo: args.repo_full_name,
      pr_number: args.pr_number,
      quality_score,
      suggestions,
      status,
    });

    const commentMarkdown = buildReviewCommentMarkdown({
      repoFullName: args.repo_full_name,
      prNumber: args.pr_number,
      quality_score,
      suggestions,
      status,
      degraded,
    });

    try {
      await postGithubIssueComment({
        owner: parts.owner,
        repo: parts.repo,
        issueNumber: args.pr_number,
        body: commentMarkdown,
        token: githubToken,
      });
    } catch (commentErr) {
      console.error(
        "[analyzePr] GitHub PR comment failed:",
        commentErr instanceof Error ? commentErr.message : String(commentErr),
      );
    }

    return degraded ? ({ ok: false as const, degraded: true }) : ({ ok: true as const });
  },
});
