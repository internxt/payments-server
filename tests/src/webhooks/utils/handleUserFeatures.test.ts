import Stripe from 'stripe';
import { TierNotFoundError } from '../../../../src/services/tiers.service';
import { UserNotFoundError } from '../../../../src/services/users.service';
import { handleUserFeatures, HandleUserFeaturesProps } from '../../../../src/webhooks/utils/handleUserFeatures';
import { getCustomer, getInvoice, getLogger, getProduct, getUser, newTier } from '../../fixtures';
import { User } from '../../../../src/core/users/User';
import { handleStackLifetimeStorage } from '../../../../src/webhooks/utils/handleStackLifetimeStorage';
import { Service, Tier } from '../../../../src/core/users/Tier';
import { FastifyBaseLogger } from 'fastify';
import { createTestServices } from '../../helpers/services-factory';

jest.mock('../../../../src/webhooks/utils/handleStackLifetimeStorage');

let defaultProps: HandleUserFeaturesProps;
let mockedTier: Tier;
let mockedUser: User & { email: string };
let mockedCustomer: Stripe.Customer;
let mockedPurchasedItem: Stripe.InvoiceLineItem;
let logger: jest.Mocked<FastifyBaseLogger>;

mockedUser = {
  ...getUser(),
  email: 'test@example.com',
} as User & { email: string };
logger = getLogger();
mockedTier = newTier();
mockedCustomer = getCustomer();
mockedPurchasedItem = getInvoice().lines.data[0];

const stripeMock = {
  paymentIntents: {
    cancel: jest.fn(),
  },
};
const { paymentService, usersService, tiersService, storageService } = createTestServices({
  stripe: stripeMock,
});

