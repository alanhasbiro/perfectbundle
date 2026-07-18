import { describe, it, expect } from "vitest";
import {
  buildStockImageQuery,
  parsePexelsResponse,
  chooseItemMedia,
  type ProductMedia,
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

describe("parsePexelsResponse", () => {
  it("returns the first photo's medium src", () => {
    const json = {
      photos: [
        {
          src: {
            medium: "https://images.pexels.com/a-medium.jpg",
            large: "https://images.pexels.com/a-large.jpg",
          },
        },
        { src: { medium: "https://images.pexels.com/b-medium.jpg" } },
      ],
    };
    expect(parsePexelsResponse(json)).toBe("https://images.pexels.com/a-medium.jpg");
  });

  it("returns null when there are no photos", () => {
    expect(parsePexelsResponse({ photos: [] })).toBeNull();
    expect(parsePexelsResponse({})).toBeNull();
    expect(parsePexelsResponse(null)).toBeNull();
    expect(parsePexelsResponse("nonsense")).toBeNull();
  });
});

describe("chooseItemMedia", () => {
  const product: ProductMedia = {
    imageUrl: "https://cdn.example.com/real.jpg",
    productUrl: "https://buy.example.com/item?aff=1",
    productPrice: "$24.00",
    productMerchant: "Etsy",
  };

  it("uses the real product when present (not representative)", () => {
    expect(chooseItemMedia({ sovrn: product, stock: "https://stock/x.jpg" })).toEqual({
      imageUrl: "https://cdn.example.com/real.jpg",
      imageIsRepresentative: false,
      productUrl: "https://buy.example.com/item?aff=1",
      productPrice: "$24.00",
      productMerchant: "Etsy",
    });
  });

  it("falls back to the stock image, flagged representative", () => {
    expect(chooseItemMedia({ sovrn: null, stock: "https://stock/x.jpg" })).toEqual({
      imageUrl: "https://stock/x.jpg",
      imageIsRepresentative: true,
    });
  });

  it("returns empty media when nothing is available", () => {
    expect(chooseItemMedia({ sovrn: null, stock: null })).toEqual({});
  });
});
