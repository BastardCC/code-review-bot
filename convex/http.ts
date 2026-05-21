import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { verifyGitHubWebhookSignature } from "./github/signature";

const PR_ACTIONS = new Set(["opened", "synchronize", "reopened"]);

const http = httpRouter();

http.route({
  path: "/github/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
    if (!secret) return json({ error: "GITHUB_WEBHOOK_SECRET is not set" }, 500);

    const payload = await request.arrayBuffer();
    const sigHeader = request.headers.get("X-Hub-Signature-256");
    if (!(await verifyGitHubWebhookSignature(payload, sigHeader, secret))) {
      return json({ error: "invalid signature" }, 401);
    }

    const event = request.headers.get("X-GitHub-Event") ?? "";
    const deliveryId = request.headers.get("X-GitHub-Delivery");
    if (!deliveryId) return json({ error: "missing X-GitHub-Delivery" }, 400);

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(payload));
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }

    if (event === "ping") return json({ ok: true, event: "ping" });

    if (event !== "pull_request" || !isPullRequestPayload(parsed)) {
      return json({ ok: true, skipped: true });
    }

    if (!PR_ACTIONS.has(parsed.action)) {
      return json({ ok: true, skipped: true });
    }
    
    try {
      await ctx.runAction(internal.prs.fetchAndUpsertFromGithub, {
        repo_full_name: parsed.repository.full_name,
        pr_number: parsed.pull_request.number,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return json({ error: "ingest_failed", detail }, 502);
    }

    const claimed = await ctx.runMutation(internal.webhookDeliveries.claimDelivery, {
      deliveryId,
    });
    if (!claimed.claimed) return json({ ok: true, duplicate: true });

    return json({
      ok: true,
      repo: parsed.repository.full_name,
      number: parsed.pull_request.number,
      action: parsed.action,
    });
  }),
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isPullRequestPayload(
  payload: unknown,
): payload is {
  action: string;
  pull_request: { number: number };
  repository: { full_name: string };
} {
  if (payload === null || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  const repository = o.repository;
  const pr = o.pull_request;
  const repoOk =
    typeof repository === "object" &&
    repository !== null &&
    typeof (repository as { full_name?: unknown }).full_name === "string";
  const prNum =
    typeof pr === "object" &&
    pr !== null &&
    typeof (pr as { number?: unknown }).number === "number";
  return typeof o.action === "string" && repoOk && prNum;
}

export default http;
