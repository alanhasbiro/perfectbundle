// NOTE: keep this file free of React/Next/Convex imports and free of fetch/env.
// The network call lives in the Convex action; this module is pure logic only.

export interface ProductMedia {
  imageUrl: string;
  productUrl: string;
  productPrice: string;
  productMerchant: string;
}

export interface ItemMedia {
  imageUrl?: string;
  imageIsRepresentative?: boolean;
  productUrl?: string;
  productPrice?: string;
  productMerchant?: string;
}

// The search phrase used to fetch a representative photo. The AI-authored
// searchQuery is already a good product-search phrase; fall back to the item
// name if it's somehow blank.
export function buildStockImageQuery(item: { searchQuery: string; name: string }): string {
  const q = item.searchQuery.trim();
  return q.length > 0 ? q : item.name;
}

// Extracts the first photo's medium image URL from a Pexels /v1/search
// response, or null if the response has no usable photo.
export function parsePexelsResponse(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const photos = (json as { photos?: unknown }).photos;
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const first = photos[0] as { src?: { medium?: unknown } } | null;
  const medium = first?.src?.medium;
  return typeof medium === "string" && medium.length > 0 ? medium : null;
}

// First-match-wins media layering. Phase 1 only ever passes sovrn:null; Phase 2
// will pass a resolved product here and it takes precedence over the stock
// image. A real product photo is NOT representative; a stock photo IS.
export function chooseItemMedia(sources: {
  sovrn: ProductMedia | null;
  stock: string | null;
}): ItemMedia {
  if (sources.sovrn) {
    return {
      imageUrl: sources.sovrn.imageUrl,
      imageIsRepresentative: false,
      productUrl: sources.sovrn.productUrl,
      productPrice: sources.sovrn.productPrice,
      productMerchant: sources.sovrn.productMerchant,
    };
  }
  if (sources.stock) {
    return { imageUrl: sources.stock, imageIsRepresentative: true };
  }
  return {};
}
