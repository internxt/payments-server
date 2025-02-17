import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/loadTestApp';

import { PaymentService } from '../../../src/services/payment.service';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import { getUser, getUserSubscription, getValidToken, newTier } from '../fixtures';

let app: FastifyInstance;

const paymentService = PaymentService.prototype;
const usersService = UsersService.prototype;
const tiersService = TiersService.prototype;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

const prefix = '/products';

describe('Products controller e2e tests', () => {
  describe('Get user products depending on his tier', () => {
    it('When the user has an active subscription, then it returns the tier products using the subscription productId', async () => {
      const mockedUser = getUser();
      const mockedUserSubscription = getUserSubscription({ type: 'subscription' });
      const mockedTier = newTier();
      const jwt = getValidToken(mockedUser.uuid);
      const productId = mockedUserSubscription.type === 'subscription' && mockedUserSubscription.plan.productId;

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue(mockedUserSubscription);

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);

      const response = await app.inject({
        method: 'GET',
        path: prefix,
        headers: { authorization: `Bearer ${jwt}` },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockedTier);
      expect(tiersService.getTierProductsByProductsId).toHaveBeenCalledWith(productId, 'subscription');
    });

    it('When the user has a lifetime subscription, then it returns the tier products using the lifetime productId', async () => {
      const mockedUser = getUser();
      const mockedTier = newTier({ billingType: 'lifetime' });
      const mockedProductId = 'lifetime-product-id';
      const jwt = getValidToken(mockedUser.uuid);

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue({
        type: 'lifetime',
      });

      jest.spyOn(paymentService, 'fetchUserLifetimeProductId').mockResolvedValue(mockedProductId);

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);

      const response = await app.inject({
        method: 'GET',
        path: prefix,
        headers: { authorization: `Bearer ${jwt}` },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockedTier);
      expect(tiersService.getTierProductsByProductsId).toHaveBeenCalledWith(mockedProductId, 'lifetime');
    });

    it('When the user does not have a subscription or lifetime plan, then an error indicating so is thrown', async () => {
      const mockedUserSubscription = getUserSubscription({ type: 'free' });
      const mockedUser = getUser();
      const jwt = getValidToken(mockedUser.uuid);

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);

      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue(mockedUserSubscription);

      const response = await app.inject({
        method: 'GET',
        path: prefix,
        headers: { authorization: `Bearer ${jwt}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('When the user does not exist, then an error indicating so is thrown', async () => {
      const mockedUserNotFoundError = new UserNotFoundError('User not found');
      const mockedUser = getUser();
      const jwt = getValidToken(mockedUser.uuid);
      jest.spyOn(usersService, 'findUserByUuid').mockRejectedValue(mockedUserNotFoundError);

      const response = await app.inject({
        method: 'GET',
        path: prefix,
        headers: { authorization: `Bearer ${jwt}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('When a Tier is not found, then an error indicating so is thrown', async () => {
      const tierNotFoundError = new TierNotFoundError('invalid-product-id');
      const mockedUserSubscription = getUserSubscription();
      const mockedUser = getUser();
      const jwt = getValidToken(mockedUser.uuid);

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(paymentService, 'getUserSubscription').mockResolvedValue(mockedUserSubscription);

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(tierNotFoundError);

      const response = await app.inject({
        method: 'GET',
        path: prefix,
        headers: { authorization: `Bearer ${jwt}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('When an unexpected error occurs, then an error indicating so is thrown', async () => {
      const randomError = new Error('Unexpected error');
      const mockedUser = getUser();
      const jwt = getValidToken(mockedUser.uuid);

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);

      jest.spyOn(paymentService, 'getUserSubscription').mockRejectedValue(randomError);

      const response = await app.inject({
        method: 'GET',
        path: prefix,
        headers: { authorization: `Bearer ${jwt}` },
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
