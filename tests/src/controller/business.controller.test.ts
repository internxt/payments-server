import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { getCreatedSubscription, getUser, getValidAuthToken, newTier } from '../fixtures';
import { UsersService } from '../../../src/services/users.service';
import { PaymentService } from '../../../src/services/payment.service';
import Stripe from 'stripe';
import { TiersService } from '../../../src/services/tiers.service';
import { Service } from '../../../src/core/users/Tier';

let app: FastifyInstance;

beforeAll(async () => {
  app = await initializeServerAndDatabase();
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Testing business endpoints', () => {
  describe('Updating business subscription', () => {
    test('When the business is updated, then the Stripe subscription is updated and the workspace in Drive too', async () => {
      const mockedUser = getUser();
      const mockedTier = newTier();
      const mockedSubscription = getCreatedSubscription();
      const mockedUserToken = getValidAuthToken(mockedUser.uuid);
      const mockedMaxSpaceBytes = mockedSubscription.items.data[0].price.metadata.maxSpaceBytes;
      jest.spyOn(UsersService.prototype, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest
        .spyOn(PaymentService.prototype, 'getSubscriptionById')
        .mockResolvedValueOnce(mockedSubscription as Stripe.Response<Stripe.Subscription>);
      jest.spyOn(PaymentService.prototype, 'getBusinessSubscriptionSeats').mockResolvedValue({
        minimumSeats: '3',
        maximumSeats: '10',
      });
      jest.spyOn(UsersService.prototype, 'isWorkspaceUpgradeAllowed').mockResolvedValue(true);
      jest
        .spyOn(PaymentService.prototype, 'updateBusinessSub')
        .mockResolvedValueOnce(mockedSubscription as Stripe.Response<Stripe.Subscription>);
      jest.spyOn(TiersService.prototype, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      const updateWorkspaceSpy = jest.spyOn(UsersService.prototype, 'updateWorkspace').mockResolvedValue();

      const response = await app.inject({
        path: `/business/subscription`,
        method: 'PATCH',
        body: {
          workspaceId: 'workspace_id',
          subscriptionId: mockedSubscription.id,
          workspaceUpdatedSeats: 4,
        },
        headers: {
          Authorization: `Bearer ${mockedUserToken}`,
        },
      });

      const responseBody = response.json();

      expect(response.statusCode).toBe(200);
      expect(responseBody).toStrictEqual(mockedSubscription);
      expect(updateWorkspaceSpy).toHaveBeenCalledWith({
        ownerId: mockedUser.uuid,
        tierId: mockedTier.featuresPerService[Service.Drive].foreignTierId,
        maxSpaceBytes: Number(mockedMaxSpaceBytes),
        seats: 4,
      });
    });
  });
});
