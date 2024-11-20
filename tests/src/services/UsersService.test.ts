import axios from 'axios';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';

import { PaymentService } from '../../../src/services/payment.service';
import { StorageService } from '../../../src/services/storage.service';
import { UsersService } from '../../../src/services/users.service';
import config from '../../../src/config';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';

let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;

beforeEach(() => {
  usersRepository = {} as UsersRepository;
  displayBillingRepository = {} as DisplayBillingRepository;
  couponsRepository = {} as CouponsRepository;
  usersCouponsRepository = {} as UsersCouponsRepository;
  storageService = new StorageService(config, axios);
  productsRepository = {} as ProductsRepository;
  paymentService = new PaymentService(
    new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
    productsRepository,
    usersRepository,
  );

  usersService = new UsersService(
    usersRepository,
    paymentService,
    displayBillingRepository,
    couponsRepository,
    usersCouponsRepository,
    config,
    axios,
  );
});

// TODO: Move to fixtures
const voidPromise = () => Promise.resolve();
const customerId = 'cId';
const teamsSubscriptions = [
  {
    id: randomUUID(),
    metadata: {
      is_teams: '1',
    },
  },
];

const individualSubscriptions = [
  {
    id: randomUUID(),
    metadata: {
      is_teams: 0,
    },
  },
];

describe('UsersService tests', () => {
  describe('Cancelling individual subscriptions', () => {
    it('Retrieve the active subscriptions', async () => {
      const getSubscriptionsSpy = jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockImplementation(() => Promise.resolve(individualSubscriptions as unknown as Stripe.Subscription[]));
      jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await usersService.cancelUserIndividualSubscriptions(customerId);

      expect(getSubscriptionsSpy).toHaveBeenCalledWith(customerId);
    });

    it('Cancel the user individual subscriptions', async () => {
      const subscriptions = [...individualSubscriptions, ...teamsSubscriptions];
      jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockImplementation(() => Promise.resolve(subscriptions as unknown as Stripe.Subscription[]));
      const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);
      jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await usersService.cancelUserIndividualSubscriptions(customerId);

      expect(cancelSubscriptionSpy).toHaveBeenCalledTimes(subscriptions.length);

      individualSubscriptions.forEach((s, index) => {
        expect(cancelSubscriptionSpy).toHaveBeenNthCalledWith(index + 1, s.id);
      });
    });
  });
});
