import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getInvoices, getProduct, getUser, getValidAuthToken, getValidUserToken } from '../fixtures';
import { PaymentService } from '../../../src/services/payment.service';
import Stripe from 'stripe';

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('Object Storage controller', () => {
  describe('Get invoices', () => {
    describe('Handling errors', () => {
      it('When there is no customer Id, then an error indicating so is thrown', async () => {
        const token = getValidAuthToken('invalid-customer-id');

        const response = await app.inject({
          method: 'GET',
          path: '/object-storage/invoices',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(response.statusCode).toBe(401);
      });

      it('When something goes wrong while fetching invoices, then an error indicating so is thrown', async () => {
        const unexpectedError = new Error('Unexpected error');
        const mockedUser = getUser();
        const token = getValidUserToken(mockedUser.customerId);
        jest.spyOn(PaymentService.prototype, 'getInvoicesFromUser').mockRejectedValue(unexpectedError);

        const response = await app.inject({
          method: 'GET',
          path: '/object-storage/invoices',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(response.statusCode).toBe(500);
      });
    });

    it('When the user has no invoices, then an empty array is returned', async () => {
      const mockedUser = getUser();
      const token = getValidUserToken(mockedUser.customerId);
      jest.spyOn(PaymentService.prototype, 'getInvoicesFromUser').mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        path: '/object-storage/invoices',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual([]);
    });

    it('When the user has object storage invoices, then the invoices are returned', async () => {
      const mockedUser = getUser();
      const token = getValidUserToken(mockedUser.customerId);
      const mockedProduct = getProduct({
        params: {
          metadata: {
            type: 'object-storage',
          },
        },
      });
      const mockedInvoices = getInvoices(4, [
        {
          customer: mockedUser.customerId,
          lines: {
            data: [
              {
                price: {
                  product: mockedProduct.id,
                },
              },
            ],
          },
        },
        {
          customer: mockedUser.customerId,
          lines: {
            data: [
              {
                price: {
                  product: mockedProduct.id,
                },
              },
            ],
          },
        },
        {
          customer: mockedUser.customerId,
        },
        {
          customer: mockedUser.customerId,
        },
      ]);

      const getInvoicesSpy = jest
        .spyOn(PaymentService.prototype, 'getInvoicesFromUser')
        .mockResolvedValue(mockedInvoices);
      jest
        .spyOn(PaymentService.prototype, 'getProduct')
        .mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);

      const response = await app.inject({
        method: 'GET',
        path: '/object-storage/invoices',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(getInvoicesSpy).toHaveBeenCalledWith(mockedUser.customerId, {});
      expect(responseBody).toHaveLength(2);
      expect(responseBody[0].product).toBe(mockedProduct.id);
    });

    it('When the user has no object invoices invoices, then no invoices are returned', async () => {
      const mockedUser = getUser();
      const token = getValidUserToken(mockedUser.customerId);
      const mockedProduct = getProduct({});
      const mockedInvoices = getInvoices(3, [
        {
          customer: mockedUser.customerId,
        },
        {
          customer: mockedUser.customerId,
        },
        {
          customer: mockedUser.customerId,
        },
      ]);

      const getInvoicesSpy = jest
        .spyOn(PaymentService.prototype, 'getInvoicesFromUser')
        .mockResolvedValue(mockedInvoices);
      jest
        .spyOn(PaymentService.prototype, 'getProduct')
        .mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);

      const response = await app.inject({
        method: 'GET',
        path: '/object-storage/invoices',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(getInvoicesSpy).toHaveBeenCalledWith(mockedUser.customerId, {});
      expect(responseBody).toHaveLength(0);
    });
  });
});
