import Stripe from 'stripe';
import { CouponsRepository } from '../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../../src/services/bit2me.service';
import { PaymentService } from '../../../../src/services/payment.service';
import { TierNotFoundError, TiersService } from '../../../../src/services/tiers.service';
import { UserNotFoundError, UsersService } from '../../../../src/services/users.service';
import { handleUserFeatures, HandleUserFeaturesProps } from '../../../../src/webhooks/utils/handleUserFeatures';
import testFactory from '../../utils/factory';
import config from '../../../../src/config';
import axios from 'axios';
import { getCustomer, getInvoice, getLogger, getUser, newTier } from '../../fixtures';
import { User } from '../../../../src/core/users/User';
import { StorageService } from '../../../../src/services/storage.service';
import { handleStackLifetimeStorage } from '../../../../src/webhooks/utils/handleStackLifetimeStorage';
import { Service, Tier } from '../../../../src/core/users/Tier';
import { FastifyBaseLogger } from 'fastify';

jest.mock('../../../../src/webhooks/utils/handleStackLifetimeStorage');

let tiersService: TiersService;
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
let defaultProps: HandleUserFeaturesProps;
let storageService: StorageService;
let mockedTier: Tier;
let mockedUser: User & { email: string };
let mockedCustomer: Stripe.Customer;
let mockedPurchasedItem: Stripe.InvoiceLineItem;
let logger: jest.Mocked<FastifyBaseLogger>;

