// NOTE: keep this file free of React/Next imports — reused by mobile later.

export interface RetailerLink {
  retailer: "amazon" | "etsy" | "ebay";
  url: string;
  label: string;
}

const AMAZON_DOMAIN_BY_COUNTRY: Record<string, string> = {
  US: "amazon.com",
  GB: "amazon.co.uk",
  DE: "amazon.de",
  FR: "amazon.fr",
  IT: "amazon.it",
  ES: "amazon.es",
  CA: "amazon.ca",
  AU: "amazon.com.au",
  JP: "amazon.co.jp",
  IN: "amazon.in",
  BR: "amazon.com.br",
  MX: "amazon.com.mx",
  NL: "amazon.nl",
  SE: "amazon.se",
  SG: "amazon.sg",
  AE: "amazon.ae",
};

export function amazonDomainForCountry(country: string): string {
  return AMAZON_DOMAIN_BY_COUNTRY[country] ?? "amazon.com";
}

// Amazon's "Get it fast" delivery-speed search refinement.
// See: https://www.amazon.com/s?rh=p_76:<refinement id>
const AMAZON_FAST_SHIPPING_PARAM = "rh=p_76%3A2661601011"; // "Get It Fast" refinement

function buildAmazonUrl(query: string, country: string, urgency: string): string {
  const domain = amazonDomainForCountry(country);
  const params = new URLSearchParams({ k: query });
  const tag = process.env.AFFILIATE_TAG_AMAZON;
  if (tag) params.set("tag", tag);
  let url = `https://www.${domain}/s?${params.toString()}`;
  if (urgency === "fast") url += `&${AMAZON_FAST_SHIPPING_PARAM}`;
  return url;
}

function buildEtsyUrl(query: string): string {
  const params = new URLSearchParams({ q: query });
  return `https://www.etsy.com/search?${params.toString()}`;
}

function buildEbayUrl(query: string): string {
  const params = new URLSearchParams({ _nkw: query });
  const campid = process.env.AFFILIATE_ID_EBAY;
  if (campid) params.set("campid", campid);
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

export function buildRetailerLinks(
  searchQuery: string,
  country: string,
  urgency: "fast" | "normal" | "no_rush"
): RetailerLink[] {
  return [
    {
      retailer: "amazon",
      url: buildAmazonUrl(searchQuery, country, urgency),
      label: "Find it on Amazon",
    },
    { retailer: "etsy", url: buildEtsyUrl(searchQuery), label: "Find it on Etsy" },
    { retailer: "ebay", url: buildEbayUrl(searchQuery), label: "Find it on eBay" },
  ];
}
