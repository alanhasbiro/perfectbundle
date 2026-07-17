import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildRetailerLinks, amazonDomainForCountry } from "./retailer-links";

describe("amazonDomainForCountry", () => {
  it("maps major countries to their Amazon TLD", () => {
    expect(amazonDomainForCountry("US")).toBe("amazon.com");
    expect(amazonDomainForCountry("GB")).toBe("amazon.co.uk");
    expect(amazonDomainForCountry("DE")).toBe("amazon.de");
    expect(amazonDomainForCountry("FR")).toBe("amazon.fr");
    expect(amazonDomainForCountry("IT")).toBe("amazon.it");
    expect(amazonDomainForCountry("ES")).toBe("amazon.es");
    expect(amazonDomainForCountry("CA")).toBe("amazon.ca");
    expect(amazonDomainForCountry("AU")).toBe("amazon.com.au");
    expect(amazonDomainForCountry("JP")).toBe("amazon.co.jp");
    expect(amazonDomainForCountry("IN")).toBe("amazon.in");
    expect(amazonDomainForCountry("BR")).toBe("amazon.com.br");
    expect(amazonDomainForCountry("MX")).toBe("amazon.com.mx");
    expect(amazonDomainForCountry("NL")).toBe("amazon.nl");
    expect(amazonDomainForCountry("SE")).toBe("amazon.se");
    expect(amazonDomainForCountry("SG")).toBe("amazon.sg");
    expect(amazonDomainForCountry("AE")).toBe("amazon.ae");
  });
  it("falls back to .com for unmapped countries", () => {
    expect(amazonDomainForCountry("ZZ")).toBe("amazon.com");
  });
});

function decodeQuery(url: string): string {
  // URLSearchParams encodes spaces as "+", which decodeURIComponent leaves alone —
  // convert "+" to space first so we can assert against the human-readable phrase.
  return decodeURIComponent(url.replace(/\+/g, " "));
}

describe("buildRetailerLinks", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.AFFILIATE_TAG_AMAZON;
    delete process.env.AFFILIATE_ID_EBAY;
    delete process.env.AFFILIATE_ID_AWIN;
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns exactly amazon, etsy, ebay in order", () => {
    const links = buildRetailerLinks("ceramic mug", "US", "normal");
    expect(links.map((l) => l.retailer)).toEqual(["amazon", "etsy", "ebay"]);
  });

  it("URL-encodes the search query and uses the right domain per country", () => {
    const links = buildRetailerLinks("gooseneck kettle & pot", "GB", "normal");
    const amazon = links.find((l) => l.retailer === "amazon")!;
    expect(amazon.url).toContain("amazon.co.uk");
    expect(decodeQuery(amazon.url)).toContain("gooseneck kettle & pot");
    const etsy = links.find((l) => l.retailer === "etsy")!;
    expect(etsy.url).toContain("etsy.com");
    expect(decodeQuery(etsy.url)).toContain("gooseneck kettle & pot");
    const ebay = links.find((l) => l.retailer === "ebay")!;
    expect(ebay.url).toContain("ebay.com");
    expect(decodeQuery(ebay.url)).toContain("gooseneck kettle & pot");
  });

  it("omits affiliate tag params when env vars are unset", () => {
    const links = buildRetailerLinks("mug", "US", "normal");
    const amazon = links.find((l) => l.retailer === "amazon")!;
    expect(amazon.url).not.toContain("tag=");
    const ebay = links.find((l) => l.retailer === "ebay")!;
    expect(ebay.url).not.toContain("campid=");
  });

  it("includes affiliate tag params when env vars are set", () => {
    process.env.AFFILIATE_TAG_AMAZON = "pbtag-20";
    process.env.AFFILIATE_ID_EBAY = "pb-ebay-123";
    const links = buildRetailerLinks("mug", "US", "normal");
    const amazon = links.find((l) => l.retailer === "amazon")!;
    expect(amazon.url).toContain("tag=pbtag-20");
    const ebay = links.find((l) => l.retailer === "ebay")!;
    expect(ebay.url).toContain("campid=pb-ebay-123");
  });

  it("adds a fast-shipping hint param on amazon only when urgency is fast", () => {
    const fast = buildRetailerLinks("mug", "US", "fast").find((l) => l.retailer === "amazon")!;
    expect(fast.url).toContain("rh=p_76");
    const normal = buildRetailerLinks("mug", "US", "normal").find((l) => l.retailer === "amazon")!;
    expect(normal.url).not.toContain("rh=p_76");
  });

  it("gives each link a human-readable label", () => {
    const links = buildRetailerLinks("mug", "US", "normal");
    expect(links.find((l) => l.retailer === "amazon")!.label).toBe("Find it on Amazon");
    expect(links.find((l) => l.retailer === "etsy")!.label).toBe("Find it on Etsy");
    expect(links.find((l) => l.retailer === "ebay")!.label).toBe("Find it on eBay");
  });
});
