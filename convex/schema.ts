import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  salaries: defineTable({ owner: v.string(), amount: v.number(), date: v.string() }).index("by_owner", ["owner"]),
  ledger: defineTable({
    owner: v.string(),
    sourceKey: v.string(),
    date: v.string(),
    amount: v.number(),
    direction: v.union(v.literal("debit"), v.literal("credit")),
    payee: v.string(),
    kind: v.optional(v.union(v.literal("spent"), v.literal("upcoming"))),
    note: v.optional(v.string()),
  }).index("by_owner_source", ["owner", "sourceKey"])
    .index("by_owner", ["owner"])
    .index("by_owner_date", ["owner", "date"]),
});
