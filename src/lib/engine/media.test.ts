import { describe, it, expect } from "vitest";
import {
  buildStockImageQuery,
  parseUnsplashResponse,
  parsePexelsResponse,
  parseEbayItemSummary,
  ebayMarketplaceForCountry,
  formatEbayPrice,
  chooseItemMedia,
  type ProductMedia,
  type StockImage,
} from "./media";

describe("buildStockImageQuery", () => {
  it("prefers the item's searchQuery", () => {
    expect(
      buildStockImageQuery({ searchQuery: "ceramic pour-over coffee set", name: "Pour-over kit" })
    ).toBe("ceramic pour-over coffee set");
  });

  it("falls back to the item name when searchQuery is blank", () => {
    expect(buildStockImageQuery({ searchQuery: "   ", name: "Pour-over kit" })).toBe("Pour-over kit");
  });
});

describe("parseUnsplashResponse", () => {
  it("returns the first result's small url plus photographer credit", () => {
    const json = {
      results: [
        {
          urls: { small: "https://images.unsplash.com/a-small.jpg", regular: "https://x/reg.jpg" },
          user: { name: "Ada Lovelace", links: { html: "https://unsplash.com/@ada" } },
        },
      ],
    };
    expect(parseUnsplashResponse(json)).toEqual({
      url: "https://images.unsplash.com/a-small.jpg",
      creditName: "Ada Lovelace",
      creditUrl: "https://unsplash.com/@ada",
      source: "unsplash",
    });
  });

  it("returns null when there are no results or the shape is wrong", () => {
    expect(parseUnsplashResponse({ results: [] })).toBeNull();
    expect(parseUnsplashResponse({})).toBeNull();
    expect(parseUnsplashResponse(null)).toBeNull();
    expect(parseUnsplashResponse("nonsense")).toBeNull();
  });

  it("still returns the image when photographer credit is missing", () => {
    const json = { results: [{ urls: { small: "https://images.unsplash.com/b.jpg" } }] };
    expect(parseUnsplashResponse(json)).toEqual({
      url: "https://images.unsplash.com/b.jpg",
      creditName: undefined,
      creditUrl: undefined,
      source: "unsplash",
    });
  });
});

describe("parsePexelsResponse", () => {
  it("returns the first photo's medium src plus photographer credit", () => {
    const json = {
      photos: [
        {
          src: { medium: "https://images.pexels.com/a-medium.jpg" },
          photographer: "Grace Hopper",
          photographer_url: "https://www.pexels.com/@grace",
        },
      ],
    };
    expect(parsePexelsResponse(json)).toEqual({
      url: "https://images.pexels.com/a-medium.jpg",
      creditName: "Grace Hopper",
      creditUrl: "https://www.pexels.com/@grace",
      source: "pexels",
    });
  });

  it("returns null when there are no photos", () => {
    expect(parsePexelsResponse({ photos: [] })).toBeNull();
    expect(parsePexelsResponse({})).toBeNull();
    expect(parsePexelsResponse(null)).toBeNull();
    expect(parsePexelsResponse("nonsense")).toBeNull();
  });
});

describe("ebayMarketplaceForCountry", () => {
  it("maps known countries to their eBay marketplace id", () => {
    expect(ebayMarketplaceForCountry("US")).toBe("EBAY_US");
    expect(ebayMarketplaceForCountry("GB")).toBe("EBAY_GB");
    expect(ebayMarketplaceForCountry("DE")).toBe("EBAY_DE");
    expect(ebayMarketplaceForCountry("AU")).toBe("EBAY_AU");
  });

  it("falls back to EBAY_US for unmapped countries", () => {
    expect(ebayMarketplaceForCountry("ZZ")).toBe("EBAY_US");
  });
});

describe("formatEbayPrice", () => {
  it("uses a currency symbol when known", () => {
    expect(formatEbayPrice("24.99", "USD")).toBe("$24.99");
    expect(formatEbayPrice("19.50", "GBP")).toBe("£19.50");
    expect(formatEbayPrice("30.00", "EUR")).toBe("€30.00");
  });

  it("falls back to 'value CURRENCY' for unknown currencies", () => {
    expect(formatEbayPrice("100", "SEK")).toBe("100 SEK");
  });
});

describe("parseEbayItemSummary", () => {
  it("extracts the first item into ProductMedia, merchant hardcoded to eBay", () => {
    const json = {
      itemSummaries: [
        {
          title: "Vintage Camera",
          price: { value: "45.00", currency: "USD" },
          image: { imageUrl: "https://i.ebayimg.com/a.jpg" },
          itemWebUrl: "https://www.ebay.com/itm/123",
        },
      ],
    };
    expect(parseEbayItemSummary(json)).toEqual({
      imageUrl: "https://i.ebayimg.com/a.jpg",
      productUrl: "https://www.ebay.com/itm/123",
      productPrice: "$45.00",
      productMerchant: "eBay",
    });
  });

  it("prefers itemAffiliateWebUrl over itemWebUrl when both are present", () => {
    const json = {
      itemSummaries: [
        {
          title: "Vintage Camera",
          price: { value: "45.00", currency: "USD" },
          image: { imageUrl: "https://i.ebayimg.com/a.jpg" },
          itemWebUrl: "https://www.ebay.com/itm/123",
          itemAffiliateWebUrl: "https://www.ebay.com/itm/123?campid=aff",
        },
      ],
    };
    expect(parseEbayItemSummary(json)?.productUrl).toBe(
      "https://www.ebay.com/itm/123?campid=aff"
    );
  });

  it("returns null when there are no items or required fields are missing", () => {
    expect(parseEbayItemSummary({ itemSummaries: [] })).toBeNull();
    expect(parseEbayItemSummary({})).toBeNull();
    expect(parseEbayItemSummary(null)).toBeNull();
    expect(
      parseEbayItemSummary({ itemSummaries: [{ title: "No image or url" }] })
    ).toBeNull();
  });
});

describe("chooseItemMedia", () => {
  const product: ProductMedia = {
    imageUrl: "https://cdn.example.com/real.jpg",
    productUrl: "https://buy.example.com/item?aff=1",
    productPrice: "$24.00",
    productMerchant: "eBay",
  };

  const stock: StockImage = {
    url: "https://stock/x.jpg",
    creditName: "Ada Lovelace",
    creditUrl: "https://unsplash.com/@ada",
    source: "unsplash",
  };

  it("uses the real product when present (not representative, no stock credit)", () => {
    expect(chooseItemMedia({ realProduct: product, stock })).toEqual({
      imageUrl: "https://cdn.example.com/real.jpg",
      imageIsRepresentative: false,
      productUrl: "https://buy.example.com/item?aff=1",
      productPrice: "$24.00",
      productMerchant: "eBay",
    });
  });

  it("falls back to the stock image, flagged representative, with credit", () => {
    expect(chooseItemMedia({ realProduct: null, stock })).toEqual({
      imageUrl: "https://stock/x.jpg",
      imageIsRepresentative: true,
      imageCreditName: "Ada Lovelace",
      imageCreditUrl: "https://unsplash.com/@ada",
      imageSource: "unsplash",
    });
  });

  it("returns empty media when nothing is available", () => {
    expect(chooseItemMedia({ realProduct: null, stock: null })).toEqual({});
  });
});
