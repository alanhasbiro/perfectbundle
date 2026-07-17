// NOTE: keep this file free of React/Next imports — reused by mobile later.

export const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "IE", name: "Ireland" },
  { code: "JP", name: "Japan" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "PL", name: "Poland" },
  { code: "TR", name: "Turkey" },
] as const;

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  IE: "EUR",
  SE: "SEK",
  JP: "JPY",
  SG: "SGD",
  AE: "AED",
  SA: "SAR",
  IN: "INR",
  BR: "BRL",
  MX: "MXN",
  PL: "PLN",
  TR: "TRY",
};

export function detectCountry(locale: string | undefined): string {
  if (!locale) return "US";
  const region = locale.replace("_", "-").split("-")[1];
  if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  return "US";
}

export function currencyForCountry(country: string): string {
  return CURRENCY_BY_COUNTRY[country] ?? "USD";
}