describe('Create or update user when after successful payment', () => {
  beforeEach(() => {
    mockedUser = {
      ...getUser(),
      email: 'test@example.com',
    } as User & { email: string };
    logger = getLogger();
    mockedTier = newTier();
    mockedCustomer = getCustomer();
    mockedPurchasedItem = getInvoice().lines.data[0];
    tiersRepository = testFactory.getTiersRepository();
    usersRepository = testFactory.getUsersRepositoryForTest();
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    usersTiersRepository = testFactory.getUsersTiersRepository();
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

    storageService = new StorageService(config, axios);

    tiersService = new TiersService(
      usersService,
      paymentService,
      tiersRepository,
      usersTiersRepository,
      storageService,
      config,
    );

    defaultProps = {
      user: mockedUser,
      purchasedItem: mockedPurchasedItem,
      paymentService,
      usersService,
      logger,
      storageService,
      isLifetimeCurrentSub: false,
      customer: mockedCustomer,
      tiersService,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('when the product does not exists, then an error indicating so is thrown', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(tierNotFoundError);

    await expect(handleUserFeatures(defaultProps)).rejects.toThrow(tierNotFoundError);
  });

  it('When the user does not have tiers, then it should insert a new tier', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
    jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await handleUserFeatures(defaultProps);

    expect(getTierProductsSPy).toHaveBeenCalledWith(
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
      mockedTier.billingType,
    );
    expect(spyInsert).toHaveBeenCalledTimes(1);
    expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem.quantity,
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
      undefined,
    );
    expect(spyUpdate).not.toHaveBeenCalled();
  });

  it('when the user has existing tiers and the second invoice has a product that is not mapped (old subscription), then the user-tier relationship is saved and the tier is applied', async () => {
    const randomMockedTier = newTier();
    const mockedInvoices = getInvoice(undefined, undefined, mockedTier.productId);
    jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
    const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
    jest.spyOn(paymentService, 'getDriveInvoices').mockResolvedValue([
      {
        ...mockedInvoices,
        pdf: '',
        product: randomMockedTier.productId,
        bytesInPlan: '',
      },
      {
        ...mockedInvoices,
        pdf: '',
        product: randomMockedTier.productId,
        bytesInPlan: '',
      },
    ]);
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdateUser = jest.spyOn(usersService, 'updateUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await handleUserFeatures(defaultProps);

    expect(getTierProductsSPy).toHaveBeenCalledWith(
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
      mockedTier.billingType,
    );
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem.quantity,
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
      undefined,
    );
    expect(spyUpdateUser).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
  });

  it('when the user has existing tiers, then it should update from that old tier to the new tier', async () => {
    const mockedOldTier = newTier();
    const mockedInvoices = getInvoice(undefined, undefined, mockedTier.productId);
    jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
    const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedOldTier]);
    jest.spyOn(paymentService, 'getDriveInvoices').mockResolvedValue([
      {
        ...mockedInvoices,
        pdf: '',
        product: mockedOldTier.productId,
        bytesInPlan: '',
      },
      {
        ...mockedInvoices,
        pdf: '',
        product: mockedOldTier.productId,
        bytesInPlan: '',
      },
    ]);
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    await handleUserFeatures(defaultProps);

    expect(getTierProductsSPy).toHaveBeenCalledWith(
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
      mockedTier.billingType,
    );
    expect(spyUpdate).toHaveBeenCalledTimes(1);
    expect(spyUpdate).toHaveBeenCalledWith(mockedUser.id, mockedOldTier.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem.quantity,
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
    );
    expect(spyInsert).not.toHaveBeenCalled();
  });

  it('When the tier exists but the user does not, then the tier is added and the user is created', async () => {
    const userNotFoundError = new UserNotFoundError('Tier not found');
    const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    const findByUuidSpy = jest.spyOn(usersService, 'findUserByUuid');
    findByUuidSpy.mockRejectedValueOnce(userNotFoundError);
    findByUuidSpy.mockResolvedValueOnce(mockedUser);

    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await handleUserFeatures(defaultProps);

    expect(getTierProductsSPy).toHaveBeenCalledWith(
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
      mockedTier.billingType,
    );
    expect(spyInsert).toHaveBeenCalledTimes(1);
    expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem.quantity,
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
    );
    expect(spyUpdate).not.toHaveBeenCalled();
  });

  describe('The user has a lifetime plan', () => {
    it('When the user has a lifetime plan and purchases a new lifetime plan, then the function to stack lifetime storage is called', async () => {
      mockedUser.lifetime = true;
      mockedTier.billingType = 'lifetime';
      defaultProps.isLifetimeCurrentSub = true;

      const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      const getDriveInvoicesSpy = jest.spyOn(paymentService, 'getDriveInvoices');
      const handleStackLifetimeStorageSpy = handleStackLifetimeStorage as jest.Mock;
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);

      await handleUserFeatures(defaultProps);

      expect(getTierProductsSPy).toHaveBeenCalledWith(
        (mockedPurchasedItem.price?.product as Stripe.Product).id,
        mockedTier.billingType,
      );
      expect(handleStackLifetimeStorageSpy).toHaveBeenCalledWith({
        logger: defaultProps.logger,
        storageService,
        newTier: mockedTier,
        oldTier: mockedTier,
        user: { ...mockedUser, email: mockedUser.email },
      });
      expect(getDriveInvoicesSpy).not.toHaveBeenCalled();
    });

    it('When the user has an old lifetime plan and purchases a new lifetime plan, then the storage should be stacked, the tier applied and the user-tier relationship should be created', async () => {
      mockedUser.lifetime = true;
      mockedTier.billingType = 'lifetime';
      defaultProps.isLifetimeCurrentSub = true;

      const tierNotFoundError = new TierNotFoundError('Tier not found');
      const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
      const handleStackLifetimeStorageSpy = handleStackLifetimeStorage as jest.Mock;

      const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
      const spyUpdateUser = jest.spyOn(usersService, 'updateUser');
      const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser');
      const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

      await handleUserFeatures(defaultProps);

      expect(getTierProductsSPy).toHaveBeenCalledWith(
        (mockedPurchasedItem.price?.product as Stripe.Product).id,
        mockedTier.billingType,
      );
      expect(spyInsert).toHaveBeenCalledTimes(1);
      expect(spyUpdateUser).toHaveBeenCalledTimes(1);
      expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
      expect(spyUpdateUser).toHaveBeenCalledWith(mockedCustomer.id, {
        lifetime: true,
      });
      expect(handleStackLifetimeStorageSpy).toHaveBeenCalledWith({
        logger: defaultProps.logger,
        storageService,
        newTier: mockedTier,
        oldTier: mockedTier,
        user: { ...mockedUser, email: mockedUser.email },
      });
      expect(spyApplyTier).toHaveBeenCalledWith(
        mockedUser,
        mockedCustomer,
        mockedPurchasedItem.quantity,
        (mockedPurchasedItem.price?.product as Stripe.Product).id,
        [Service.Drive],
      );
      expect(spyUpdate).not.toHaveBeenCalled();
    });

    it('When user already has a new lifetime plan and tier and purchases a higher tier,  then the storage should be stacked, the tier applied and the user-tier relationship should be updated', async () => {
      const oldLifetimeTier = {
        ...mockedTier,
        id: 'old-lifetime-tier-id',
        billingType: 'lifetime',
        featuresPerService: {
          drive: { maxSpaceBytes: 1000 },
        },
      } as Tier;

      const newLifetimeTier = {
        ...mockedTier,
        id: 'new-lifetime-tier-id',
        billingType: 'lifetime',
        featuresPerService: {
          drive: { maxSpaceBytes: 2000 },
        },
      } as Tier;

      mockedUser.lifetime = true;
      defaultProps.isLifetimeCurrentSub = true;

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(newLifetimeTier);
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([oldLifetimeTier]);

      const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();
      const spyUpdateTierToUser = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
      const getDriveInvoicesSpy = jest.spyOn(paymentService, 'getDriveInvoices');

      const handleStackLifetimeStorageSpy = handleStackLifetimeStorage as jest.Mock;
      handleStackLifetimeStorageSpy.mockImplementation();

      await handleUserFeatures(defaultProps);

      expect(handleStackLifetimeStorageSpy).toHaveBeenCalledWith({
        logger: defaultProps.logger,
        storageService,
        newTier: newLifetimeTier,
        oldTier: oldLifetimeTier,
        user: { ...mockedUser, email: mockedUser.email },
      });

      expect(spyApplyTier).toHaveBeenCalledWith(
        defaultProps.user,
        defaultProps.customer,
        defaultProps.purchasedItem.quantity,
        newLifetimeTier.productId,
        [Service.Drive],
      );

      expect(spyUpdateTierToUser).toHaveBeenCalledWith(mockedUser.id, oldLifetimeTier.id, newLifetimeTier.id);
      expect(getDriveInvoicesSpy).not.toHaveBeenCalled();
    });
  });
});