beforeEach(() => {
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

describe('Create or update user when after successful payment', () => {
  it('when the product does not exists, then an error indicating so is thrown', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    const mockedProduct = getProduct({});
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(tierNotFoundError);

    await expect(handleUserFeatures(defaultProps)).rejects.toThrow(tierNotFoundError);
  });

  it('When the user does not have tiers, then it should insert a new tier', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    const mockedProduct = getProduct({
      params: {
        id: mockedPurchasedItem.pricing?.price_details?.product,
      },
    });
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
    const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
    jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await handleUserFeatures(defaultProps);

    expect(getTierProductsSPy).toHaveBeenCalledWith(
      mockedPurchasedItem.pricing?.price_details?.product,
      mockedTier.billingType,
    );
    expect(spyInsert).toHaveBeenCalledTimes(1);
    expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem.quantity,
      mockedPurchasedItem.pricing?.price_details?.product,
      logger,
      undefined,
    );
    expect(spyUpdate).not.toHaveBeenCalled();
  });

  it('when the user has existing tiers and the second invoice has a product that is not mapped (old subscription), then the user-tier relationship is saved and the tier is applied', async () => {
    const randomMockedTier = newTier();
    const mockedInvoices = getInvoice(undefined, undefined, mockedTier.productId);
    const mockedProduct = getProduct({
      params: {
        id: mockedPurchasedItem.pricing?.price_details?.product,
      },
    });
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
    jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
    const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
    jest.spyOn(paymentService, 'getDriveInvoices').mockResolvedValue([
      {
        ...mockedInvoices,
        pdf: '',
        product: randomMockedTier.productId,
        bytesInPlan: '',
        created: mockedInvoices.created,
        currency: mockedInvoices.currency,
        id: mockedInvoices.id,
        total: mockedInvoices.total,
      },
      {
        ...mockedInvoices,
        pdf: '',
        product: randomMockedTier.productId,
        bytesInPlan: '',
        created: mockedInvoices.created,
        currency: mockedInvoices.currency,
        id: mockedInvoices.id,
        total: mockedInvoices.total,
      },
    ]);
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdateUser = jest.spyOn(usersService, 'updateUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await handleUserFeatures(defaultProps);

    expect(getTierProductsSPy).toHaveBeenCalledWith(
      mockedPurchasedItem.pricing?.price_details?.product,
      mockedTier.billingType,
    );
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem.quantity,
      mockedPurchasedItem.pricing?.price_details?.product,
      logger,
      undefined,
    );
    expect(spyUpdateUser).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
  });

  it('when the user has existing tiers, then it should update from that old tier to the new tier', async () => {
    const mockedOldTier = newTier();
    const mockedInvoices = getInvoice(undefined, undefined, mockedTier.productId);
    const mockedProduct = getProduct({
      params: {
        id: mockedPurchasedItem.pricing?.price_details?.product,
      },
    });
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
    jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
    const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedOldTier]);
    jest.spyOn(paymentService, 'getDriveInvoices').mockResolvedValue([
      {
        ...mockedInvoices,
        pdf: '',
        product: mockedOldTier.productId,
        bytesInPlan: '',
        created: mockedInvoices.created,
        currency: mockedInvoices.currency,
        id: mockedInvoices.id,
        total: mockedInvoices.total,
      },
      {
        ...mockedInvoices,
        pdf: '',
        product: mockedOldTier.productId,
        bytesInPlan: '',
        created: mockedInvoices.created,
        currency: mockedInvoices.currency,
        id: mockedInvoices.id,
        total: mockedInvoices.total,
      },
    ]);
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    await handleUserFeatures(defaultProps);

    expect(getTierProductsSPy).toHaveBeenCalledWith(
      mockedPurchasedItem.pricing?.price_details?.product,
      mockedTier.billingType,
    );
    expect(spyUpdate).toHaveBeenCalledTimes(1);
    expect(spyUpdate).toHaveBeenCalledWith(mockedUser.id, mockedOldTier.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem.quantity,
      mockedPurchasedItem.pricing?.price_details?.product,
      logger,
    );
    expect(spyInsert).not.toHaveBeenCalled();
  });

  it('When the tier exists but the user does not, then the tier is added and the user is created', async () => {
    const userNotFoundError = new UserNotFoundError('Tier not found');
    const mockedProduct = getProduct({
      params: {
        id: mockedPurchasedItem.pricing?.price_details?.product,
      },
    });
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
    const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    const findByUuidSpy = jest.spyOn(usersService, 'findUserByUuid');
    findByUuidSpy.mockRejectedValueOnce(userNotFoundError);
    findByUuidSpy.mockResolvedValueOnce(mockedUser);

    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await handleUserFeatures(defaultProps);

    expect(getTierProductsSPy).toHaveBeenCalledWith(
      mockedPurchasedItem.pricing?.price_details?.product,
      mockedTier.billingType,
    );
    expect(spyInsert).toHaveBeenCalledTimes(1);
    expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem.quantity,
      mockedPurchasedItem.pricing?.price_details?.product,
      logger,
    );
    expect(spyUpdate).not.toHaveBeenCalled();
  });

  describe('The user has a lifetime plan', () => {
    it('When the user has a lifetime plan and purchases a new lifetime plan, then the function to stack lifetime storage is called', async () => {
      mockedUser.lifetime = true;
      mockedTier.billingType = 'lifetime';
      defaultProps.isLifetimeCurrentSub = true;
      const mockedProduct = getProduct({
        params: {
          id: mockedPurchasedItem.pricing?.price_details?.product,
        },
      });
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
      const getTierProductsSPy = jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
      const getDriveInvoicesSpy = jest.spyOn(paymentService, 'getDriveInvoices');
      const handleStackLifetimeStorageSpy = handleStackLifetimeStorage as jest.Mock;
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);

      await handleUserFeatures(defaultProps);

      expect(getTierProductsSPy).toHaveBeenCalledWith(
        mockedPurchasedItem.pricing?.price_details?.product,
        mockedTier.billingType,
      );
      expect(handleStackLifetimeStorageSpy).toHaveBeenCalledWith({
        logger: defaultProps.logger,
        storageService: defaultProps.storageService,
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
      const mockedProduct = getProduct({
        params: {
          id: mockedPurchasedItem.pricing?.price_details?.product,
        },
      });
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);
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
        mockedPurchasedItem.pricing?.price_details?.product,
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
        storageService: defaultProps.storageService,
        newTier: mockedTier,
        oldTier: mockedTier,
        user: { ...mockedUser, email: mockedUser.email },
      });
      expect(spyApplyTier).toHaveBeenCalledWith(
        mockedUser,
        mockedCustomer,
        mockedPurchasedItem.quantity,
        mockedPurchasedItem.pricing?.price_details?.product,
        logger,
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

      const mockedProduct = getProduct({
        params: {
          id: mockedPurchasedItem.pricing?.price_details?.product,
        },
      });
      jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as Stripe.Response<Stripe.Product>);

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
        storageService: defaultProps.storageService,
        newTier: newLifetimeTier,
        oldTier: oldLifetimeTier,
        user: { ...mockedUser, email: mockedUser.email },
      });

      expect(spyApplyTier).toHaveBeenCalledWith(
        defaultProps.user,
        defaultProps.customer,
        defaultProps.purchasedItem.quantity,
        newLifetimeTier.productId,
        logger,
        [Service.Drive],
      );

      expect(spyUpdateTierToUser).toHaveBeenCalledWith(mockedUser.id, oldLifetimeTier.id, newLifetimeTier.id);
      expect(getDriveInvoicesSpy).not.toHaveBeenCalled();
    });
  });
});
