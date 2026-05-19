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

/** Actions PR qu’on traitera à partir de la phase 2 ; pour l’instant on filtre uniquement (étape 6). */
const PULL_REQUEST_ACTIONS = new Set([
  "opened",
  "synchronize",
  "reopened",
]);

const http = httpRouter();

/**
 * Étape 4 — Endpoint appelé par GitHub lorsqu’un webhook est configuré sur le dépôt.
 * URL complète : `<URL de ton déploiement Convex>/github/webhook`
 * (visible dans le dashboard Convex ou après `pnpm exec convex dev`).
 */
http.route({
  path: "/github/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = githubWebhookSecret();
    if (!secret) {
      logWebhook("erreur: GITHUB_WEBHOOK_SECRET manquant sur le déploiement Convex");
      return new Response(JSON.stringify({ error: "GITHUB_WEBHOOK_SECRET manquant" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Corps brut indispensable pour reproduire le même HMAC que GitHub.
    const payload = await request.arrayBuffer();

    // Étape 5 — Sécurité : rejeter tout POST non signé.
    const sig = request.headers.get("X-Hub-Signature-256");
    const valid = await verifyGitHubWebhookSignature(payload, sig, secret);
    if (!valid) {
      logWebhook("refus: signature HMAC invalide ou en-tête absent");
      return new Response(JSON.stringify({ error: "signature invalide" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = request.headers.get("X-GitHub-Event") ?? "";
    const deliveryId = request.headers.get("X-GitHub-Delivery");
    if (!deliveryId) {
      logWebhook("erreur: X-GitHub-Delivery manquant", { event });
      return new Response(JSON.stringify({ error: "X-GitHub-Delivery manquant" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    logWebhook("livraison acceptée (signature OK)", {
      event,
      deliveryId,
      payloadOctets: payload.byteLength,
    });

    let json: unknown;
    try {
      const text = new TextDecoder().decode(payload);
      json = JSON.parse(text) as unknown;
    } catch {
      logWebhook("erreur: corps JSON invalide", { deliveryId, event });
      return new Response(JSON.stringify({ error: "JSON invalide" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Ping lors de la création du webhook : GitHub vérifie l’URL.
    if (event === "ping") {
      logWebhook("résultat: ping OK (webhook configuré)", { deliveryId });
      return new Response(JSON.stringify({ ok: true, event: "ping" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Étape 6 — Ne réagir qu’aux PR pertinentes pour la suite du bot.
    if (event !== "pull_request") {
      const body = { ok: true, skipped: true, reason: `event '${event}' ignoré` };
      logWebhook("résultat: ignoré (pas pull_request)", { deliveryId, ...body });
      return jsonResponseAccepted(body);
    }

    if (!isPullRequestPayload(json)) {
      const body = { ok: true, skipped: true, reason: "payload PR illisible" };
      logWebhook("résultat: ignoré (payload PR mal formé)", { deliveryId, ...body });
      return jsonResponseAccepted(body);
    }

    const action = json.action;
    if (!PULL_REQUEST_ACTIONS.has(action)) {
      const body = {
        ok: true,
        skipped: true,
        reason: `action PR '${action}' ignorée`,
      };
      logWebhook("résultat: ignoré (action PR hors liste)", {
        deliveryId,
        action,
        repo: json.repository.full_name,
        pr: json.pull_request.number,
      });
      return jsonResponseAccepted(body);
    }

    // Étape 7 — Dedup avant tout travail lourd en phase 2.
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
      logWebhook("résultat: livraison déjà traitée (dedup)", body);
      return jsonResponseAccepted(body);
    }

    /**
     * Ici commence la suite (phase 2) : lire la PR via l’API GitHub et upsert dans `prs`.
     * Pour l’instant on confirme seulement que la livraison est valide et intéressante.
     */
    const accepted = {
      ok: true as const,
      event,
      deliveryId,
      prAction: action,
      repo: json.repository.full_name,
      number: json.pull_request.number,
      message:
        "Reçu avec succès. Prochaine étape : charger les fichiers depuis GitHub et écrire dans la table `prs`.",
    };
    logWebhook("résultat: PR à traiter (phase 2 à venir)", {
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
