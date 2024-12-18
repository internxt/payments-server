import axios from 'axios';
import Stripe from 'stripe';

import testFactory from '../utils/factory';
import config from '../../../src/config';
import getMocks from '../mocks';
import { TiersService } from '../../../src/services/tiers.service';
import { UsersService } from '../../../src/services/users.service';
import { Service, TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { PaymentService } from '../../../src/services/payment.service';
import { StorageService } from '../../../src/services/storage.service';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';

let tiersService: TiersService;
let paymentsService: PaymentService;
let tiersRepository: TiersRepository;
let paymentService: PaymentService;
let storageService: StorageService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
const mocks = getMocks();

describe('TiersService tests', () => {
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
    storageService = new StorageService(config, axios);
    productsRepository = testFactory.getProductsRepositoryForTest();
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
    tiersService = new TiersService(usersService, tiersRepository, config);
  });

  describe('applyTier()', () => {
    it('When applying the tier, it should fail if the tier is not found', async () => {
      const user = mocks.mockedUserWithLifetime;
      const productId = 'productId';

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(null));

      await expect(tiersService.applyTier({ ...user, email: 'fake email' }, productId))
        .rejects
        .toThrow(new Error(`Tier for product ${productId} not found`));

      expect(findTierByProductId).toHaveBeenCalledWith(productId);
    });

    it('When applying the tier, it should skip not enabled features', async () => {
      const user = mocks.mockedUserWithLifetime;
      const tier = mocks.newTier();
      const { productId } = tier;
      tier.featuresPerService[Service.Drive].enabled = false;
      tier.featuresPerService[Service.Vpn].enabled = false;

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(tier));
      const applyDriveFeatures = jest.spyOn(tiersService, 'applyDriveFeatures')
        .mockImplementation(() => Promise.resolve());
      const applyVpnFeatures = jest.spyOn(tiersService, 'applyVpnFeatures')
        .mockImplementation(() => Promise.resolve());

      await tiersService.applyTier({ ...user, email: 'fake email' }, productId);

      expect(findTierByProductId).toHaveBeenCalledWith(productId);
      expect(applyDriveFeatures).not.toHaveBeenCalled();
      expect(applyVpnFeatures).not.toHaveBeenCalled();
    });

    it('When applying the tier, it should apply enabled features', async () => {
      const user = mocks.mockedUserWithLifetime;
      const tier = mocks.newTier();
      const userWithEmail = { ...user, email: 'fake email' };
      const { productId } = tier;
      tier.featuresPerService[Service.Drive].enabled = true;

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(tier));
      const applyDriveFeatures = jest.spyOn(tiersService, 'applyDriveFeatures')
        .mockImplementation(() => Promise.resolve());

      await tiersService.applyTier(userWithEmail, productId);

      expect(findTierByProductId).toHaveBeenCalledWith(productId);
      expect(applyDriveFeatures).toHaveBeenCalledWith(userWithEmail, tier);
    });
  });
});
