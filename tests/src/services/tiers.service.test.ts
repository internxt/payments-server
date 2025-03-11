import axios from 'axios';
import Stripe from 'stripe';

import testFactory from '../utils/factory';
import config from '../../../src/config';
import {
  ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS,
  NoSubscriptionSeatsProvidedError,
  TierNotFoundError,
  TiersService,
} from '../../../src/services/tiers.service';
import { UsersService } from '../../../src/services/users.service';
import { TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';
import {
  CustomerId,
  ExtendedSubscription,
  NotFoundSubscriptionError,
  PaymentService,
} from '../../../src/services/payment.service';
import { createOrUpdateUser, StorageService, updateUserTier } from '../../../src/services/storage.service';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { Bit2MeService } from '../../../src/services/bit2me.service';
import { getCustomer, getInvoice, getLogger, getUser, newTier, voidPromise } from '../fixtures';
import { Service } from '../../../src/core/users/Tier';
import { UsersTiersRepository, UserTier } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../../../src/constants';

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

jest
  .spyOn(require('../../../src/services/storage.service'), 'updateUserTier')
  .mockImplementation(() => Promise.resolve() as any);

jest
  .spyOn(require('../../../src/services/storage.service'), 'createOrUpdateUser')
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
  });

  describe('User-Tier Relationship', () => {
    describe('Insert user-tier relationship', () => {
      it('When inserting a new tier for a user, then it should be added successfully', async () => {
        const user = getUser();
        const tier = newTier();

        jest.spyOn(usersTiersRepository, 'insertTierToUser').mockResolvedValue();

        await expect(tiersService.insertTierToUser(user.id, tier.id)).resolves.toBeUndefined();
        expect(usersTiersRepository.insertTierToUser).toHaveBeenCalledWith(user.id, tier.id);
      });
    });

    describe('Update user-tier relationship', () => {
      it('When updating a user tier, then it should replace the old tier with the new one', async () => {
        const user = getUser();
        const oldTier = newTier();
        const newTierData = newTier();

        jest.spyOn(usersTiersRepository, 'updateUserTier').mockResolvedValue(true);

        await expect(tiersService.updateTierToUser(user.id, oldTier.id, newTierData.id)).resolves.toBeUndefined();
        expect(usersTiersRepository.updateUserTier).toHaveBeenCalledWith(user.id, oldTier.id, newTierData.id);
      });

      it('When updating a user tier and it does not exist, then an error indicating so is thrown', async () => {
        const user = getUser();
        const oldTier = newTier();
        const newTierData = newTier();

        jest.spyOn(usersTiersRepository, 'updateUserTier').mockResolvedValue(false);

        await expect(tiersService.updateTierToUser(user.id, oldTier.id, newTierData.id)).rejects.toThrow(Error);
        expect(usersTiersRepository.updateUserTier).toHaveBeenCalledWith(user.id, oldTier.id, newTierData.id);
      });
    });

    describe('Delete user-tier relationship', () => {
      it('When deleting a tier from a user, then it should remove the relationship', async () => {
        const user = getUser();
        const tier = newTier();

        jest.spyOn(usersTiersRepository, 'deleteTierFromUser').mockResolvedValue(true);

        await expect(tiersService.deleteTierFromUser(user.id, tier.id)).resolves.toBeUndefined();
        expect(usersTiersRepository.deleteTierFromUser).toHaveBeenCalledWith(user.id, tier.id);
      });

      it('When deleting a tier from a user and it does not exist, then an error indicating so is thrown', async () => {
        const user = getUser();
        const tier = newTier();

        jest.spyOn(usersTiersRepository, 'deleteTierFromUser').mockResolvedValue(false);

        await expect(tiersService.deleteTierFromUser(user.id, tier.id)).rejects.toThrow(Error);
        expect(usersTiersRepository.deleteTierFromUser).toHaveBeenCalledWith(user.id, tier.id);
      });
    });
  });

  describe('Get the tier products using the user Id', () => {
    it('When the user has no assigned tiers, then an error indicating so is thrown', async () => {
      const { id: userId } = getUser();

      jest.spyOn(usersTiersRepository, 'findTierIdByUserId').mockResolvedValue([]);

      await expect(tiersService.getTiersProductsByUserId(userId)).rejects.toThrow(TierNotFoundError);
    });

    it('When the user has assigned tiers, then it returns the corresponding tier objects', async () => {
      const { id: userId } = getUser();
      const tier1 = newTier();
      const tier2 = newTier();
      const userTiers: UserTier[] = [
        { id: '', userId, tierId: tier1.id },
        { id: '', userId, tierId: tier2.id },
      ];

      jest.spyOn(usersTiersRepository, 'findTierIdByUserId').mockResolvedValue(userTiers);
      jest
        .spyOn(tiersService, 'getTierProductsByTierId')
        .mockImplementation(async (tierId) => (tierId === tier1.id ? tier1 : tier2));

      const result = await tiersService.getTiersProductsByUserId(userId);

      expect(result).toStrictEqual([tier1, tier2]);
      expect(tiersService.getTierProductsByTierId).toHaveBeenCalledTimes(2);
      expect(tiersService.getTierProductsByTierId).toHaveBeenCalledWith(tier1.id);
      expect(tiersService.getTierProductsByTierId).toHaveBeenCalledWith(tier2.id);
    });
  });

  describe('Get tier products using the tier id', () => {
    it('When the requested tier does not exist, then an error indicating so is thrown', async () => {
      const { id: tierId } = newTier();

      jest.spyOn(tiersRepository, 'findByTierId').mockResolvedValue(null);

      await expect(tiersService.getTierProductsByTierId(tierId)).rejects.toThrow(TierNotFoundError);
    });

    it('When the requested tier exists, then it returns the tier object', async () => {
      const tier = newTier();

      jest.spyOn(tiersRepository, 'findByTierId').mockResolvedValue(tier);

      const result = await tiersService.getTierProductsByTierId(tier.id);

      expect(result).toStrictEqual(tier);
      expect(tiersRepository.findByTierId).toHaveBeenCalledWith(tier.id);
    });
  });

  describe('Get tier products using the product id and/or billing type', () => {
    it('When the requested tier does not exist, then an error indicating so is thrown', async () => {
      const { id: productId } = newTier();

      jest.spyOn(tiersRepository, 'findByProductId').mockResolvedValue(null);

      await expect(tiersService.getTierProductsByProductsId(productId)).rejects.toThrow(TierNotFoundError);
    });

    it('When the requested tier exists, then it returns the tier object', async () => {
      const tier = newTier();

      jest.spyOn(tiersRepository, 'findByProductId').mockResolvedValue(tier);

      const result = await tiersService.getTierProductsByProductsId(tier.productId);

      expect(result).toStrictEqual(tier);
      expect(tiersRepository.findByProductId).toHaveBeenCalledWith({ productId: tier.productId });
    });

    it('When the requested tier exists and the billing type is lifetime, then it returns the tier object', async () => {
      const tierBillingType = 'lifetime';
      const tier = newTier({
        billingType: tierBillingType,
      });

      jest.spyOn(tiersRepository, 'findByProductId').mockResolvedValue(tier);

      const result = await tiersService.getTierProductsByProductsId(tier.productId, tierBillingType);

      expect(result).toStrictEqual(tier);
      expect(tiersRepository.findByProductId).toHaveBeenCalledWith({
        productId: tier.productId,
        billingType: tierBillingType,
      });
    });
  });

  describe('Antivirus access based on user tier', () => {
    it('When the user has a valid active subscription, then returns antivirus enabled', async () => {
      const mockedUser = getUser();
      const customerId: CustomerId = mockedUser.customerId;
      const activeSubscription = { status: 'active', product: { id: ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS[0] } };

      jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockResolvedValue([activeSubscription as ExtendedSubscription]);

      const antivirusTier = await tiersService.getProductsTier(customerId, false);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: true, backups: true },
      });
    });

    it('When the user has an active subscription but is not eligible for antivirus, then returns antivirus disabled', async () => {
      const customerId: CustomerId = getUser().customerId;
      const activeSubscription = { status: 'active', product: { id: 'some_other_product' } };

      jest
        .spyOn(paymentService, 'getActiveSubscriptions')
        .mockResolvedValue([activeSubscription as ExtendedSubscription]);

      const antivirusTier = await tiersService.getProductsTier(customerId, false);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: false, backups: false },
      });
    });

    it('When the user has no active subscription but has a valid lifetime product, then returns antivirus enabled', async () => {
      const customerId: CustomerId = getUser().customerId;
      const isLifetime = true;

      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([]);
      jest
        .spyOn(paymentService, 'getInvoicesFromUser')
        .mockResolvedValue([
          { lines: { data: [{ price: { product: ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS[0] } }] }, status: 'paid' },
        ] as any);

      const antivirusTier = await tiersService.getProductsTier(customerId, isLifetime);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: true, backups: true },
      });
    });

    it('When the user has no active subscription and is not lifetime, then throws NotFoundSubscriptionError', async () => {
      const customerId: CustomerId = getUser().customerId;

      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([]);

      await expect(tiersService.getProductsTier(customerId, false)).rejects.toThrow(
        new NotFoundSubscriptionError('User has no active subscriptions'),
      );
    });

    it('When the user is lifetime but the product is not in the allowed list, then returns antivirus disabled', async () => {
      const customerId: CustomerId = getUser().customerId;
      const isLifetime = true;

      jest.spyOn(paymentService, 'getActiveSubscriptions').mockResolvedValue([]);
      jest
        .spyOn(paymentService, 'getInvoicesFromUser')
        .mockResolvedValue([{ lines: { data: [{ price: { product: 'some_other_product' } }] } }] as any);

      const antivirusTier = await tiersService.getProductsTier(customerId, isLifetime);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: false, backups: false },
      });
    });

    it('When the user has both an active subscription and a valid lifetime product, then returns antivirus enabled', async () => {
      const customerId: CustomerId = getUser().customerId;
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

      const antivirusTier = await tiersService.getProductsTier(customerId, isLifetime);

      expect(antivirusTier).toEqual({
        featuresPerService: { antivirus: true, backups: true },
      });
    });
  });

  describe('Apply the Tier the user paid for', () => {
    it('When applying the tier, then fails if the tier is not found', async () => {
      const user = getUser();
      const productId = 'productId';
      const mockedCustomer = getCustomer();
      const mockedInvoiceLineItem = getInvoice().lines.data[0];

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(null));

      await expect(
        tiersService.applyTier(
          { ...user, email: 'example@internxt.com' },
          mockedCustomer,
          mockedInvoiceLineItem.quantity,
          productId,
        ),
      ).rejects.toThrow(TierNotFoundError);

      expect(findTierByProductId).toHaveBeenCalledWith({ productId });
    });

    it('When applying the tier, then skips disabled features', async () => {
      const user = getUser();
      const tier = newTier();
      const { productId } = tier;
      const mockedCustomer = getCustomer();
      const mockedInvoiceLineItem = getInvoice().lines.data[0];

      tier.featuresPerService[Service.Drive].enabled = false;
      tier.featuresPerService[Service.Vpn].enabled = false;

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(tier));
      const applyDriveFeatures = jest
        .spyOn(tiersService, 'applyDriveFeatures')
        .mockImplementation(() => Promise.resolve());
      const applyVpnFeatures = jest.spyOn(tiersService, 'applyVpnFeatures').mockImplementation(() => Promise.resolve());

      await tiersService.applyTier(
        { ...user, email: 'example@internxt.com' },
        mockedCustomer,
        mockedInvoiceLineItem.quantity,
        productId,
      );

      expect(findTierByProductId).toHaveBeenCalledWith({ productId });
      expect(applyDriveFeatures).not.toHaveBeenCalled();
      expect(applyVpnFeatures).not.toHaveBeenCalled();
    });

    it('When applying the tier, then applies enabled features', async () => {
      const user = getUser();
      const tier = newTier();
      const userWithEmail = { ...user, email: 'example@internxt.com' };
      const { productId } = tier;
      const mockedCustomer = getCustomer();
      const mockedInvoiceLineItem = getInvoice().lines.data[0];

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Vpn].enabled = true;

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(tier));
      const applyDriveFeatures = jest
        .spyOn(tiersService, 'applyDriveFeatures')
        .mockImplementation(() => Promise.resolve());
      const applyVpnFeatures = jest.spyOn(tiersService, 'applyVpnFeatures').mockImplementation(() => Promise.resolve());

      await tiersService.applyTier(
        { ...user, email: 'example@internxt.com' },
        mockedCustomer,
        mockedInvoiceLineItem.quantity,
        productId,
      );

      expect(findTierByProductId).toHaveBeenCalledWith({ productId });
      expect(applyDriveFeatures).toHaveBeenCalledWith(userWithEmail, mockedCustomer, 1, tier);
      expect(applyVpnFeatures).toHaveBeenCalledWith(userWithEmail, tier);
    });
  });

  describe('Remove the tier the user canceled or requested a refund', () => {
    it('When removing the tier, then fails if the tier is not found', async () => {
      const mockedUser = getUser();
      const productId = 'productId';

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(null));

      await expect(
        tiersService.removeTier({ ...mockedUser, email: 'example@internxt.com' }, productId, getLogger()),
      ).rejects.toThrow(TierNotFoundError);

      expect(findTierByProductId).toHaveBeenCalledWith({ productId });
    });

    it('When removing the tier, then skips the disabled features the tier had', async () => {
      const mockedUser = getUser();
      const log = getLogger();
      const mockedTier = newTier();
      const userWithEmail = { ...mockedUser, email: 'example@internxt.com' };
      const { productId } = mockedTier;
      mockedTier.featuresPerService[Service.Drive].enabled = true;
      mockedTier.featuresPerService[Service.Vpn].enabled = false;

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(mockedTier));
      const removeDriveFeatures = jest
        .spyOn(tiersService, 'removeDriveFeatures')
        .mockImplementation(() => Promise.resolve());
      const removeVPNFeatures = jest
        .spyOn(tiersService, 'removeVPNFeatures')
        .mockImplementation(() => Promise.resolve());

      await tiersService.removeTier(userWithEmail, productId, log);

      expect(findTierByProductId).toHaveBeenCalledWith({ productId });
      expect(removeDriveFeatures).toHaveBeenCalledWith(userWithEmail.uuid, mockedTier, log);
      expect(removeVPNFeatures).not.toHaveBeenCalled();
    });

    it('When removing the tier, then removes the applied features', async () => {
      const mockedUser = getUser();
      const log = getLogger();
      const mockedTier = newTier();
      const userWithEmail = { ...mockedUser, email: 'example@internxt.com' };
      const { productId } = mockedTier;
      mockedTier.featuresPerService[Service.Drive].enabled = true;
      mockedTier.featuresPerService[Service.Vpn].enabled = true;

      const findTierByProductId = jest
        .spyOn(tiersRepository, 'findByProductId')
        .mockImplementation(() => Promise.resolve(mockedTier));
      const removeDriveFeatures = jest
        .spyOn(tiersService, 'removeDriveFeatures')
        .mockImplementation(() => Promise.resolve());
      const removeVPNFeatures = jest
        .spyOn(tiersService, 'removeVPNFeatures')
        .mockImplementation(() => Promise.resolve());

      await tiersService.removeTier(userWithEmail, productId, log);

      expect(findTierByProductId).toHaveBeenCalledWith({ productId });
      expect(removeDriveFeatures).toHaveBeenCalledWith(userWithEmail.uuid, mockedTier, log);
      expect(removeVPNFeatures).toHaveBeenCalledWith(userWithEmail.uuid, mockedTier.featuresPerService['vpn']);
    });
  });

  describe('Apply Drive features according the user tier plan', () => {
    it('When workspace is enabled but the quantity of seats is less than the minimum, then an error indicating so is thrown', async () => {
      const userWithEmail = { ...getUser(), email: 'test@internxt.com' };
      const tier = newTier();
      const mockedCustomer = getCustomer();
      const mockedInvoiceLineItem = getInvoice().lines.data[0];

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = true;

      jest.spyOn(tiersRepository, 'findByProductId').mockImplementation(() => Promise.resolve(tier));
      const updateWorkspaceStorage = jest
        .spyOn(usersService, 'updateWorkspaceStorage')
        .mockImplementation(() => Promise.resolve());

      await expect(
        tiersService.applyTier(userWithEmail, mockedCustomer, mockedInvoiceLineItem.quantity, tier.productId),
      ).rejects.toThrow(NoSubscriptionSeatsProvidedError);
      expect(updateWorkspaceStorage).not.toHaveBeenCalled();
    });
    it('When workspaces is enabled, then it is applied exclusively', async () => {
      const userWithEmail = { ...getUser(), email: 'test@internxt.com' };
      const tier = newTier();
      const mockedCustomer = getCustomer();
      const mockedInvoiceLineItem = getInvoice().lines.data[0];

      mockedInvoiceLineItem.quantity = 3;
      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = true;

      jest.spyOn(tiersRepository, 'findByProductId').mockImplementation(() => Promise.resolve(tier));
      const updateWorkspaceStorage = jest
        .spyOn(usersService, 'updateWorkspaceStorage')
        .mockImplementation(() => Promise.resolve());

      await tiersService.applyTier(userWithEmail, mockedCustomer, mockedInvoiceLineItem.quantity, tier.productId);

      expect(updateWorkspaceStorage).toHaveBeenCalledWith(
        userWithEmail.uuid,
        tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat,
        mockedInvoiceLineItem.quantity,
      );
    });

    it('When workspaces is enabled and the workspace do not exist, then it is initialized', async () => {
      const userWithEmail = { ...getUser(), email: 'test@internxt.com' };
      const tier = newTier();
      const mockedCustomer = getCustomer();
      const amountOfSeats = 5;

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = true;

      const updateWorkspaceError = new Error('Workspace does not exist');
      jest.spyOn(usersService, 'updateWorkspaceStorage').mockImplementation(() => Promise.reject(updateWorkspaceError));
      const initializeWorkspace = jest
        .spyOn(usersService, 'initializeWorkspace')
        .mockImplementation(() => Promise.resolve());

      await tiersService.applyDriveFeatures(userWithEmail, mockedCustomer, amountOfSeats, tier);

      expect(initializeWorkspace).toHaveBeenCalledWith(userWithEmail.uuid, {
        newStorageBytes: tier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat,
        seats: amountOfSeats,
        address: mockedCustomer.address?.line1 ?? undefined,
        phoneNumber: mockedCustomer.phone ?? undefined,
      });
    });

    it('When workspaces is not enabled, then individual is initialized', async () => {
      const userWithEmail = { ...getUser(), email: 'test@internxt.com' };
      const tier = newTier();
      const mockedCustomer = getCustomer();
      const amountOfSeats = 1;

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = false;

      await tiersService.applyDriveFeatures(userWithEmail, mockedCustomer, amountOfSeats, tier);

      expect(createOrUpdateUser).toHaveBeenCalledWith(
        tier.featuresPerService[Service.Drive].maxSpaceBytes.toString(),
        userWithEmail.email,
        config,
      );
      expect(updateUserTier).toHaveBeenCalledWith(userWithEmail.uuid, tier.productId, config);
    });
  });

  describe('Remove Drive features', () => {
    it('When workspaces is enabled, then it is removed exclusively', async () => {
      const { uuid } = getUser();
      const tier = newTier();

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = true;

      const destroyWorkspace = jest.spyOn(usersService, 'destroyWorkspace').mockImplementation(() => Promise.resolve());
      (updateUserTier as jest.Mock).mockClear();

      await tiersService.removeDriveFeatures(uuid, tier, getLogger());

      expect(destroyWorkspace).toHaveBeenCalledWith(uuid);

      expect(updateUserTier).not.toHaveBeenCalled();
    });

    it('When workspaces is not enabled, then update the user tier to free and downgrade the storage to the free plan', async () => {
      const { uuid } = getUser();
      const tier = newTier();

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = false;

      const destroyWorkspaceSpy = jest.spyOn(usersService, 'destroyWorkspace');
      const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);
      (updateUserTier as jest.Mock).mockClear();

      await tiersService.removeDriveFeatures(uuid, tier, getLogger());

      expect(destroyWorkspaceSpy).not.toHaveBeenCalled();
      expect(updateUserTier).toHaveBeenCalledWith(uuid, FREE_INDIVIDUAL_TIER, config);
      expect(changeStorageSpy).toHaveBeenCalledWith(uuid, FREE_PLAN_BYTES_SPACE);
    });
  });

  describe('Enable VPN access based on user tier', () => {
    it("When VPN is enabled, then a request to enable user's tier on the VPN service is sent", async () => {
      const userWithEmail = { ...getUser(), email: 'test@internxt.com' };
      const tier = newTier();

      tier.featuresPerService[Service.Vpn].enabled = true;

      const enableVPNTierSpy = jest.spyOn(usersService, 'enableVPNTier').mockImplementation(() => Promise.resolve());

      await tiersService.applyVpnFeatures(userWithEmail, tier);

      expect(enableVPNTierSpy).toHaveBeenCalledWith(userWithEmail.uuid, tier.featuresPerService[Service.Vpn].featureId);
    });

    it('When VPN is disabled, then it does not send a request to enable a VPN tier', async () => {
      const userWithEmail = { ...getUser(), email: 'test@internxt.com' };
      const tier = newTier();

      const enableVPNTierSpy = jest.spyOn(usersService, 'enableVPNTier').mockImplementation(() => Promise.resolve());

      await tiersService.applyVpnFeatures(userWithEmail, tier);

      expect(enableVPNTierSpy).not.toHaveBeenCalled();
    });
  });

  describe('Remove VPN access based on user tier', () => {
    it('When VPN was enabled on the cancelled tier, then the request to disable/remove it is sent', async () => {
      const { uuid } = getUser();
      const tier = newTier();

      tier.featuresPerService[Service.Vpn].enabled = true;

      const removeVPNTierSpy = jest.spyOn(usersService, 'disableVPNTier').mockImplementation(() => Promise.resolve());

      await tiersService.removeVPNFeatures(uuid, tier.featuresPerService['vpn']);

      expect(removeVPNTierSpy).toHaveBeenCalledWith(uuid, tier.featuresPerService[Service.Vpn].featureId);
    });
  });
});
