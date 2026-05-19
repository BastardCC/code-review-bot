import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Réserve cet id de livraison GitHub une seule fois (idempotence / étape 7).
 * Les retries GitHub réutiliseront le même `X-GitHub-Delivery`.
 */
export const claimDelivery = internalMutation({
  args: { deliveryId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhook_deliveries")
      .withIndex("by_delivery_id", (q) =>
        q.eq("delivery_id", args.deliveryId),
      )
      .first();

    if (existing) return { claimed: false as const };

    await ctx.db.insert("webhook_deliveries", {
      delivery_id: args.deliveryId,
    });

    return { claimed: true as const };
  },
});
