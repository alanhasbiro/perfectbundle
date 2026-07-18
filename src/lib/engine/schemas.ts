import { z } from "zod";

// NOTE: keep this file free of React/Next imports — reused by mobile later.

export const bundleItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  why: z.string().min(1),
  estPriceRange: z.string().min(1),
  searchQuery: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  imageUrl: z.string().optional(),
  imageIsRepresentative: z.boolean().optional(),
  productUrl: z.string().optional(),
  productPrice: z.string().optional(),
  productMerchant: z.string().optional(),
});

export const bundleContentSchema = z.object({
  theme: z.string().min(1),
  rationale: z.string().min(1),
  estTotal: z.string().min(1),
  items: z.array(bundleItemSchema).min(3).max(6),
});

export const curatedBundleSchema = bundleContentSchema.extend({
  title: z.string().min(1),
  season: z.string().optional(),
  priceBand: z.string().min(1),
  approved: z.boolean(),
  sortWeight: z.number(),
});

export type BundleItem = z.infer<typeof bundleItemSchema>;
export type BundleContent = z.infer<typeof bundleContentSchema>;
export type CuratedBundle = z.infer<typeof curatedBundleSchema>;
