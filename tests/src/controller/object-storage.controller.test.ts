import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getCreateSubscriptionResponse, getCustomer, getUser, getValidUserToken, voidPromise } from '../fixtures';
import { CustomerNotFoundError, PaymentService } from '../../../src/services/payment.service';
import config from '../../../src/config';

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
  describe('Create customer', () => {
    it('When the user exists, then its ID is returned with the user token', async () => {
      const mockCustomer = getCustomer();
      const getCustomerIdSpy = jest
        .spyOn(PaymentService.prototype, 'getCustomerIdByEmail')
        .mockResolvedValue(mockCustomer);

      const response = await app.inject({
        method: 'GET',
        path: '/object-storage/customer',
        query: {
          customerName: mockCustomer.name as string,
          email: mockCustomer.email as string,
          country: mockCustomer.address?.country as string,
          postalCode: mockCustomer.address?.postal_code as string,
        },
      });

      const responseBody = response.json();
      const decodedToken = jwt.verify(responseBody.token, config.JWT_SECRET) as { customerId: string };

      expect(response.statusCode).toBe(200);
      expect(responseBody.customerId).toBe(mockCustomer.id);
      expect(responseBody.token).toBeDefined();
      expect(getCustomerIdSpy).toHaveBeenCalledWith(mockCustomer.email);
      expect(decodedToken.customerId).toBe(mockCustomer.id);
    });

    it('When the email is missing, then an error indicating so is thrown', async () => {
      const mockedCustomer = getCustomer();

      const response = await app.inject({
        method: 'GET',
        path: '/object-storage/customer',
        query: {
          customerName: mockedCustomer.name as string,
          country: mockedCustomer.address?.country as string,
          postalCode: mockedCustomer.address?.postal_code as string,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('When the user does not exists, then a new one is created and the customer Id and token are provided', async () => {
      const mockedCustomer = getCustomer();
      jest
        .spyOn(PaymentService.prototype, 'getCustomerIdByEmail')
        .mockRejectedValue(new CustomerNotFoundError('Customer not found'));
      const createdCustomerSpy = jest
        .spyOn(PaymentService.prototype, 'createCustomer')
        .mockResolvedValue(mockedCustomer);

      const response = await app.inject({
        method: 'GET',
        path: '/object-storage/customer',
        query: {
          customerName: mockedCustomer.name as string,
          email: mockedCustomer.email as string,
          country: mockedCustomer.address?.country as string,
          postalCode: mockedCustomer.address?.postal_code as string,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody.customerId).toBe(mockedCustomer.id);
      expect(responseBody.token).toBeDefined();
      expect(createdCustomerSpy).toHaveBeenCalledWith({
        name: mockedCustomer.name,
        email: mockedCustomer.email,
        address: {
          postal_code: mockedCustomer.address?.postal_code,
          country: mockedCustomer.address?.country,
        },
      });

      const decodedToken = jwt.verify(responseBody.token, config.JWT_SECRET) as { customerId: string };
      expect(decodedToken.customerId).toBe(mockedCustomer.id);
    });

    it('When there is an unexpected error while getting the existing user, then an error indicating so is thrown', async () => {
      const mockedCustomer = getCustomer();
      const unexpectedError = new Error('Random error');
      jest.spyOn(PaymentService.prototype, 'getCustomerIdByEmail').mockRejectedValue(unexpectedError);

      const response = await app.inject({
        method: 'GET',
        path: '/object-storage/customer',
        query: {
          customerName: mockedCustomer.name as string,
          email: mockedCustomer.email as string,
          country: mockedCustomer.address?.country as string,
          postalCode: mockedCustomer.address?.postal_code as string,
        },
      });

      expect(response.statusCode).toBe(500);
    });

    it('When the country and the tax Id are provided and is new customer, then the tax Id is attached to the customer', async () => {
      const mockedCustomer = getCustomer();
      const companyVatId = 'ES123456789';
      jest
        .spyOn(PaymentService.prototype, 'getCustomerIdByEmail')
        .mockRejectedValue(new CustomerNotFoundError('Customer not found'));
      jest.spyOn(PaymentService.prototype, 'createCustomer').mockResolvedValue(mockedCustomer);
      const attachVatIdSpy = jest
        .spyOn(PaymentService.prototype, 'getVatIdAndAttachTaxIdToCustomer')
        .mockImplementation(voidPromise);

      const response = await app.inject({
        method: 'GET',
        path: '/object-storage/customer',
        query: {
          customerName: mockedCustomer.name as string,
          email: mockedCustomer.email as string,
          country: mockedCustomer.address?.country as string,
          postalCode: mockedCustomer.address?.postal_code as string,
          companyVatId,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual({
        customerId: mockedCustomer.id,
        token: jwt.sign({ customerId: mockedCustomer.id }, config.JWT_SECRET),
      });
      expect(attachVatIdSpy).toHaveBeenCalled();
      expect(attachVatIdSpy).toHaveBeenCalledWith(mockedCustomer.id, mockedCustomer.address?.country, companyVatId);
    });
  });

  describe('Create subscription', () => {
    it('When the user wants to create a sub for object storage, then the subscription is created successfully with the additional taxes', async () => {
      const mockedUser = getUser();
      const token = getValidUserToken(mockedUser.customerId);
      const subResponse = getCreateSubscriptionResponse();

      const createSubscriptionSpy = jest
        .spyOn(PaymentService.prototype, 'createSubscription')
        .mockResolvedValue(subResponse);

      const body = {
        customerId: mockedUser.customerId,
        priceId: 'price_id',
        token,
      };

      const response = await app.inject({
        method: 'POST',
        path: '/object-storage/subscription',
        body,
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(subResponse);
      expect(createSubscriptionSpy).toHaveBeenCalledWith({
        customerId: mockedUser.customerId,
        priceId: 'price_id',
        additionalOptions: {
          automatic_tax: {
            enabled: true,
          },
        },
      });
    });

    it('When the user wants to create a subscription with promotional code, then the promotional code is applied', async () => {
      const mockedUser = getUser();
      const token = getValidUserToken(mockedUser.customerId);
      const promoCodeName = 'obj-sotrage-promo-code-name';
      const subResponse = getCreateSubscriptionResponse();

      const createSubscriptionSpy = jest
        .spyOn(PaymentService.prototype, 'createSubscription')
        .mockResolvedValue(subResponse);

      const body = {
        customerId: mockedUser.customerId,
        priceId: 'price_id',
        token,
        promoCodeId: promoCodeName,
      };

      const response = await app.inject({
        method: 'POST',
        path: '/object-storage/subscription',
        body,
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(createSubscriptionSpy).toHaveBeenCalledWith({
        customerId: mockedUser.customerId,
        priceId: 'price_id',
        promoCodeId: promoCodeName,
        additionalOptions: {
          automatic_tax: {
            enabled: true,
          },
        },
      });
      expect(responseBody).toStrictEqual(subResponse);
    });

    it('When the user token is not provided, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const subResponse = getCreateSubscriptionResponse();

      jest.spyOn(PaymentService.prototype, 'createSubscription').mockResolvedValue(subResponse);

      const body = {
        customerId: mockedUser.customerId,
        priceId: 'price_id',
      };

      const response = await app.inject({
        method: 'POST',
        path: '/object-storage/subscription',
        body,
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
