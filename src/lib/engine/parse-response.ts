// NOTE: keep this file free of React/Next imports — reused by mobile later.
import { z } from "zod";
import { bundleContentSchema, bundleItemSchema, type BundleContent, type BundleItem } from "./schemas";

export type ParseResult = { ok: true; bundles: BundleContent[] } | { ok: false; error: string };

const threeBundlesSchema = z.array(bundleContentSchema).length(3);

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export function parseBundleResponse(raw: string): ParseResult {
  const cleaned = stripCodeFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "Response was not valid JSON" };
  }

  const parsed = threeBundlesSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `Response did not match expected shape: ${parsed.error.message}` };
  }

  return { ok: true, bundles: parsed.data };
}

export type ParseItemResult = { ok: true; item: BundleItem } | { ok: false; error: string };

export function parseItemResponse(raw: string): ParseItemResult {
  const cleaned = stripCodeFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "Response was not valid JSON" };
  }

  const parsed = bundleItemSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `Response did not match expected shape: ${parsed.error.message}` };
  }

  return { ok: true, item: parsed.data };
}

export type ParseSingleBundleResult = { ok: true; bundle: BundleContent } | { ok: false; error: string };

export function parseSingleBundleResponse(raw: string): ParseSingleBundleResult {
  const cleaned = stripCodeFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "Response was not valid JSON" };
  }

  const parsed = bundleContentSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `Response did not match expected shape: ${parsed.error.message}` };
  }

  return { ok: true, bundle: parsed.data };
}
