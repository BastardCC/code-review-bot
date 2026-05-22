# CodeReviewBot — Étapes de développement

## Phase 0 — Fondations

1. Définir les variables d’environnement nécessaires (voir `.env.local.example` pour Next.js).
2. Schéma Convex : table `prs` et index dans `convex/schema.ts`.
3. Configurer les **secrets sur le déploiement Convex** (pas dans le dépôt) :
   - `GITHUB_TOKEN`
   - `GITHUB_WEBHOOK_SECRET`
   - `OPENROUTER_API_KEY` (quand tu branches le LLM)
   - `SLACK_WEBHOOK_URL` ou intégration n8n (optionnel)

**Next.js :** copier `.env.local.example` → `.env.local` et renseigner `NEXT_PUBLIC_CONVEX_URL`.

**Convex :** `pnpm exec convex env set NOM_SECRET "valeur"` ou via le dashboard (Settings → Environment Variables).

---

## Phase 1 — Webhook GitHub → Convex

4. Route HTTP Convex (`httpAction`) qui accepte les `POST` du webhook GitHub.
5. Vérifier la signature `X-Hub-Signature-256` avec `GITHUB_WEBHOOK_SECRET`.
6. Filtrer les événements (ex. `pull_request` : `opened`, `synchronize`, `reopened`).
7. Déduplication / idempotence si besoin (éviter double traitement d’une même livraison).

**Ce qui est codé dans le repo :**

- Endpoint `POST …/github/webhook` défini dans `convex/http.ts` (commentaires étapes 4–7).
- Vérification HMAC dans `convex/github/signature.ts`.
- Table `webhook_deliveries` + mutation interne `claimDelivery` pour la dedup (`X-GitHub-Delivery`).

**Configurer sur GitHub :** dépôt → _Settings → Webhooks_ → Payload URL = `<URL du déploiement Convex>/github/webhook` (l’URL exacte s’affiche au lancement de `pnpm exec convex dev` ou dans le dashboard Convex). Méthode **POST**, type **application/json**. Le « secret » du webhook doit être **identique** à `GITHUB_WEBHOOK_SECRET` : `pnpm exec convex env set GITHUB_WEBHOOK_SECRET "ta-chaîne"` (ou via le dashboard Convex).

---

## Phase 2 — Lecture du contexte GitHub

8. Appeler l’API GitHub : détail PR, fichiers modifiés, diff pertinent pour le LLM.
9. Créer ou mettre à jour un document dans `prs` (`status`: `pending` / `analyzing`).

---

## Phase 3 — Analyse LLM

10. Concevoir le prompt et une sortie structurée (score 0–100, suggestions, résumé).
11. Appeler OpenRouter via Vercel AI SDK depuis une **action** Convex (jamais depuis le navigateur seul pour les secrets).
12. Limites : tronquer les gros diffs, exclure certains fichiers générés, timeouts et retries.

---

## Phase 4 — Retour vers GitHub

13. Poster un commentaire sur la PR via l’API GitHub.
14. Mettre à jour Convex : `quality_score`, `suggestions`, `status: "analyzed"`.

---

## Phase 5 — Auto-approbation (à calibrer)

15. Règles métier précises (ex. score > 90 et léger diff — clarifier « lignes » : additions uniquement ou total).
16. Actions GitHub (review approuvée / merge) en respect des **branch protection rules**.
17. Tracer dans Convex avec `auto_approved: true` pour audit.

---

## Phase 6 — Slack / n8n

18. Définir ce qu’est une PR « complexe » (score bas, gros diff, chemins sensibles).
19. Alerter Slack (webhook ou app) ou déléguer à **n8n** avec un POST depuis Convex.

---

## Phase 7 — Dashboard Next.js

20. Lister les PR et filtrer par `status` depuis Convex.
21. Protéger l’interface admin (auth selon ton choix).

---

## Phase 8 — Durcissement

22. Logs et gestion des erreurs (GitHub, LLM).
23. Limitation du débit sur l’endpoint HTTP si exposition publique.
24. Tests manuels avec un repo de démo et relecture des payloads webhook.

---

## Flux cible (rappel)

1. Ouverture / mise à jour d’une PR sur GitHub
2. GitHub envoie le webhook → Convex
3. Convex lit le code via l’API GitHub
4. Convex analyse avec OpenRouter
5. Convex poste un commentaire sur la PR
6. Alerte Slack si besoin
7. Le développeur voit le commentaire sur GitHub
8. L’admin consulte les stats dans le dashboard Next.js
