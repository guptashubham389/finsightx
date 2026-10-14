/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as finance from "../finance.js";
import type * as gmailAuth from "../gmailAuth.js";
import type * as gmailClient from "../gmailClient.js";
import type * as gmailPage from "../gmailPage.js";
import type * as gmailParser from "../gmailParser.js";
import type * as http from "../http.js";
import type * as ledger from "../ledger.js";
import type * as screens from "../screens.js";
import type * as spending from "../spending.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  finance: typeof finance;
  gmailAuth: typeof gmailAuth;
  gmailClient: typeof gmailClient;
  gmailPage: typeof gmailPage;
  gmailParser: typeof gmailParser;
  http: typeof http;
  ledger: typeof ledger;
  screens: typeof screens;
  spending: typeof spending;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
