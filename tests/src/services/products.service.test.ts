import Stripe from 'stripe';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { PaymentService } from '../../../src/services/payment.service';
import { StorageService } from '../../../src/services/storage.service';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { getUser, newTier } from '../fixtures';
import testFactory from '../utils/factory';
import config from '../../../src/config';
import axios from 'axios';
import { ProductsService } from '../../../src/services/products.service';
import { UserType } from '../../../src/core/users/User';
import { Service } from '../../../src/core/users/Tier';

let tiersService: TiersService;
let paymentsService: PaymentService;
let tiersRepository: TiersRepository;
let paymentService: PaymentService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let usersTiersRepository: UsersTiersRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
let storageService: StorageService;
let productsService: ProductsService;

describe('Products Service Tests', () => {
  beforeEach(() => {
    tiersRepository = testFactory.getTiersRepository();
    usersRepository = testFactory.getUsersRepositoryForTest();
    paymentsService = new PaymentService(
      new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
      productsRepository,
      bit2MeService,
    );
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    usersTiersRepository = testFactory.getUsersTiersRepository();
    productsRepository = testFactory.getProductsRepositoryForTest();
    usersTiersRepository = testFactory.getUsersTiersRepository();
    bit2MeService = new Bit2MeService(config, axios);
    paymentService = new PaymentService(
      new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
      productsRepository,
      bit2MeService,
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
    storageService = new StorageService(config, axios);
    tiersService = new TiersService(
      usersService,
      paymentService,
      tiersRepository,
      usersTiersRepository,
      storageService,
      config,
    );

    productsService = new ProductsService(tiersService, usersService);
  });

  describe('Finding the higher tier for a user', () => {
    it('When the subscription type is not Individual or Business, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      await expect(
        productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          subscriptionType: UserType.ObjectStorage,
        }),
      ).rejects.toThrow(TierNotFoundError);
    });

    describe('When the subscription type is individual', () => {
      it('When the user has a lifetime subscription, then the higher tier is returned', async () => {
        const mockedUser = getUser({
          lifetime: true,
        });
        const mockedTier = newTier();
        mockedTier.billingType = 'lifetime';

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);

        const result = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          subscriptionType: UserType.Individual,
        });

        expect(result).toStrictEqual(mockedTier);
        expect(result.billingType).toStrictEqual('lifetime');
      });

      it('When the user has a subscription, then the higher tier is returned', async () => {
        const mockedUser = getUser();
        const mockedTier = newTier();
        const mockedBusinessTier = newTier();
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.enabled = true;

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier, mockedBusinessTier]);

        const result = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          subscriptionType: UserType.Individual,
        });

        expect(result).toStrictEqual(mockedTier);
        expect(result.billingType).toStrictEqual('subscription');
      });
    });

    describe('When the subscription type is business', () => {
      it('When the user has only one owner Id, then the this subscription tier is returned', async () => {
        const mockedUser = getUser();
        const mockedTier = newTier();
        const mockedBusinessTier = newTier();
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.enabled = true;

        jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier, mockedBusinessTier]);

        const result = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          ownersId: [mockedUser.uuid],
          subscriptionType: UserType.Business,
        });

        expect(result).toStrictEqual(mockedBusinessTier);
        expect(result.billingType).toStrictEqual('subscription');
      });

      it('When the user has multiple owner Ids, then the highest tier is returned', async () => {
        const mockedUser = getUser();
        const mockedOwner = getUser();
        const mockedTier = newTier();
        const mockedBusinessTier = newTier();
        const mockedBusinessTier2 = newTier();

        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.enabled = true;
        mockedBusinessTier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat = 1000000;
        mockedBusinessTier2.featuresPerService[Service.Drive].workspaces.enabled = true;
        mockedBusinessTier2.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat = 2000000;

        jest.spyOn(usersService, 'findUserByUuid').mockImplementation(async (uuid: string) => {
          if (uuid === mockedUser.uuid) return mockedUser;
          if (uuid === mockedOwner.uuid) return mockedOwner;
          throw new UserNotFoundError(`User with uuid ${uuid} not found`);
        });
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockImplementation(async (ownerId: string) => {
          if (ownerId === mockedUser.id) {
            return [mockedTier, mockedBusinessTier];
          }
          if (ownerId === mockedOwner.id) {
            return [mockedTier, mockedBusinessTier2];
          }
          return [];
        });

        const result = await productsService.getApplicableTierForUser({
          userUuid: mockedUser.uuid,
          ownersId: [mockedUser.uuid, mockedOwner.uuid],
          subscriptionType: UserType.Business,
        });

        expect(result).toStrictEqual(mockedBusinessTier2);
        expect(result.billingType).toStrictEqual('subscription');
      });
    });
  });
});
