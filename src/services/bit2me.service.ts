import { Axios, AxiosError, AxiosRequestConfig } from "axios";
import { AppConfig } from "../config";
import { createHmac } from "crypto";

export interface Currency {
  currencyId: string; // The ISO code of the currency (e.g., "BTC", "EUR")
  name: string; // The full name of the currency (e.g., "Bitcoin", "Euro")
  type: "crypto" | "fiat"; // The type of currency: "crypto" or "fiat"
  receiveType: boolean; // Indicates if the currency can be received
  networks: { platformId: string; name: string }[]; // Available networks for the currency
  imageUrl: string; // The URL to the currency's icon
}

export enum AllowedCurrencies {
  Bitcoin = 'BTC',
  Ethereum = 'ETH',
  Litecoin = 'LTC',
  BitcoinCash = 'BCH',
  Ripple = 'XRP',
  Tether = 'USDT',
  USDC = 'USDC',
  Tron = 'TRX',
  Cardano = 'ADA',
  BinanceCoin = 'BNB',
}

interface Bit2MeAPIError {
  // Contains all the errors
  message: string[];
  // HTTP Error
  error: string[];
  // HTTP Status code
  statusCode: number;
}

interface RawInvoiceResponse {
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
  },
  url: string;
}

type ParsedInvoiceResponse = Omit<RawInvoiceResponse, 'createdAt' | 'updatedAt' | 'expiredAt' | 'priceAmount' | 'underpaidAmount' | 'overpaidAmount'> & {
  createdAt: Date;
  updatedAt: Date;
  expiredAt: Date;
  priceAmount: number;
  underpaidAmount: number;
  overpaidAmount: number;
};

type RawCreateInvoiceResponse = Omit<RawInvoiceResponse, 'expiredAt' | 'underpaidAmount' | 'overpaidAmount'>;
type ParsedCreatedInvoiceResponse = Omit<RawCreateInvoiceResponse, 'createdAt' | 'updatedAt' | 'priceAmount'> & {
  createdAt: Date;
  updatedAt: Date;
  priceAmount: number;
};

export class Bit2MeService {
  constructor(
    private readonly config: AppConfig,
    private readonly axios: Axios,
    private readonly secretKey = config.CRYPTO_PAYMENTS_PROCESSOR_SECRET_KEY,
    private readonly apiKey = config.CRYPTO_PAYMENTS_PROCESSOR_API_KEY,
    private readonly apiUrl = config.CRYPTO_PAYMENTS_PROCESSOR_API_URL,
  ) {}

  private signSecret(payload: object) {
    return createHmac('sha256', this.secretKey).update(JSON.stringify(payload)).digest('hex');
  }

  private getAPIHeaders(payload: Record<string, any>): {
    'b2m-processing-key': string;
    'b2m-secret-key': string;
    'Content-Type': 'application/json';
  } {
    return {
      'b2m-processing-key': this.apiKey,
      'b2m-secret-key': this.signSecret(payload),
      'Content-Type': 'application/json',
    }
  }

  isAllowedCurrency(value: string): value is AllowedCurrencies {
    return Object.values(AllowedCurrencies).includes(value as AllowedCurrencies);
  }
  

  /**
   * Creates a new invoice in the Bit2Me system.
   * 
   * @param {Object} payload - The data required to create the invoice.
   * @param {string} payload.foreignId - Unique ID for the invoice in your system.
   * @param {string} payload.priceAmount - The amount to be invoiced.
   * @param {string} payload.priceCurrency - The currency of the invoice (e.g., EUR).
   * @param {string} payload.title - The title of the invoice displayed to the customer.
   * @param {string} payload.description - A brief description of the invoice.
   * @param {string} payload.successUrl - The URL to redirect on successful payment.
   * @param {string} payload.cancelUrl - The URL to redirect on failed payment.
   * @param {string} payload.purchaserEmail - The email address of the customer.
   * @param {string} payload.securityToken - A unique token for securing callbacks.
   * @returns {Promise<ParsedInvoiceCheckoutResponse>} The parsed invoice data with updated fields.
   * @throws {Error} If the API call fails or the payload is invalid.
   */
  async createInvoice(payload: {
    foreignId: string;
    priceAmount: number;
    priceCurrency: AllowedCurrencies;
    title: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
    purchaserEmail: string;
    securityToken: string;
  }): Promise<ParsedCreatedInvoiceResponse> {
    const payloadReq = { ...payload, priceAmount: payload.priceAmount.toString() }
    const params: AxiosRequestConfig = {
      method: 'POST',
      url: `${this.apiUrl}/v3/commerce/invoices`,
      headers: this.getAPIHeaders(payloadReq),
      data: payloadReq,
    };
  
    try {
      const { data } = await this.axios.request<RawCreateInvoiceResponse>(params);
  
      const response: ParsedCreatedInvoiceResponse = {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        priceAmount: parseFloat(data.priceAmount),
      };
    
      return response;
    } catch (err: unknown | Error | AxiosError<Bit2MeAPIError>) {
      if (err instanceof AxiosError) {
        const { response } = err;
        const data = response?.data as Bit2MeAPIError;
  
        throw new Error(
          `Status ${
            data.statusCode
          } received -> ${
            data.message.join(',')
          } / payload ${
            JSON.stringify(payloadReq)
          }
        `);
      } else {
        throw err;
      }
    }
  }

  /**
   * Retrieves a list of all supported currencies in the Bit2Me system.
   * 
   * @returns {Promise<Currency[]>} A promise that resolves to an array of currencies.
   * @throws {Error} If the API call fails or returns an unexpected response.
   * 
   * @typedef {Object} Currency
   * @property {string} currencyId - The ISO code of the currency (e.g., "BTC", "EUR").
   * @property {string} name - The full name of the currency (e.g., "Bitcoin", "Euro").
   * @property {"crypto" | "fiat"} type - The type of currency: "crypto" or "fiat".
   * @property {boolean} receiveType - Indicates if the currency can be received.
   * @property {Array<{ platformId: string; name: string }>} networks - Available networks for the currency.
   * @property {string} imageUrl - The URL to the currency's icon.
   */
  async getCurrencies(): Promise<Currency[]> {
    const params: AxiosRequestConfig = {
      method: 'GET',
      url: `${this.apiUrl}/v3/commerce/currencies`,
      headers: this.getAPIHeaders({})
    };
  
    try {
      const { data } = await this.axios.request<Currency[]>(params);
      return data;
    } catch (err: unknown | Error | AxiosError<Bit2MeAPIError>) {
      if (err instanceof AxiosError) {
        const { response } = err;
        const data = response?.data as Bit2MeAPIError;

        throw new Error(`Status ${data.statusCode} received -> ${data.message.join(',')}`);
      } else {
        throw err;
      }
    }
  }

}
