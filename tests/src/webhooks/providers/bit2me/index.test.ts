import { FastifyInstance } from 'fastify';

import { closeServerAndDatabase, initializeServerAndDatabase } from '../../../utils/initializeServer';
import { Bit2MePaymentStatusCallback } from '../../../../../src/webhooks/providers/bit2me/index';
import { getCryptoInvoiceWebhook, getCustomer, getInvoice } from '../../../fixtures';
import jwt from 'jsonwebtoken';
import config from '../../../../../src/config';
import { PaymentService } from '../../../../../src/services/payment.service';
import Stripe from 'stripe';
import { InvoiceCompletedHandler } from '../../../../../src/webhooks/events/invoices/InvoiceCompletedHandler';

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Handling webhook for crypto payments', () => {
  test('When the foreignId does not match with the invoiceId we get from the encrypted token, then an error indicating so is thrown', async () => {
    const mockedInvoice = getInvoice();
    const mockedForeignId = 'inv_other';
    const encryptedToken = jwt.sign(
      {
        invoiceId: mockedInvoice.id,
        customerId: mockedInvoice.customer,
        provider: 'stripe',
      },
      config.JWT_SECRET,
    );
    const payload: Bit2MePaymentStatusCallback = {
      id: '1',
      foreignId: mockedForeignId,
      cryptoAddress: { currency: 'BTC', address: '1abc' },
      currencySent: { currency: 'BTC', amount: '0.01', remainingAmount: '0' },
      currencyReceived: { currency: 'BTC' },
      token: encryptedToken,
      transactions: [],
      fees: [],
      error: [],
      status: 'paid',
    };

    const response = await app.inject({
      method: 'POST',
      path: '/webhook/crypto',
      body: payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toStrictEqual(
      `Stripe invoice with id ${mockedInvoice.id} and invoice foreign id ${mockedForeignId} does not match for customer ${
        mockedInvoice.customer as string
      }`,
    );
  });

  test('When provider is not stripe, then an error indicating so is thrown', async () => {
    const mockedInvoice = getInvoice();
    const encryptedToken = jwt.sign(
      {
        invoiceId: mockedInvoice.id,
        customerId: mockedInvoice.customer,
        provider: 'other',
      },
      config.JWT_SECRET,
    );
    const mockedCryptoInvoiceWebhook = getCryptoInvoiceWebhook({
      foreignId: mockedInvoice.id,
      token: encryptedToken,
    });

    const response = await app.inject({
      method: 'POST',
      path: '/webhook/crypto',
      body: mockedCryptoInvoiceWebhook,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toStrictEqual(
      `The provider for the invoice with ID ${mockedInvoice.id} and foreign Id ${mockedCryptoInvoiceWebhook.foreignId} for customer Id ${mockedInvoice.customer as string} is not Stripe.`,
    );
  });

  test('When the status of the invoice is different to paid, then returns nothing happens and a 200 is returned', async () => {
    const mockedInvoice = getInvoice();
    const encryptedToken = jwt.sign(
      {
        invoiceId: mockedInvoice.id,
        customerId: mockedInvoice.customer,
        provider: 'stripe',
      },
      config.JWT_SECRET,
    );
    const mockedInvoiceWebhook = getCryptoInvoiceWebhook({
      foreignId: mockedInvoice.id,
      token: encryptedToken,
      status: 'pending',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/crypto',
      payload: mockedInvoiceWebhook,
    });

    expect(response.statusCode).toBe(200);
  });

  test('when the customer is deleted, then an error indicating so is thrown', async () => {
    const mockedCustomer = getCustomer();
    const mockedInvoice = getInvoice({
      customer: mockedCustomer.id,
    });
    const encryptedToken = jwt.sign(
      {
        invoiceId: mockedInvoice.id,
        customerId: mockedInvoice.customer,
        provider: 'stripe',
      },
      config.JWT_SECRET,
    );
    const mockedCryptoInvoiceWebhook = getCryptoInvoiceWebhook({
      foreignId: mockedInvoice.id,
      token: encryptedToken,
    });
    jest.spyOn(PaymentService.prototype, 'getCustomer').mockResolvedValue({
      deleted: true,
      ...mockedCustomer,
    } as any);

    const response = await app.inject({
      method: 'POST',
      path: '/webhook/crypto',
      body: mockedCryptoInvoiceWebhook,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toStrictEqual(`Customer with ID ${mockedCustomer.id} is deleted`);
  });

  test('When all is correct, then the handler is executed to apply the features to the user', async () => {
    const mockedCustomer = getCustomer();
    const mockedInvoice = getInvoice({
      status: 'paid',
      customer: mockedCustomer.id,
    });
    const encryptedToken = jwt.sign(
      {
        invoiceId: mockedInvoice.id,
        customerId: mockedInvoice.customer,
        provider: 'stripe',
      },
      config.JWT_SECRET,
    );
    const mockedCryptoInvoiceWebhook = getCryptoInvoiceWebhook({
      foreignId: mockedInvoice.id,
      token: encryptedToken,
    });

    jest
      .spyOn(PaymentService.prototype, 'getCustomer')
      .mockResolvedValue(mockedCustomer as Stripe.Response<Stripe.Customer>);
    jest
      .spyOn(PaymentService.prototype, 'getInvoice')
      .mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);

    const runSpy = jest.spyOn(InvoiceCompletedHandler.prototype, 'run').mockResolvedValue();

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/crypto',
      body: mockedCryptoInvoiceWebhook,
    });

    expect(response.statusCode).toBe(200);
    expect(runSpy).toHaveBeenCalledWith({
      invoice: mockedInvoice,
      customer: mockedCustomer,
      status: 'paid',
    });
  });
});
