export const EU_STANDARD_VAT_RATES_BPS: Record<string, number> = {
  AT: 2000,
  BE: 2100,
  BG: 2000,
  CY: 1900,
  CZ: 2100,
  DE: 1900,
  DK: 2500,
  EE: 2400,
  ES: 2100,
  FI: 2550,
  FR: 2000,
  GR: 2400,
  HR: 2500,
  HU: 2700,
  IE: 2300,
  IT: 2200,
  LT: 2100,
  LU: 1700,
  LV: 2100,
  MT: 1800,
  NL: 2100,
  PL: 2300,
  PT: 2300,
  RO: 2100,
  SE: 2500,
  SI: 2200,
  SK: 2300,
};

const SPANISH_NON_VAT_TERRITORY_POSTAL_CODE_PREFIXES = ['35', '38', '51', '52'];

const isSpanishNonVatTerritory = (country: string, postalCode?: string | null): boolean =>
  country === 'ES' &&
  !!postalCode &&
  SPANISH_NON_VAT_TERRITORY_POSTAL_CODE_PREFIXES.some((prefix) => postalCode.startsWith(prefix));

export interface PriceTax {
  taxAmount: number;
  amountTotal: number;
}

export const calculateConsumerVatFromStandardRate = (
  amount: number,
  country: string,
  postalCode?: string | null,
): PriceTax | undefined => {
  const normalizedCountry = country.toUpperCase();
  if (isSpanishNonVatTerritory(normalizedCountry, postalCode?.trim())) return undefined;

  const rateBps = EU_STANDARD_VAT_RATES_BPS[normalizedCountry];
  if (!rateBps) return undefined;

  const taxAmount = Math.round((amount * rateBps) / 10000);
  return { taxAmount, amountTotal: amount + taxAmount };
};
