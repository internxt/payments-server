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
import { TiersService } from '../../../src/services/tiers.service';
import { UserNotFoundError, UsersService } from '../../../src/services/users.service';
import { getUser, newTier } from '../fixtures';
import testFactory from '../utils/factory';
import config from '../../../src/config';
import axios from 'axios';
import { ProductsService } from '../../../src/services/products.service';

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

  describe('Finding the applicable tier for a user (feature merging approach)', () => {
    it('When the user has no tiers, then the free tier is returned', async () => {
      const mockedUser = getUser();
      const freeTier = newTier({
        id: 'free',
        label: 'free',
        productId: 'free',
      });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([]);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(freeTier);

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(result).toStrictEqual(freeTier);
    });

    it('When the user has a lifetime subscription, the lifetime tier is returned', async () => {
      const mockedUser = getUser({ lifetime: true });
      const regularTier = newTier();
      const lifetimeTier = newTier({ billingType: 'lifetime' });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([regularTier, lifetimeTier]);

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(result).toStrictEqual(lifetimeTier);
      expect(result.billingType).toStrictEqual('lifetime');
    });

    it('When the user has only individual tiers, the best individual tier is returned', async () => {
      const mockedUser = getUser();
      const basicTier = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 1000000,
            workspaces: {
              enabled: false,
              minimumSeats: 0,
              maximumSeats: 0,
              maxSpaceBytesPerSeat: 0,
            },
          },
        },
      });
      const premiumTier = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 5000000,
            workspaces: {
              enabled: false,
              minimumSeats: 0,
              maximumSeats: 0,
              maxSpaceBytesPerSeat: 0,
            },
          },
        },
      });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([basicTier, premiumTier]);

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(result).toStrictEqual(premiumTier);
    });

    it('When the user has both individual and business tiers, the business tier is preferred for drive', async () => {
      const mockedUser = getUser();
      const individualTier = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 5000000,
            workspaces: {
              enabled: false,
              minimumSeats: 0,
              maximumSeats: 0,
              maxSpaceBytesPerSeat: 0,
            },
          },
        },
      });
      const businessTier = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 1000000,
            workspaces: {
              enabled: true,
              minimumSeats: 3,
              maximumSeats: 50,
              maxSpaceBytesPerSeat: 2000000,
            },
          },
        },
      });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([individualTier, businessTier]);

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(result).toStrictEqual(businessTier);
    });

    it('When the user has access to multiple business tiers via ownersId, the highest workspace tier is returned', async () => {
      const mockedUser = getUser();
      const mockedOwner = getUser();
      const businessTier1 = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 1000000,
            workspaces: {
              enabled: true,
              minimumSeats: 3,
              maximumSeats: 50,
              maxSpaceBytesPerSeat: 1000000,
            },
          },
        },
      });
      const businessTier2 = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 1000000,
            workspaces: {
              enabled: true,
              minimumSeats: 3,
              maximumSeats: 100,
              maxSpaceBytesPerSeat: 2000000,
            },
          },
        },
      });

      jest.spyOn(usersService, 'findUserByUuid').mockImplementation(async (uuid: string) => {
        if (uuid === mockedUser.uuid) return mockedUser;
        if (uuid === mockedOwner.uuid) return mockedOwner;
        throw new UserNotFoundError(`User with uuid ${uuid} not found`);
      });
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockImplementation(async (ownerId: string) => {
        if (ownerId === mockedUser.id) return [businessTier1];
        if (ownerId === mockedOwner.id) return [businessTier2];
        return [];
      });

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
        ownersId: [mockedUser.uuid, mockedOwner.uuid],
      });

      expect(result).toStrictEqual(businessTier2);
    });
  });
});
