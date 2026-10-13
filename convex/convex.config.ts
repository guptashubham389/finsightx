import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";
const app = defineApp();
// Keep Gmail OAuth and private ledger routes at their existing addresses.
app.use(staticHosting);
export default app;
