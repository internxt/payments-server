import { Axios, AxiosError, AxiosRequestConfig } from 'axios';
import jwt from 'jsonwebtoken';
import { AppConfig } from '../config';
import { createHmac } from 'crypto';
import { HttpError } from '../errors/HttpError';
import { AllowedCryptoCurrencies } from '../utils/currency';
import { validate as validateUUID } from 'uuid';
import { BadRequestError } from '../errors/Errors';
import {
  Bit2MeAPIError,
  CreateCryptoInvoicePayload,
  Currency,
  InvoicePayload,
  ParsedCreatedInvoiceResponse,
  ParsedInvoiceResponse,
  RawCreateInvoiceResponse,
  RawInvoiceResponse,
} from '../types/bit2me';

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
    };
  }

  private signSecurityToken({ stripeInvoiceId, customerId }: { stripeInvoiceId: string; customerId: string }) {
    const securityToken = jwt.sign(
      {
        invoiceId: stripeInvoiceId,
        customerId: customerId,
        provider: 'stripe',
      },
      this.config.JWT_SECRET,
    );

    return securityToken;
  }

  /**
   * Generate the payload for the Bit2Me create crypto invoice API call.
   * @param {InvoicePayload} payload - The payload containing the required information for generating the invoice payload.
   * @returns {CreateCryptoInvoicePayload} - The payload to be sent to the Bit2Me create crypto invoice API call.
   */
  public generateInvoicePayload({
    priceId,
    priceAmount,
    currency,
    stripeInvoiceId,
    customerId,
    userData,
  }: InvoicePayload): CreateCryptoInvoicePayload {
    const { userPublicAddress, name, email, address, country, city, postalCode } = userData;

    const securityToken = this.signSecurityToken({
      stripeInvoiceId,
      customerId,
    });

    return {
      description: `Payment for lifetime product ${priceId}`,
      priceAmount,
      priceCurrency: currency.toUpperCase(),
      title: `Invoice from Stripe ${stripeInvoiceId}`,
      securityToken,
      foreignId: stripeInvoiceId,
      cancelUrl: `${this.config.DRIVE_WEB_URL}/checkout/cancel`,
      successUrl: `${this.config.DRIVE_WEB_URL}/checkout/success`,
      purchaserEmail: email,
      shopper: {
        type: 'personal',
        ipAddress: userPublicAddress,
        email,
        firstName: name,
        lastName: '',
        dateOfBirth: '',
        countryOfResidence: country,
        addressLine: address,
        postalCode: postalCode,
        city,
      },
    };
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
  async createCryptoInvoice(payload: CreateCryptoInvoicePayload): Promise<ParsedCreatedInvoiceResponse> {
    const payloadReq = {
      ...payload,
      receiveCurrency: AllowedCryptoCurrencies['Bitcoin'],
      priceAmount: payload.priceAmount.toString(),
    };
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
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const { response } = err;
        const data = response?.data as Bit2MeAPIError;
        const message = `Status ${data.statusCode} received -> ${data.message} / payload ${JSON.stringify(payloadReq)}
        `;

        throw new HttpError(message, data.statusCode);
      } else {
        throw err;
      }
    }
  }

  /**
   * Activates an invoice for payment processing.
   *
   * @param {string} invoiceId - The unique ID of the invoice to activate.
   * @returns {Promise<ParsedInvoiceCheckoutResponse>} The parsed invoice data with updated fields.
   * @throws {Error} If the API call fails or the invoice ID is invalid.
   */
  async checkoutInvoice(invoiceId: string, currencyId: AllowedCryptoCurrencies): Promise<ParsedInvoiceResponse> {
    const currencyInfo = await this.getCurrencyByCurrencyId(currencyId);
    const payload = {
      currencyId,
      networkId: currencyInfo.networks[0].platformId,
    };

    const params: AxiosRequestConfig = {
      method: 'PUT',
      url: `${this.apiUrl}/v3/commerce/invoices/${invoiceId}/checkout`,
      headers: this.getAPIHeaders(payload),
      data: payload,
    };

    try {
      const { data } = await this.axios.request<RawInvoiceResponse>(params);

      const response: ParsedInvoiceResponse = {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        expiredAt: new Date(data.expiredAt),
        priceAmount: parseFloat(data.priceAmount),
        underpaidAmount: parseFloat(data.underpaidAmount),
        overpaidAmount: parseFloat(data.overpaidAmount),
      };

      return response;
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const { response } = err;
        const data = response?.data as Bit2MeAPIError;
        const message = `Status ${data.statusCode} received -> ${data.message} / payload ${JSON.stringify(payload)}
        `;

        throw new HttpError(message, data.statusCode);
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
      headers: this.getAPIHeaders({}),
    };

    try {
      const { data } = await this.axios.request<Currency[]>(params);
      return data;
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const { response } = err;
        const data = response?.data as Bit2MeAPIError;

        throw new Error(`Status ${data.statusCode} received -> ${data.message}`);
      } else {
        throw err;
      }
    }
  }

  async getCurrencyByCurrencyId(currencyId: Currency['currencyId']): Promise<Currency> {
    const params: AxiosRequestConfig = {
      method: 'GET',
      url: `${this.apiUrl}/v3/commerce/currencies/${currencyId}`,
      headers: this.getAPIHeaders({}),
    };

    try {
      const { data } = await this.axios.request<Currency>(params);
      return data;
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const { response } = err;
        const data = response?.data as Bit2MeAPIError;
        const errorMessage = `Status ${data.statusCode} received -> ${data.message}`;

        throw new HttpError(errorMessage, data.statusCode);
      } else {
        throw err;
      }
    }
  }

  async getInvoice(invoiceId: string) {
    const isUUID = validateUUID(invoiceId);

    if (!isUUID) {
      throw new BadRequestError(`Invalid invoice id ${invoiceId}`);
    }

    const safeInvoiceId = encodeURIComponent(invoiceId);

    const params: AxiosRequestConfig = {
      method: 'GET',
      url: `${this.apiUrl}/v3/commerce/invoices/${safeInvoiceId}`,
      headers: this.getAPIHeaders({}),
    };

    try {
      const { data } = await this.axios.request<RawInvoiceResponse>(params);
      return data;
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const { response } = err;
        const data = response?.data as Bit2MeAPIError;
        const errorMessage = `Status ${data.statusCode} received -> ${data.message}`;

        throw new HttpError(errorMessage, data.statusCode);
      } else {
        throw err;
      }
    }
  }
}
