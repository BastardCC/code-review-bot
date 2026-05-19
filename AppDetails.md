Je veux construire un projet appelé **CodeReviewBot**.

## Le projet CodeReviewBot

Un assistant de revue de code automatique qui :

- Surveille les Pull Requests GitHub via webhook
- Analyse le code avec un LLM (OpenRouter)
- Donne un score de qualité (0-100)
- Auto-approuve les PR simples (score > 90 et < 50 lignes)
- Poste des commentaires sur GitHub
- Envoie des alertes Slack pour les PR complexes

## Stack

- Next.js (frontend)
- Convex (base de données temps réel)
- OpenRouter + Vercel AI SDK (LLM)
- n8n (automatisations Slack/email)
- GitHub API (webhook et commentaires)

## Structure de données Convex

prs: {
repo: string,
pr_number: number,
title: string,
author: string,
additions: number,
deletions: number,
status: "pending" | "analyzing" | "analyzed" | "approved" | "needs_review",
quality_score?: number,
suggestions?: array,
auto_approved?: boolean,
created_at: number,
}

## Première étape

Je veux commencer par configurer le webhook GitHub entrant dans Convex.

Etapes:

1. Développeur ouvre PR sur GitHub
   ↓
2. GitHub webhook → Convex (ton backend)
   ↓
3. Convex appelle GitHub API pour lire le code
   ↓
4. Convex analyse avec OpenRouter
   ↓
5. Convex POSTE un commentaire sur GitHub via API
   ↓
6. Convex envoie alerte Slack (si besoin)
   ↓
7. Développeur voit le commentaire sur GitHub
   ↓
8. Admin voit les stats dans ton dashboard Next.js
