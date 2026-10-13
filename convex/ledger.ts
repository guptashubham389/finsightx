import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Internal functions only: the HTTP routes validate the signed session first.
export const save = internalMutation({
  args: { owner: v.string(), rows: v.array(v.object({
    sourceKey: v.string(), date: v.string(), amount: v.number(),
    direction: v.union(v.literal("debit"), v.literal("credit")), payee: v.string(),
  })) },
  handler: async (ctx, { owner, rows }) => {
    let inserted = 0;
    for (const row of rows) {
      const existing = await ctx.db.query("ledger")
        .withIndex("by_owner_source", q => q.eq("owner", owner).eq("sourceKey", row.sourceKey)).unique();
      if (!existing) { await ctx.db.insert("ledger", { owner, ...row }); inserted++; }
    }
    return inserted;
  },
});

export const read = internalQuery({
  args: { owner: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: (ctx, { owner, cursor }) => ctx.db.query("ledger")
    .withIndex("by_owner", q => q.eq("owner", owner))
    .paginate({ cursor, numItems: 100 }),
});
