import axios from 'axios';
import Stripe from 'stripe';

import testFactory from '../utils/factory';
import config from '../../../src/config';
import getMocks from '../mocks';
import { TierNotFoundError, TiersService } from '../../../src/services/tiers.service';
import { UsersService } from '../../../src/services/users.service';
import { Service, TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import { PaymentService } from '../../../src/services/payment.service';
import { createOrUpdateUser, StorageService, updateUserTier } from '../../../src/services/storage.service';
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

jest.spyOn(require('../../../src/services/storage.service'), 'createOrUpdateUser')
  .mockImplementation(() => Promise.resolve() as any);
jest.spyOn(require('../../../src/services/storage.service'), 'updateUserTier')
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
    it('When applying the tier, then fails if the tier is not found', async () => {
      const user = mocks.mockedUserWithLifetime;
      const productId = 'productId';

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(null));

      await expect(tiersService.applyTier({ ...user, email: 'fake email' }, productId))
        .rejects
        .toThrow(new TierNotFoundError(productId));

      expect(findTierByProductId).toHaveBeenCalledWith(productId);
    });

    it('When applying the tier, then skips disabled features', async () => {
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

    it('When applying the tier, then applies enabled features', async () => {
      const user = mocks.mockedUserWithLifetime;
      const tier = mocks.newTier();
      const userWithEmail = { ...user, email: 'fake email' };
      const { productId } = tier;
      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Vpn].enabled = true;

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(tier));
      const applyDriveFeatures = jest.spyOn(tiersService, 'applyDriveFeatures')
        .mockImplementation(() => Promise.resolve());
      const applyVpnFeatures = jest.spyOn(tiersService, 'applyVpnFeatures')
        .mockImplementation(() => Promise.resolve());

      await tiersService.applyTier(userWithEmail, productId);

      expect(findTierByProductId).toHaveBeenCalledWith(productId);
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

      const updateWorkspaceStorage = jest.spyOn(usersService, 'updateWorkspaceStorage')
        .mockImplementation(() => Promise.resolve());
      
      const createOrUpdateUserSpy = jest.fn(createOrUpdateUser)
        .mockImplementation(() => Promise.resolve() as any);

      await tiersService.applyDriveFeatures(
        userWithEmail,
        tier,
      );

      expect(updateWorkspaceStorage).toHaveBeenCalledWith(
        userWithEmail.uuid,
        tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat,
        0
      );

      expect(createOrUpdateUserSpy).not.toHaveBeenCalled();
    });
  
    it('When workspaces is enabled and the workspace do not exist, then it is initialized', async () => {
      const userWithEmail = { ...mocks.mockedUserWithLifetime, email: 'test@internxt.com' };
      const tier = mocks.newTier();

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = true;

      const updateWorkspaceError = new Error('Workspace does not exist');
      jest.spyOn(usersService, 'updateWorkspaceStorage')
        .mockImplementation(() => Promise.reject(updateWorkspaceError));
      const initializeWorkspace = jest.spyOn(usersService, 'initializeWorkspace')
        .mockImplementation(() => Promise.resolve());

      await tiersService.applyDriveFeatures(
        userWithEmail,
        tier,
      );

      expect(initializeWorkspace).toHaveBeenCalledWith(
        userWithEmail.uuid, 
        {
          newStorageBytes: tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat,
          seats: 0,
          address: '',
          phoneNumber: '',
        }
      );
      expect(createOrUpdateUser).not.toHaveBeenCalled();
    });

    it('When workspaces is not enabled, then individual is initialized', async () => {
      const userWithEmail = { ...mocks.mockedUserWithLifetime, email: 'test@internxt.com' };
      const tier = mocks.newTier();

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = false;

      await tiersService.applyDriveFeatures(
        userWithEmail,
        tier,
      );

      expect(createOrUpdateUser).toHaveBeenCalledWith(
        tier.featuresPerService[Service.Drive].maxSpaceBytes.toString(), 
        userWithEmail.email,
        config
      );
      expect(updateUserTier).toHaveBeenCalledWith(
        userWithEmail.uuid,
        tier.productId,
        config
      );
    });
  });

  describe('applyVpnFeatures()', () => {
    it('When it is called, then it does not throw', async () => {
      const userWithEmail = { ...mocks.mockedUserWithLifetime, email: 'test@internxt.com' };
      const tier = mocks.newTier();

      tier.featuresPerService[Service.Vpn].enabled = true;

      const applyVpnFeatures = jest.spyOn(tiersService, 'applyVpnFeatures')
        .mockImplementation(() => Promise.resolve());

      await tiersService.applyVpnFeatures(
        userWithEmail,
        tier,
      );

      expect(applyVpnFeatures).not.toThrow();
    });
  });
});
