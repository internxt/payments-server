export interface Currency {
  currencyId: string; // The ISO code of the currency (e.g., "BTC", "EUR")
  name: string; // The full name of the currency (e.g., "Bitcoin", "Euro")
  type: 'crypto' | 'fiat'; // The type of currency: "crypto" or "fiat"
  receiveType: boolean; // Indicates if the currency can be received
  networks: { platformId: string; name: string }[]; // Available networks for the currency
  imageUrl: string; // The URL to the currency's icon
}

export interface Bit2MeAPIError {
  // Contains all the errors
  message: string;
  // HTTP Error
  error: string[];
  // HTTP Status code
  statusCode: number;
}

export interface CreateCryptoInvoicePayload {
  foreignId: string;
  priceAmount: number;
  priceCurrency: string;
  title: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  purchaserEmail: string;
  securityToken: string;
}

export interface RawInvoiceResponse {
  invoiceId: string;
  createdAt: string;
  updatedAt: string;
  expiredAt: string;
  paidAt: null;
  foreignId: string;
  priceAmount: string;
  priceCurrency: string;
  status: string;
  customerEmail: string;
  receiveCurrencyName: string;
  title: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  underpaidAmount: string;
  overpaidAmount: string;
  paymentAddress: string;
  paymentRequestUri: string;
  payAmount: number;
  payCurrency: string;
  merchant: {
    merchantId: string;
    name: string;
  };
  url: string;
}

export type ParsedInvoiceResponse = Omit<
  RawInvoiceResponse,
  'createdAt' | 'updatedAt' | 'expiredAt' | 'priceAmount' | 'underpaidAmount' | 'overpaidAmount'
> & {
  createdAt: Date;
  updatedAt: Date;
  expiredAt: Date;
  priceAmount: number;
  underpaidAmount: number;
  overpaidAmount: number;
};

export type RawCreateInvoiceResponse = Omit<RawInvoiceResponse, 'expiredAt' | 'underpaidAmount' | 'overpaidAmount'>;
export type ParsedCreatedInvoiceResponse = Omit<RawCreateInvoiceResponse, 'createdAt' | 'updatedAt' | 'priceAmount'> & {
  createdAt: Date;
  updatedAt: Date;
  priceAmount: number;
};
