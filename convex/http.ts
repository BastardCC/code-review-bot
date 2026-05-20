import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { verifyGitHubWebhookSignature } from "./github/signature";

const LOG = "[github/webhook]";

function logWebhook(message: string, data?: Record<string, unknown>) {
  if (data === undefined) console.log(LOG, message);
  else console.log(LOG, message, JSON.stringify(data));
}

const githubWebhookSecret = () => process.env.GITHUB_WEBHOOK_SECRET ?? "";

/** PR actions handled from phase 2 onward; for now we only filter events (phase 6). */
const PULL_REQUEST_ACTIONS = new Set([
  "opened",
  "synchronize",
  "reopened",
]);

const http = httpRouter();

/**
 * Phase 4 — GitHub hits this endpoint when the repo webhook is configured.
 * Full URL: `<your Convex deployment URL>/github/webhook`
 * (see Convex dashboard or `pnpm exec convex dev` output.)
 */
http.route({
  path: "/github/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = githubWebhookSecret();
    if (!secret) {
      logWebhook("error: GITHUB_WEBHOOK_SECRET is not set on the Convex deployment");
      return new Response(JSON.stringify({ error: "GITHUB_WEBHOOK_SECRET is not set" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Raw body must match GitHub's byte-for-byte for HMAC verification.
    const payload = await request.arrayBuffer();

    // Phase 5 — Security: reject unsigned POST requests.
    const sig = request.headers.get("X-Hub-Signature-256");
    const valid = await verifyGitHubWebhookSignature(payload, sig, secret);
    if (!valid) {
      logWebhook("reject: invalid HMAC signature or missing header");
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = request.headers.get("X-GitHub-Event") ?? "";
    const deliveryId = request.headers.get("X-GitHub-Delivery");
    if (!deliveryId) {
      logWebhook("error: missing X-GitHub-Delivery", { event });
      return new Response(JSON.stringify({ error: "missing X-GitHub-Delivery" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    logWebhook("delivery verified (signature OK)", {
      event,
      deliveryId,
      payloadBytes: payload.byteLength,
    });

    let json: unknown;
    try {
      const text = new TextDecoder().decode(payload);
      json = JSON.parse(text) as unknown;
    } catch {
      logWebhook("error: invalid JSON body", { deliveryId, event });
      return new Response(JSON.stringify({ error: "invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Ping sent when creating the webhook: GitHub checks the endpoint URL.
    if (event === "ping") {
      logWebhook("result: ping OK (webhook configured)", { deliveryId });
      return new Response(JSON.stringify({ ok: true, event: "ping" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Phase 6 — Only react to PR events relevant to the bot pipeline.
    if (event !== "pull_request") {
      const body = { ok: true, skipped: true, reason: `event '${event}' ignored` };
      logWebhook("result: ignored (not pull_request)", { deliveryId, ...body });
      return jsonResponseAccepted(body);
    }

    if (!isPullRequestPayload(json)) {
      const body = { ok: true, skipped: true, reason: "pull_request payload malformed" };
      logWebhook("result: ignored (malformed PR payload)", { deliveryId, ...body });
      return jsonResponseAccepted(body);
    }

    const action = json.action;
    if (!PULL_REQUEST_ACTIONS.has(action)) {
      const body = {
        ok: true,
        skipped: true,
        reason: `pull_request action '${action}' ignored`,
      };
      logWebhook("result: ignored (PR action not in allowlist)", {
        deliveryId,
        action,
        repo: json.repository.full_name,
        pr: json.pull_request.number,
      });
      return jsonResponseAccepted(body);
    }

    // Phase 7 — Dedupe before any heavy work (phase 2).
    const claimResult = await ctx.runMutation(
      internal.webhookDeliveries.claimDelivery,
      { deliveryId },
    );

    if (!claimResult.claimed) {
      const body = {
        ok: true,
        duplicate: true,
        deliveryId,
      };
      logWebhook("result: duplicate delivery (dedup)", body);
      return jsonResponseAccepted(body);
    }

    /**
     * Phase 2 will load the PR from the GitHub API and upsert into `prs`.
     * For now we only acknowledge valid, actionable deliveries.
     */
    const accepted = {
      ok: true as const,
      event,
      deliveryId,
      prAction: action,
      repo: json.repository.full_name,
      number: json.pull_request.number,
      message:
        "Accepted. Next: fetch files via GitHub API and upsert into the `prs` table.",
    };
    logWebhook("result: PR ready for pipeline (phase 2 next)", {
      repo: accepted.repo,
      pr: accepted.number,
      action: accepted.prAction,
      deliveryId: accepted.deliveryId,
    });
    return jsonResponseAccepted(accepted);
  }),
});

function jsonResponseAccepted(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
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
