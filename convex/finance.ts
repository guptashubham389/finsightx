import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
const row = v.object({ date: v.string(), amount: v.number(), direction: v.union(v.literal("debit"), v.literal("credit")), payee: v.string(), sourceKey: v.string(), kind: v.optional(v.union(v.literal("spent"), v.literal("upcoming"))), note: v.optional(v.string()) });
export const read = internalQuery({
  args: { owner: v.string(), since: v.string() },
  returns: v.object({ salary: v.union(v.null(), v.object({ amount: v.number(), date: v.string() })), rows: v.array(row), more: v.boolean() }),
  handler: async (ctx, { owner, since }) => {
    const salary = await ctx.db.query("salaries").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    const rows = await ctx.db.query("ledger").withIndex("by_owner_date", q => q.eq("owner", owner).gte("date", since)).order("desc").take(2001);
    return { salary: salary ? { amount: salary.amount, date: salary.date } : null, rows: rows.slice(0, 2000).map(({ date, amount, direction, payee, sourceKey, kind, note }) => ({ date, amount, direction, payee, sourceKey, ...(kind ? {kind} : {}), ...(note ? {note} : {}) })), more: rows.length > 2000 };
  },
});
export const salary = internalMutation({
  args: { owner: v.string(), amount: v.number(), date: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!(args.amount > 0) || !Number.isFinite(args.amount) || !validDate(args.date)) throw Error("Invalid salary");
    const existing = await ctx.db.query("salaries").withIndex("by_owner", q => q.eq("owner", args.owner)).unique();
    if (existing) await ctx.db.patch(existing._id, { amount: args.amount, date: args.date });
    else await ctx.db.insert("salaries", args);
    return null;
  },
});
export function validDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date; }
export const transaction = internalMutation({
  args: { owner: v.string(), date: v.string(), amount: v.number(), payee: v.string(), kind: v.union(v.literal("spent"), v.literal("upcoming")), note: v.string(), sourceKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!validDate(args.date) || !(args.amount > 0) || !Number.isFinite(args.amount) || !args.payee.trim()) throw Error("Invalid transaction");
    const sameDay = await ctx.db.query("ledger").withIndex("by_owner_date", q => q.eq("owner", args.owner).eq("date", args.date)).take(2001);
    if (sameDay.length > 2000) throw Error("Too many transactions on this date");
    if (sameDay.some(r => r.sourceKey === args.sourceKey || (r.direction === "debit" && r.amount === args.amount && r.payee.trim().toLowerCase() === args.payee.trim().toLowerCase()))) return false;
    await ctx.db.insert("ledger", { ...args, payee: args.payee.trim(), direction: "debit" });
    return true;
  },
});
