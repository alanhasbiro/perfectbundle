/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bundles from "../bundles.js";
import type * as curated from "../curated.js";
import type * as generateBundles from "../generateBundles.js";
import type * as generationCache from "../generationCache.js";
import type * as rateLimit from "../rateLimit.js";
import type * as savedBundles from "../savedBundles.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as testSupport from "../testSupport.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bundles: typeof bundles;
  curated: typeof curated;
  generateBundles: typeof generateBundles;
  generationCache: typeof generationCache;
  rateLimit: typeof rateLimit;
  savedBundles: typeof savedBundles;
  seed: typeof seed;
  seedData: typeof seedData;
  testSupport: typeof testSupport;
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

export declare const components: {};
