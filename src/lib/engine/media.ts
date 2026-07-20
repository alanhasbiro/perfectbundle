// NOTE: keep this file free of React/Next/Convex imports and free of fetch/env.
// The network calls live in the Convex action; this module is pure logic only.

export interface ProductMedia {
  imageUrl: string;
  productUrl: string;
  productPrice: string;
  productMerchant: string;
}

// A representative (stock) photo. Unsplash's API terms REQUIRE crediting the
// photographer, so credit travels with the image rather than being optional
// metadata we might forget to render.
export interface StockImage {
  url: string;
  creditName?: string;
  creditUrl?: string;
  source: "unsplash" | "pexels";
}

export interface ItemMedia {
  imageUrl?: string;
  imageIsRepresentative?: boolean;
  imageCreditName?: string;
  imageCreditUrl?: string;
  imageSource?: string;
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

function asRecord(json: unknown): Record<string, unknown> | null {
  return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
}

// Extracts the first result from an Unsplash /search/photos response.
// Field paths per Unsplash docs: results[].urls.small, results[].user.name,
// results[].user.links.html.
export function parseUnsplashResponse(json: unknown): StockImage | null {
  const root = asRecord(json);
  if (!root) return null;
  const results = root.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0] as {
    urls?: { small?: unknown };
    user?: { name?: unknown; links?: { html?: unknown } };
  } | null;
  const url = first?.urls?.small;
  if (typeof url !== "string" || url.length === 0) return null;
  const creditName = first?.user?.name;
  const creditUrl = first?.user?.links?.html;
  return {
    url,
    creditName: typeof creditName === "string" ? creditName : undefined,
    creditUrl: typeof creditUrl === "string" ? creditUrl : undefined,
    source: "unsplash",
  };
}

// Extracts the first photo from a Pexels /v1/search response.
// Field paths: photos[].src.medium, photos[].photographer, photos[].photographer_url.
export function parsePexelsResponse(json: unknown): StockImage | null {
  const root = asRecord(json);
  if (!root) return null;
  const photos = root.photos;
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const first = photos[0] as {
    src?: { medium?: unknown };
    photographer?: unknown;
    photographer_url?: unknown;
  } | null;
  const url = first?.src?.medium;
  if (typeof url !== "string" || url.length === 0) return null;
  return {
    url,
    creditName: typeof first?.photographer === "string" ? first.photographer : undefined,
    creditUrl: typeof first?.photographer_url === "string" ? first.photographer_url : undefined,
    source: "pexels",
  };
}

// First-match-wins media layering: a real purchasable product (Sovrn/eBay) beats
// a representative stock photo. A real product photo is NOT representative and
// carries no photographer credit; a stock photo IS representative and does.
export function chooseItemMedia(sources: {
  sovrn: ProductMedia | null;
  stock: StockImage | null;
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
    return {
      imageUrl: sources.stock.url,
      imageIsRepresentative: true,
      imageCreditName: sources.stock.creditName,
      imageCreditUrl: sources.stock.creditUrl,
      imageSource: sources.stock.source,
    };
  }
  return {};
}
