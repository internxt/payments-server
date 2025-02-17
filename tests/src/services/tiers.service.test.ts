import axios from 'axios';
import Stripe from 'stripe';

import testFactory from '../utils/factory';
import config from '../../../src/config';
import getMocks from '../mocks';
import {
  ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS,
  TierNotFoundError,
  TiersService,
} from '../../../src/services/tiers.service';
import { UsersService } from '../../../src/services/users.service';
import { Service, TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import {
  CustomerId,
  ExtendedSubscription,
  NotFoundSubscriptionError,
  PaymentService,
} from '../../../src/services/payment.service';
import { createOrUpdateUser, updateUserTier } from '../../../src/services/storage.service';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { newTier } from '../fixtures';

let tiersService: TiersService;
let paymentsService: PaymentService;
let tiersRepository: TiersRepository;
let paymentService: PaymentService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;
const mocks = getMocks();

jest
  .spyOn(require('../../../src/services/storage.service'), 'createOrUpdateUser')
  .mockImplementation(() => Promise.resolve() as any);
jest
  .spyOn(require('../../../src/services/storage.service'), 'updateUserTier')
  .mockImplementation(() => Promise.resolve() as any);

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
    tiersService = new TiersService(usersService, paymentService, tiersRepository, config);
  });

  describe('Fetch user tier products', () => {
    it('When the product exists, then it returns the corresponding tier', async () => {
      const mockedTier = newTier();
      jest.spyOn(tiersRepository, 'findByProductIdAndBillingType').mockResolvedValue(mockedTier);

      const result = await tiersService.getTierProductsByProductsId(mockedTier.productId, 'subscription');

      expect(result).toEqual(mockedTier);
      expect(tiersRepository.findByProductIdAndBillingType).toHaveBeenCalledWith(mockedTier.productId, 'subscription');
    });

    it('When the product does not exist, then an error indicating so is thrown', async () => {
      const invalidProductId = 'invalid-product-id';

      jest.spyOn(tiersRepository, 'findByProductIdAndBillingType').mockResolvedValue(null);

      await expect(tiersService.getTierProductsByProductsId(invalidProductId, 'subscription')).rejects.toThrow(
        TierNotFoundError,
      );
      expect(tiersRepository.findByProductIdAndBillingType).toHaveBeenCalledWith(invalidProductId, 'subscription');
    });

    it('When an unexpected error occurs, then an error indicating so is thrown', async () => {
      const randomProductId = 'random-product-id';
      jest.spyOn(tiersRepository, 'findByProductIdAndBillingType').mockRejectedValue(new Error('Unexpected error'));

      await expect(tiersService.getTierProductsByProductsId(randomProductId, 'subscription')).rejects.toThrow(Error);

      expect(tiersRepository.findByProductIdAndBillingType).toHaveBeenCalledWith(randomProductId, 'subscription');
    });
  });

  describe('getAntivirusTier()', () => {
    it('When the user has a valid active subscription, then returns antivirus enabled', async () => {
      const customerId: CustomerId = mocks.mockedUserWithLifetime.customerId;
      const activeSubscription = { status: 'active', product: { id: ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS[0] } };

      jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockResolvedValue([activeSubscription as ExtendedSubscription]);

      const antivirusTier = await tiersService.getAntivirusTier(customerId, false);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: true },
      });
    });

    it('When the user has an active subscription but is not eligible for antivirus, then returns antivirus disabled', async () => {
      const customerId: CustomerId = mocks.mockedUserWithLifetime.customerId;
      const activeSubscription = { status: 'active', product: { id: 'some_other_product' } };

      jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockResolvedValue([activeSubscription as ExtendedSubscription]);

      const antivirusTier = await tiersService.getAntivirusTier(customerId, false);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: false },
      });
    });

    it('When the user has no active subscription but has a valid lifetime product, then returns antivirus enabled', async () => {
      const customerId: CustomerId = mocks.mockedUserWithLifetime.customerId;
      const isLifetime = true;

      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([]);
      jest
        .spyOn(paymentService, 'getInvoicesFromUser')
        .mockResolvedValue([
          { lines: { data: [{ price: { product: ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS[0] } }] }, status: 'paid' },
        ] as any);

      const antivirusTier = await tiersService.getAntivirusTier(customerId, isLifetime);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: true },
      });
    });

    it('When the user has no active subscription and is not lifetime, then throws NotFoundSubscriptionError', async () => {
      const customerId: CustomerId = mocks.mockedUserWithLifetime.customerId;

      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([]);

      await expect(tiersService.getAntivirusTier(customerId, false)).rejects.toThrow(
        new NotFoundSubscriptionError('User has no active subscriptions'),
      );
    });

    it('When the user is lifetime but the product is not in the allowed list, then returns antivirus disabled', async () => {
      const customerId: CustomerId = mocks.mockedUserWithLifetime.customerId;
      const isLifetime = true;

      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([]);
      jest
        .spyOn(paymentService, 'getInvoicesFromUser')
        .mockResolvedValue([{ lines: { data: [{ price: { product: 'some_other_product' } }] } }] as any);

      const antivirusTier = await tiersService.getAntivirusTier(customerId, isLifetime);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: false },
      });
    });

    it('When the user has both an active subscription and a valid lifetime product, then returns antivirus enabled', async () => {
      const customerId: CustomerId = mocks.mockedUserWithLifetime.customerId;
      const isLifetime = true;
      const activeSubscription = { status: 'active', product: { id: ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS[0] } };

      jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockResolvedValue([activeSubscription as ExtendedSubscription]);
      jest
        .spyOn(paymentService, 'getInvoicesFromUser')
        .mockResolvedValue([
          { lines: { data: [{ price: { product: ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS[0] } }] } },
        ] as any);

      const antivirusTier = await tiersService.getAntivirusTier(customerId, isLifetime);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: true },
      });
    });
  });

  describe('applyTier()', () => {
    it('When applying the tier, then fails if the tier is not found', async () => {
      const user = mocks.mockedUserWithLifetime;
      const productId = 'productId';

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductIdAndBillingType')
        .mockImplementation(() => Promise.resolve(null));

      await expect(tiersService.applyTier({ ...user, email: 'fake email' }, productId, 'subscription')).rejects.toThrow(
        new TierNotFoundError(productId),
      );

      expect(findTierByProductId).toHaveBeenCalledWith(productId, 'subscription');
    });

    it('When applying the tier, then skips disabled features', async () => {
      const user = mocks.mockedUserWithLifetime;
      const tier = mocks.newTier();
      const { productId } = tier;
      tier.featuresPerService[Service.Drive].enabled = false;
      tier.featuresPerService[Service.Vpn].enabled = false;

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductIdAndBillingType')
        .mockImplementation(() => Promise.resolve(tier));
      const applyDriveFeatures = jest
        .spyOn(tiersService, 'applyDriveFeatures')
        .mockImplementation(() => Promise.resolve());
      const applyVpnFeatures = jest.spyOn(tiersService, 'applyVpnFeatures').mockImplementation(() => Promise.resolve());

      await tiersService.applyTier({ ...user, email: 'fake email' }, productId, 'subscription');

      expect(findTierByProductId).toHaveBeenCalledWith(productId, 'subscription');
      expect(applyDriveFeatures).not.toHaveBeenCalled();
      expect(applyVpnFeatures).not.toHaveBeenCalled();
    });

    it('When applying the tier, then applies enabled features', async () => {
      const user = mocks.mockedUserWithLifetime;
      const tier = mocks.newTier();
      const userWithEmail = { ...user, email: 'fake email' };
      const { productId } = tier;
      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Vpn].enabled = true;

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductIdAndBillingType')
        .mockImplementation(() => Promise.resolve(tier));
      const applyDriveFeatures = jest
        .spyOn(tiersService, 'applyDriveFeatures')
        .mockImplementation(() => Promise.resolve());
      const applyVpnFeatures = jest.spyOn(tiersService, 'applyVpnFeatures').mockImplementation(() => Promise.resolve());

      await tiersService.applyTier(userWithEmail, productId, 'subscription');

      expect(findTierByProductId).toHaveBeenCalledWith(productId, 'subscription');
      expect(applyDriveFeatures).toHaveBeenCalledWith(userWithEmail, tier);
      expect(applyVpnFeatures).toHaveBeenCalledWith(userWithEmail, tier);
    });
  });

  describe('applyDriveFeatures()', () => {
    it('When workspaces is enabled, then it is applied exclusively', async () => {
      const userWithEmail = { ...mocks.mockedUserWithLifetime, email: 'test@internxt.com' };
      const tier = mocks.newTier();

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = true;

      const updateWorkspaceStorage = jest
        .spyOn(usersService, 'updateWorkspaceStorage')
        .mockImplementation(() => Promise.resolve());

      const createOrUpdateUserSpy = jest.fn(createOrUpdateUser).mockImplementation(() => Promise.resolve() as any);

      await tiersService.applyDriveFeatures(userWithEmail, tier);

      expect(updateWorkspaceStorage).toHaveBeenCalledWith(
        userWithEmail.uuid,
        tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat,
        0,
      );

      expect(createOrUpdateUserSpy).not.toHaveBeenCalled();
    });

    it('When workspaces is enabled and the workspace do not exist, then it is initialized', async () => {
      const userWithEmail = { ...mocks.mockedUserWithLifetime, email: 'test@internxt.com' };
      const tier = mocks.newTier();

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = true;

      const updateWorkspaceError = new Error('Workspace does not exist');
      jest.spyOn(usersService, 'updateWorkspaceStorage').mockImplementation(() => Promise.reject(updateWorkspaceError));
      const initializeWorkspace = jest
        .spyOn(usersService, 'initializeWorkspace')
        .mockImplementation(() => Promise.resolve());

      await tiersService.applyDriveFeatures(userWithEmail, tier);

      expect(initializeWorkspace).toHaveBeenCalledWith(userWithEmail.uuid, {
        newStorageBytes: tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat,
        seats: 0,
        address: '',
        phoneNumber: '',
      });
      expect(createOrUpdateUser).not.toHaveBeenCalled();
    });

    it('When workspaces is not enabled, then individual is initialized', async () => {
      const userWithEmail = { ...mocks.mockedUserWithLifetime, email: 'test@internxt.com' };
      const tier = mocks.newTier();

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = false;

      await tiersService.applyDriveFeatures(userWithEmail, tier);

      expect(createOrUpdateUser).toHaveBeenCalledWith(
        tier.featuresPerService[Service.Drive].maxSpaceBytes.toString(),
        userWithEmail.email,
        config,
      );
      expect(updateUserTier).toHaveBeenCalledWith(userWithEmail.uuid, tier.productId, config);
    });
  });

  describe('applyVpnFeatures()', () => {
    it('When it is called, then it does not throw', async () => {
      const userWithEmail = { ...mocks.mockedUserWithLifetime, email: 'test@internxt.com' };
      const tier = mocks.newTier();

      tier.featuresPerService[Service.Vpn].enabled = true;

      const applyVpnFeatures = jest.spyOn(tiersService, 'applyVpnFeatures').mockImplementation(() => Promise.resolve());

      await tiersService.applyVpnFeatures(userWithEmail, tier);

      expect(applyVpnFeatures).not.toThrow();
    });
  });
});
