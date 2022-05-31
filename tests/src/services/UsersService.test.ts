import axios from 'axios';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';

import { FREE_PLAN_BYTES_SPACE } from '../../../src/constants';
import { PaymentService } from '../../../src/services/PaymentService';
import { StorageService } from '../../../src/services/StorageService';
import { UsersService } from '../../../src/services/UsersService';
import config from '../../../src/config';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { MongoDBUsersRepository } from '../../../src/core/users/MongoDBUsersRepository';

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;

beforeEach(() => {
  paymentService = new PaymentService(
    new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' })
  );
  usersRepository = new MongoDBUsersRepository({} as any);
  storageService = new StorageService(config, axios);
  usersService = new UsersService(
    usersRepository, paymentService, storageService
  );
});

// TODO: Move to fixtures
const voidPromise = async () => { ; };
const uuid = 'uuid';
const customerId = 'cId';
const teamsSubscriptions = [
  {
    id: randomUUID(),
    items: {
      data: [
        {
          price: {
            metadata: {
              is_teams: 1
            }
          }
        }
      ]
    }
  }
];

const individualSubscriptions = [
  {
    id: randomUUID(),
    items: {
      data: [
        {
          price: {
            metadata: {
              is_teams: 0
            }
          }
        }
      ]
    }
  }
];

describe('UsersService tests', () => {
  describe('Cancelling individual subscriptions', () => {
    it('Look for the user', async () => {
      const findUserSpy = jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue({ uuid, customerId });
      jest.spyOn(paymentService, 'getActiveSubscriptions').mockImplementation(() => Promise.resolve([]));

      await usersService.cancelUserIndividualSubscriptions(uuid).catch((err) => {
        //
      });

      expect(findUserSpy).toHaveBeenCalledWith(uuid);
    });

    it('Retrieve the active subscriptions', async () => {
      const getSubscriptionsSpy = jest.spyOn(paymentService, 'getActiveSubscriptions')
        .mockImplementation(() => Promise.resolve(individualSubscriptions as unknown as Stripe.Subscription[]));
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue({ uuid, customerId });
      jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await usersService.cancelUserIndividualSubscriptions(uuid);

      expect(getSubscriptionsSpy).toHaveBeenCalledWith(customerId);
    });

    it('Cancel the user individual subscriptions', async () => {
      const subscriptions = [...individualSubscriptions, ...teamsSubscriptions];
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue({ uuid, customerId });
      jest.spyOn(paymentService, 'getActiveSubscriptions')
        .mockImplementation(() => Promise.resolve(subscriptions as unknown as Stripe.Subscription[]));
      const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await usersService.cancelUserIndividualSubscriptions(uuid);

      expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(individualSubscriptions.length);

      individualSubscriptions.forEach((s, index) => {
        expect(cancelSubscriptionSpy).toHaveBeenNthCalledWith(index + 1, s.id);
      });
    });

    it('Change the user storage', async () => {
      const subscriptions = [...individualSubscriptions, ...teamsSubscriptions];
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue({ uuid, customerId });
      jest.spyOn(paymentService, 'getActiveSubscriptions')
        .mockImplementation(() => Promise.resolve(subscriptions as unknown as Stripe.Subscription[]));
      jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);
      const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await usersService.cancelUserIndividualSubscriptions(uuid);

      expect(changeStorageSpy).toHaveBeenCalledWith(uuid, FREE_PLAN_BYTES_SPACE);
    });
  });
});
