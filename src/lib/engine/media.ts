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

const EBAY_MARKETPLACE_BY_COUNTRY: Record<string, string> = {
  US: "EBAY_US",
  GB: "EBAY_GB",
  DE: "EBAY_DE",
  AU: "EBAY_AU",
  CA: "EBAY_CA",
  FR: "EBAY_FR",
  IT: "EBAY_IT",
  ES: "EBAY_ES",
  NL: "EBAY_NL",
  CH: "EBAY_CH",
  AT: "EBAY_AT",
  BE: "EBAY_BE",
  IE: "EBAY_IE",
  IN: "EBAY_IN",
  SG: "EBAY_SG",
  MY: "EBAY_MY",
  PH: "EBAY_PH",
  PL: "EBAY_PL",
  TH: "EBAY_TH",
  TW: "EBAY_TW",
};

export function ebayMarketplaceForCountry(country: string): string {
  return EBAY_MARKETPLACE_BY_COUNTRY[country] ?? "EBAY_US";
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  CAD: "$",
  AUD: "$",
  JPY: "¥",
};

export function formatEbayPrice(value: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
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

// Extracts the first item from an eBay Browse API item_summary/search
// response into ProductMedia. Field paths: itemSummaries[].image.imageUrl,
// .itemWebUrl (falls back from .itemAffiliateWebUrl when the request included
// an affiliate campaign id), .price.value/.currency. Merchant is always shown
// as "eBay" (the seller username isn't a recognizable "buy at X" merchant).
export function parseEbayItemSummary(json: unknown): ProductMedia | null {
  const root = asRecord(json);
  if (!root) return null;
  const items = root.itemSummaries;
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0] as {
    image?: { imageUrl?: unknown };
    itemWebUrl?: unknown;
    itemAffiliateWebUrl?: unknown;
    price?: { value?: unknown; currency?: unknown };
  } | null;
  const imageUrl = first?.image?.imageUrl;
  const productUrl = first?.itemAffiliateWebUrl ?? first?.itemWebUrl;
  const priceValue = first?.price?.value;
  const priceCurrency = first?.price?.currency;
  if (
    typeof imageUrl !== "string" ||
    imageUrl.length === 0 ||
    typeof productUrl !== "string" ||
    productUrl.length === 0 ||
    typeof priceValue !== "string" ||
    typeof priceCurrency !== "string"
  ) {
    return null;
  }
  return {
    imageUrl,
    productUrl,
    productPrice: formatEbayPrice(priceValue, priceCurrency),
    productMerchant: "eBay",
  };
}

// First-match-wins media layering: a real purchasable product (Sovrn/eBay) beats
// a representative stock photo. A real product photo is NOT representative and
// carries no photographer credit; a stock photo IS representative and does.
export function chooseItemMedia(sources: {
  realProduct: ProductMedia | null;
  stock: StockImage | null;
}): ItemMedia {
  if (sources.realProduct) {
    return {
      imageUrl: sources.realProduct.imageUrl,
      imageIsRepresentative: false,
      productUrl: sources.realProduct.productUrl,
      productPrice: sources.realProduct.productPrice,
      productMerchant: sources.realProduct.productMerchant,
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
