import { Axios, AxiosError, AxiosRequestConfig } from "axios";
import { AppConfig } from "../config";
import { createHmac } from "crypto";

interface Currency {
  currencyId: string; // The ISO code of the currency (e.g., "BTC", "EUR")
  name: string; // The full name of the currency (e.g., "Bitcoin", "Euro")
  type: "crypto" | "fiat"; // The type of currency: "crypto" or "fiat"
  receiveType: boolean; // Indicates if the currency can be received
  networks: { platformId: string; name: string }[]; // Available networks for the currency
  imageUrl: string; // The URL to the currency's icon
}

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
    } catch (error: unknown | AxiosError) {
      if (error instanceof AxiosError && error.response) {
        console.error('Error fetching currencies:', error.response.data);
      } else {
        console.error('Unexpected error:', error);
      }
      throw new Error('Failed to fetch currencies');
    }
  }

}
