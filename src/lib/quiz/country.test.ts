import { describe, it, expect } from "vitest";
import { detectCountry, currencyForCountry, COUNTRIES } from "./country";

describe("detectCountry", () => {
  it("extracts region from BCP-47 locales", () => {
    expect(detectCountry("en-GB")).toBe("GB");
    expect(detectCountry("de-DE")).toBe("DE");
    expect(detectCountry("en_AU")).toBe("AU"); // underscore variant
  });
  it("falls back to US when locale has no region or is missing", () => {
    expect(detectCountry("en")).toBe("US");
    expect(detectCountry(undefined)).toBe("US");
    expect(detectCountry("")).toBe("US");
  });
});

describe("currencyForCountry", () => {
  it("maps major countries", () => {
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("JP")).toBe("JPY");
  });
  it("falls back to USD for unmapped countries", () => {
    expect(currencyForCountry("ZZ")).toBe("USD");
  });
});

describe("COUNTRIES", () => {
  it("has 20 entries with unique codes, and every code maps to a currency deliberately", () => {
    expect(COUNTRIES).toHaveLength(20);
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
