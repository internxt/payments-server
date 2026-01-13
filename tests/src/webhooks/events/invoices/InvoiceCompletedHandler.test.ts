import Stripe from 'stripe';

import { CouponNotBeingTrackedError, UserNotFoundError } from '../../../../../src/services/users.service';
import { getCustomer, getInvoice, getProduct, getUser, newTier, voidPromise } from '../../../fixtures';
import { InvoiceCompletedHandlerPayload } from '../../../../../src/webhooks/events/invoices/InvoiceCompletedHandler';
import { TierNotFoundError, UsersTiersError } from '../../../../../src/services/tiers.service';
import { NotFoundError } from '../../../../../src/errors/Errors';
import Logger from '../../../../../src/Logger';
import { Service } from '../../../../../src/core/users/Tier';
import { createTestServices } from '../../../helpers/services-factory';
import { objectStorageWebhookHandler } from '../../../../../src/webhooks/events/ObjectStorageWebhookHandler';

const {
  invoiceCompletedHandler,
  paymentService,
  tiersService,
  usersService,
  determineLifetimeConditions,
  cacheService,
  storageService,
} = createTestServices();

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

afterEach(() => jest.restoreAllMocks());

describe('Testing the handler when an invoice is completed', () => {
  describe('Run the process', () => {
    test('When the invoice is not paid, then a log indicating so is printed and it should not continues', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({ customer: mockedCustomer.id, status: 'open' });
      const invoiceCompletedHandlerPayload: InvoiceCompletedHandlerPayload = {
        customer: mockedCustomer,
        invoice: mockedInvoice,
        status: mockedInvoice.status as string,
      };
      const loggerSpy = jest.spyOn(Logger, 'info');
      const getInvoiceLineItemsSpy = jest.spyOn(paymentService, 'getInvoiceLineItems');

      await invoiceCompletedHandler.run(invoiceCompletedHandlerPayload);

      expect(loggerSpy).toHaveBeenCalledWith(`Invoice ${mockedInvoice.id} not paid, skipping processing`);
      expect(getInvoiceLineItemsSpy).not.toHaveBeenCalled();
    });

    test('When there is no price in the line item, then an error indicating so is thrown', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        customer: mockedCustomer.id,
        status: 'paid',
        lines: {
          data: [
            {
              price: null,
            },
          ],
        },
      });
      const invoiceCompletedHandlerPayload: InvoiceCompletedHandlerPayload = {
        customer: mockedCustomer,
        invoice: mockedInvoice,
        status: mockedInvoice.status as string,
      };
      const getInvoiceLineItemsSpy = jest
        .spyOn(paymentService, 'getInvoiceLineItems')
        .mockResolvedValue(mockedInvoice.lines as Stripe.Response<Stripe.ApiList<Stripe.InvoiceLineItem>>);

      await expect(invoiceCompletedHandler.run(invoiceCompletedHandlerPayload)).rejects.toThrow(NotFoundError);
      expect(getInvoiceLineItemsSpy).toHaveBeenCalledWith(mockedInvoice.id);
    });

    test('When the user purchases an object storage product, then the object storage conditions are applied', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        customer: mockedCustomer.id,
        status: 'paid',
        lines: {
          data: [
            {
              price: {
                product: {
                  metadata: {
                    type: 'object-storage',
                  },
                  id: 'prod_1',
                },
              },
            },
          ],
        },
      });
      const invoiceCompletedHandlerPayload: InvoiceCompletedHandlerPayload = {
        customer: mockedCustomer,
        invoice: mockedInvoice,
        status: mockedInvoice.status as string,
      };
      jest
        .spyOn(paymentService, 'getInvoiceLineItems')
        .mockResolvedValue(mockedInvoice.lines as Stripe.Response<Stripe.ApiList<Stripe.InvoiceLineItem>>);
      const reactivateObjectStorageAccountSpy = jest
        .spyOn(objectStorageWebhookHandler, 'reactivateObjectStorageAccount')
        .mockResolvedValue();
      const getTierProductsByProductIdsSpy = jest.spyOn(tiersService, 'getTierProductsByProductsId');

      await invoiceCompletedHandler.run(invoiceCompletedHandlerPayload);

      expect(reactivateObjectStorageAccountSpy).toHaveBeenCalledWith(mockedCustomer, mockedInvoice);
      expect(getTierProductsByProductIdsSpy).not.toHaveBeenCalled();
    });

    test('When an unexpected error occurs while fetching the tier product, then an error indicating so is thrown', async () => {
      const unexpectedError = new Error('Unexpected error');
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        customer: mockedCustomer.id,
        status: 'paid',
      });
      const invoiceCompletedHandlerPayload: InvoiceCompletedHandlerPayload = {
        customer: mockedCustomer,
        invoice: mockedInvoice,
        status: mockedInvoice.status as string,
      };

      jest
        .spyOn(paymentService, 'getInvoiceLineItems')
        .mockResolvedValue(mockedInvoice.lines as Stripe.Response<Stripe.ApiList<Stripe.InvoiceLineItem>>);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(unexpectedError);

      await expect(invoiceCompletedHandler.run(invoiceCompletedHandlerPayload)).rejects.toThrow(unexpectedError);
    });

    test('When the user purchases an old product, then only the storage is updated', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        customer: mockedCustomer.id,
        status: 'paid',
      });
      const invoiceCompletedHandlerPayload: InvoiceCompletedHandlerPayload = {
        customer: mockedCustomer,
        invoice: mockedInvoice,
        status: mockedInvoice.status as string,
      };
      const mockedUser = getUser();
      const maxSpaceBytes = Number(mockedInvoice.lines.data[0].price?.metadata.maxSpaceBytes);

      jest
        .spyOn(paymentService, 'getInvoiceLineItems')
        .mockResolvedValue(mockedInvoice.lines as Stripe.Response<Stripe.ApiList<Stripe.InvoiceLineItem>>);
      const getTierProductsByProductIdsSpy = jest
        .spyOn(tiersService, 'getTierProductsByProductsId')
        .mockRejectedValue(new TierNotFoundError('Tier not found'));
      jest.spyOn(invoiceCompletedHandler as any, 'getUserUuid').mockResolvedValue({ uuid: mockedUser.uuid });
      jest.spyOn(invoiceCompletedHandler as any, 'updateOrInsertUser').mockResolvedValue(voidPromise);
      const handleOldProductSpy = jest
        .spyOn(invoiceCompletedHandler as any, 'handleOldProduct')
        .mockResolvedValue(voidPromise);
      const handleNewProductSpy = jest.spyOn(invoiceCompletedHandler as any, 'handleNewProduct');
      const updateOrInsertUserTierSpy = jest.spyOn(invoiceCompletedHandler as any, 'updateOrInsertUserTier');
      jest.spyOn(invoiceCompletedHandler as any, 'handleUserCouponRelationship').mockResolvedValue(voidPromise);
      jest.spyOn(invoiceCompletedHandler as any, 'clearUserRelatedCache').mockResolvedValue(voidPromise);

      await invoiceCompletedHandler.run(invoiceCompletedHandlerPayload);

      expect(getTierProductsByProductIdsSpy).toHaveBeenCalledWith(
        (mockedInvoice.lines.data[0].price!.product as Stripe.Product).id,
        'subscription',
      );
      expect(handleOldProductSpy).toHaveBeenCalledWith(mockedUser.uuid, maxSpaceBytes);
      expect(handleNewProductSpy).not.toHaveBeenCalled();
      expect(updateOrInsertUserTierSpy).not.toHaveBeenCalled();
    });

    test('When the user purchases a new product, then the correct features are applied and the user-tier relationship is inserted/updated', async () => {
      const mockedCustomer = getCustomer();
      const mockedInvoice = getInvoice({
        customer: mockedCustomer.id,
        status: 'paid',
      });
      const invoiceCompletedHandlerPayload: InvoiceCompletedHandlerPayload = {
        customer: mockedCustomer,
        invoice: mockedInvoice,
        status: mockedInvoice.status as string,
      };
      const mockedTier = newTier();
      const mockedUser = getUser();

      jest
        .spyOn(paymentService, 'getInvoiceLineItems')
        .mockResolvedValue(mockedInvoice.lines as Stripe.Response<Stripe.ApiList<Stripe.InvoiceLineItem>>);
      const getTierProductsByProductIdsSpy = jest
        .spyOn(tiersService, 'getTierProductsByProductsId')
        .mockResolvedValue(mockedTier);
      jest.spyOn(invoiceCompletedHandler as any, 'getUserUuid').mockResolvedValue({ uuid: mockedUser.uuid });
      jest.spyOn(invoiceCompletedHandler as any, 'updateOrInsertUser').mockResolvedValue(voidPromise);
      const handleOldProductSpy = jest.spyOn(invoiceCompletedHandler as any, 'handleOldProduct');
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const handleNewProductSpy = jest
        .spyOn(invoiceCompletedHandler as any, 'handleNewProduct')
        .mockResolvedValue(voidPromise);
      const updateOrInsertUserTierSpy = jest
        .spyOn(invoiceCompletedHandler as any, 'updateOrInsertUserTier')
        .mockResolvedValue(voidPromise);
      jest.spyOn(invoiceCompletedHandler as any, 'clearUserRelatedCache').mockResolvedValue(voidPromise);

      await invoiceCompletedHandler.run(invoiceCompletedHandlerPayload);

      expect(getTierProductsByProductIdsSpy).toHaveBeenCalledWith(
        (mockedInvoice.lines.data[0].price!.product as Stripe.Product).id,
        'subscription',
      );
      expect(handleOldProductSpy).not.toHaveBeenCalled();
      expect(handleNewProductSpy).toHaveBeenCalledWith({
        user: { ...mockedUser, email: mockedCustomer.email as string },
        isLifetimePlan: false,
        productId: (mockedInvoice.lines.data[0].price!.product as Stripe.Product).id,
        customer: mockedCustomer,
        tier: mockedTier,
        totalQuantity: 1,
      });
      expect(updateOrInsertUserTierSpy).toHaveBeenCalledWith({
        isBusinessPlan: false,
        userId: mockedUser.id,
        newTier: mockedTier,
      });
    });
  });

  describe('User Data Processing', () => {
    test('When user is found by email, then it should return user unique Id', async () => {
      const mockedCustomer = getCustomer({
        email: 'test@inxt.com',
      });
      const mockedUser = getUser({
        customerId: mockedCustomer.id,
      });
      jest.spyOn(usersService, 'findUserByEmail').mockResolvedValue({
        data: {
          email: mockedCustomer.email as string,
          uuid: mockedUser.uuid,
        },
      });

      const getUserUuid = invoiceCompletedHandler['getUserUuid'].bind(invoiceCompletedHandler);
      const result = await getUserUuid(mockedCustomer.id, mockedCustomer.email as string);

      expect(result).toStrictEqual({
        uuid: mockedUser.uuid,
      });
    });

    test('When user is not found by email but found by customer ID, then it should return user unique Id', async () => {
      const mockedCustomer = getCustomer({
        email: undefined,
      });
      const mockedUser = getUser({
        customerId: mockedCustomer.id,
      });
      const findByCustomerIdSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);

      const getUserUuid = invoiceCompletedHandler['getUserUuid'].bind(invoiceCompletedHandler);
      const result = await getUserUuid(mockedCustomer.id, mockedCustomer.email);

      expect(result).toStrictEqual({
        uuid: mockedUser.uuid,
      });
      expect(findByCustomerIdSpy).toHaveBeenCalled();
    });

    test('When user is not found by email or customer ID, then an error indicating so is thrown', async () => {
      const mockedCustomer = getCustomer({
        email: undefined,
      });
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(new Error());

      const getUserUuid = invoiceCompletedHandler['getUserUuid'].bind(invoiceCompletedHandler);

      await expect(getUserUuid(mockedCustomer.id, mockedCustomer.email)).rejects.toThrow(NotFoundError);
    });
  });

  describe('Get price data', () => {
    test('When the price data is required, then the needed data is returned', () => {
      const mockedInvoice = getInvoice();
      const mockedPrice = mockedInvoice.lines.data[0].price as Stripe.Price;

      const getPriceData = invoiceCompletedHandler['getPriceData'].bind(invoiceCompletedHandler);
      const result = getPriceData(mockedPrice);

      expect(result).toStrictEqual({
        productId: (mockedPrice.product as Stripe.Product).id,
        productType: (mockedPrice.product as Stripe.Product).metadata.type,
        planType: mockedPrice.metadata.planType,
        maxSpaceBytes: mockedPrice.metadata.maxSpaceBytes,
      });
    });
  });

  describe('Update or Insert User', () => {
    test('When user exists, then it should update existing user', async () => {
      const mockedUser = getUser();
      jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
      const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockResolvedValue();
      const insertUserSpy = jest.spyOn(usersService, 'insertUser');

      const updateOrInsertUser = invoiceCompletedHandler['updateOrInsertUser'].bind(invoiceCompletedHandler);
      await updateOrInsertUser({
        customerId: mockedUser.customerId,
        userUuid: mockedUser.uuid,
        isBusinessPlan: false,
        isLifetimePlan: false,
      });

      expect(updateUserSpy).toHaveBeenCalledTimes(1);
      expect(updateUserSpy).toHaveBeenCalledWith(mockedUser.customerId, {
        lifetime: mockedUser.lifetime,
        uuid: mockedUser.uuid,
      });
      expect(insertUserSpy).not.toHaveBeenCalled();
    });

    test('When user does not exist, then it should insert new user', async () => {
      const mockedUser = getUser();
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(new UserNotFoundError());
      const updateUserSpy = jest.spyOn(usersService, 'updateUser');
      const insertUserSpy = jest.spyOn(usersService, 'insertUser').mockResolvedValue();

      const updateOrInsertUser = invoiceCompletedHandler['updateOrInsertUser'].bind(invoiceCompletedHandler);
      await updateOrInsertUser({
        customerId: mockedUser.customerId,
        userUuid: mockedUser.uuid,
        isBusinessPlan: false,
        isLifetimePlan: false,
      });

      expect(updateUserSpy).not.toHaveBeenCalled();
      expect(insertUserSpy).toHaveBeenCalledTimes(1);
      expect(insertUserSpy).toHaveBeenCalledWith({
        customerId: mockedUser.customerId,
        lifetime: mockedUser.lifetime,
        uuid: mockedUser.uuid,
      });
    });

    test('When there is an unexpected error while updating the user, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const unexpectedError = new Error('Unexpected error');
      jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(unexpectedError);
      const insertUserSpy = jest.spyOn(usersService, 'insertUser').mockResolvedValue();

      const updateOrInsertUser = invoiceCompletedHandler['updateOrInsertUser'].bind(invoiceCompletedHandler);
      await expect(
        updateOrInsertUser({
          customerId: mockedUser.customerId,
          userUuid: mockedUser.uuid,
          isBusinessPlan: false,
          isLifetimePlan: false,
        }),
      ).rejects.toThrow(unexpectedError);
      expect(insertUserSpy).not.toHaveBeenCalled();
    });
  });

  describe('Old Product Management', () => {
    test('When processing old product, then it should call storage service with correct parameters', async () => {
      const mockedUser = getUser();
      const mockedFreeTier = newTier({
        featuresPerService: {
          drive: {
            foreignTierId: 'free',
          },
        } as any,
      });
      const mockedMaxSpaceBytes = 100;
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedFreeTier);
      const changeStorageSpy = jest.spyOn(storageService, 'updateUserStorageAndTier').mockResolvedValue();

      const handleOldProduct = invoiceCompletedHandler['handleOldProduct'].bind(invoiceCompletedHandler);
      await handleOldProduct(mockedUser.uuid, mockedMaxSpaceBytes);

      expect(changeStorageSpy).toHaveBeenCalledWith(
        mockedUser.uuid,
        mockedMaxSpaceBytes,
        mockedFreeTier.featuresPerService.drive.foreignTierId,
      );
    });
  });

  describe('Tier Management (New products)', () => {
    describe('The user purchases a lifetime', () => {
      test('When determining the lifetime conditions, then apply the features correctly', async () => {
        const mockedUser = getUser();
        const mockedCustomer = getCustomer({
          email: 'test@inxt.com',
        });
        const mockedMaxSpaceBytes = 100;
        const lifetimeMockedMaxSpaceBytes = mockedMaxSpaceBytes * 5;
        const mockedIsLifetimePlan = true;
        const mockedProductId = getProduct({}).id;
        const totalQuantity = 1;
        const mockedTier = newTier();
        const mockedLifetimeTier = newTier({ billingType: 'lifetime' });
        const determineLifetimeConditionsSpy = jest.spyOn(determineLifetimeConditions, 'determine').mockResolvedValue({
          maxSpaceBytes: lifetimeMockedMaxSpaceBytes,
          tier: mockedLifetimeTier,
        });
        const applyDriveFeaturesSpy = jest.spyOn(tiersService, 'applyDriveFeatures').mockResolvedValue();
        const applyVpnFeaturesSpy = jest.spyOn(tiersService, 'applyVpnFeatures').mockResolvedValue();

        const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);
        await handleNewProduct({
          user: {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          customer: mockedCustomer,
          isLifetimePlan: mockedIsLifetimePlan,
          productId: mockedProductId,
          totalQuantity,
          tier: mockedTier,
        });

        expect(determineLifetimeConditionsSpy).toHaveBeenCalledWith(mockedUser, mockedProductId);
        expect(applyDriveFeaturesSpy).toHaveBeenCalledWith(
          {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          mockedCustomer,
          totalQuantity,
          mockedLifetimeTier,
          expect.anything(),
          lifetimeMockedMaxSpaceBytes,
        );
        expect(applyVpnFeaturesSpy).toHaveBeenCalledWith(
          {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          mockedLifetimeTier,
        );
      });

      test('When an error occurs while determining the lifetime conditions, then a log is printed but the flow continues with the default tier', async () => {
        const unexpectedError = new Error('Unexpected error');
        const mockedUser = getUser();
        const mockedCustomer = getCustomer({
          email: 'test@inxt.com',
        });
        const mockedIsLifetimePlan = true;
        const mockedProductId = getProduct({}).id;
        const totalQuantity = 1;
        const mockedTier = newTier();
        const determineLifetimeConditionsSpy = jest
          .spyOn(determineLifetimeConditions, 'determine')
          .mockRejectedValue(unexpectedError);
        const applyDriveFeaturesSpy = jest.spyOn(tiersService, 'applyDriveFeatures').mockResolvedValue();
        const applyVpnFeaturesSpy = jest.spyOn(tiersService, 'applyVpnFeatures').mockResolvedValue();

        const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);
        await handleNewProduct({
          user: {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          customer: mockedCustomer,
          isLifetimePlan: mockedIsLifetimePlan,
          productId: mockedProductId,
          totalQuantity,
          tier: mockedTier,
        });

        expect(determineLifetimeConditionsSpy).toHaveBeenCalledWith(mockedUser, mockedProductId);
        expect(applyDriveFeaturesSpy).toHaveBeenCalledWith(
          {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          mockedCustomer,
          totalQuantity,
          mockedTier,
          expect.anything(),
          undefined,
        );
        expect(applyVpnFeaturesSpy).toHaveBeenCalledWith(
          {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          mockedTier,
        );
      });
    });

    test('When the user purchases a subscription, then all features are applied correctly', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        email: 'test@inxt.com',
      });
      const mockedIsLifetimePlan = false;
      const mockedProductId = getProduct({}).id;
      const totalQuantity = 1;
      const mockedTier = newTier();

      const applyDriveFeaturesSpy = jest.spyOn(tiersService, 'applyDriveFeatures').mockResolvedValue();
      const applyVpnFeaturesSpy = jest.spyOn(tiersService, 'applyVpnFeatures').mockResolvedValue();

      const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);
      await handleNewProduct({
        user: {
          ...mockedUser,
          email: mockedCustomer.email as string,
        },
        customer: mockedCustomer,
        isLifetimePlan: mockedIsLifetimePlan,
        productId: mockedProductId,
        totalQuantity,
        tier: mockedTier,
      });

      expect(applyDriveFeaturesSpy).toHaveBeenCalledWith(
        {
          ...mockedUser,
          email: mockedCustomer.email as string,
        },
        mockedCustomer,
        totalQuantity,
        mockedTier,
        expect.anything(),
        undefined,
      );
      expect(applyVpnFeaturesSpy).toHaveBeenCalledWith(
        {
          ...mockedUser,
          email: mockedCustomer.email as string,
        },
        mockedTier,
      );
    });

    test('When something goes wrong while applying Drive features, then an error indicating so is thrown', async () => {
      const mockedError = new Error('Failed to apply Drive features to user');
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        email: 'test@inxt.com',
      });
      const mockedIsLifetimePlan = false;
      const mockedProductId = getProduct({}).id;
      const totalQuantity = 1;
      const mockedTier = newTier();
      jest.spyOn(tiersService, 'applyDriveFeatures').mockRejectedValue(mockedError);
      const loggerSpy = jest.spyOn(Logger, 'error');

      const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);
      await expect(
        handleNewProduct({
          user: {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          customer: mockedCustomer,
          isLifetimePlan: mockedIsLifetimePlan,
          productId: mockedProductId,
          totalQuantity,
          tier: mockedTier,
        }),
      ).rejects.toThrow(mockedError);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Failed to apply drive features for user ${mockedUser.uuid} with customerId ${mockedCustomer.id}`,
        {
          error: mockedError.message,
        },
      );
    });

    test('When something goes wrong while applying VPN features, then an error indicating so is thrown', async () => {
      const mockedError = new Error('Failed to apply VPN features to user');
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        email: 'test@inxt.com',
      });
      const mockedIsLifetimePlan = false;
      const mockedProductId = getProduct({}).id;
      const totalQuantity = 1;
      const mockedTier = newTier();
      jest.spyOn(tiersService, 'applyDriveFeatures').mockResolvedValue();
      jest.spyOn(tiersService, 'applyVpnFeatures').mockRejectedValue(mockedError);
      const loggerSpy = jest.spyOn(Logger, 'error');

      const handleNewProduct = invoiceCompletedHandler['handleNewProduct'].bind(invoiceCompletedHandler);

      await expect(
        handleNewProduct({
          user: {
            ...mockedUser,
            email: mockedCustomer.email as string,
          },
          customer: mockedCustomer,
          isLifetimePlan: mockedIsLifetimePlan,
          productId: mockedProductId,
          totalQuantity,
          tier: mockedTier,
        }),
      ).rejects.toThrow(mockedError);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Failed to apply VPN features for user ${mockedUser.uuid} with customerId ${mockedCustomer.id}`,
        {
          error: mockedError.message,
        },
      );
    });
  });

  describe('User-Tier Relationship', () => {
    describe('Individual plans', () => {
      test('When matching tier exists for individual plan, then it should update existing tier', async () => {
        const isBusinessPlan = false;
        const mockedUserId = getUser().id;
        const mockedTier = newTier();
        const mockedIndividualTier = newTier();

        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedIndividualTier]);

        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await updateOrInsertUserTier({
          userId: mockedUserId,
          newTier: mockedTier,
          isBusinessPlan,
        });

        expect(updateTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedIndividualTier.id, mockedTier.id);
        expect(insertTierToUserSpy).not.toHaveBeenCalled();
      });

      test('When user with both subscriptions redeems business plan, then existing business tier gets updated', async () => {
        const isBusinessPlan = false;
        const mockedUserId = getUser().id;
        const mockedTier = newTier();
        const mockedIndividualTier = newTier();
        const mockedBusinessTier = newTier({
          featuresPerService: {
            drive: {
              workspaces: {
                enabled: true,
              },
            },
          } as any,
        });

        jest
          .spyOn(tiersService, 'getTiersProductsByUserId')
          .mockResolvedValue([mockedIndividualTier, mockedBusinessTier]);

        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await updateOrInsertUserTier({
          userId: mockedUserId,
          newTier: mockedTier,
          isBusinessPlan,
        });

        expect(updateTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedIndividualTier.id, mockedTier.id);
        expect(insertTierToUserSpy).not.toHaveBeenCalled();
      });

      test('When billing the billing type for the new tier is different, then the tier is updated', async () => {
        const userId = getUser().id;
        const currentTier = newTier({ billingType: 'subscription' });
        const newTierInstance = newTier({ billingType: 'lifetime' });

        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([currentTier]);
        const updateSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();

        const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await updateOrInsertUserTier({ userId, newTier: newTierInstance, isBusinessPlan: false });

        expect(updateSpy).toHaveBeenCalledWith(userId, currentTier.id, newTierInstance.id);
      });

      test('When the new tier is lifetime and the user already had one, then the remaining tier should be the one that has more space bytes', async () => {
        const userId = getUser().id;
        const currentTier = newTier({
          id: 'tier-1',
          billingType: 'lifetime',
          featuresPerService: {
            [Service.Drive]: { maxSpaceBytes: 100, workspaces: { enabled: false } },
          } as any,
        });

        const newTierInstance = newTier({
          id: 'tier-2',
          billingType: 'lifetime',
          featuresPerService: {
            [Service.Drive]: { maxSpaceBytes: 500, workspaces: { enabled: false } },
          } as any,
        });

        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([currentTier]);
        const updateSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();

        const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await updateOrInsertUserTier({ userId, newTier: newTierInstance, isBusinessPlan: false });

        expect(updateSpy).toHaveBeenCalledWith(userId, currentTier.id, newTierInstance.id);
      });

      test('When the user previously had a subscription and the new tier is lifetime, then the user-tier relationship is updated to the lifetime tier', async () => {
        const userId = getUser().id;
        const currentTier = newTier({
          id: 'tier-1',
          billingType: 'subscription',
        });

        const newTierInstance = newTier({
          id: 'tier-2',
          billingType: 'lifetime',
        });

        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([currentTier]);
        const updateSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();

        const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await updateOrInsertUserTier({ userId, newTier: newTierInstance, isBusinessPlan: false });

        expect(updateSpy).toHaveBeenCalledWith(userId, currentTier.id, newTierInstance.id);
      });

      test('When no matching tier exists (individual), then it should insert new tier', async () => {
        const isBusinessPlan = false;
        const mockedUserId = getUser().id;
        const mockedTier = newTier();

        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([]);

        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await updateOrInsertUserTier({
          userId: mockedUserId,
          newTier: mockedTier,
          isBusinessPlan,
        });

        expect(insertTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedTier.id);
        expect(updateTierToUserSpy).not.toHaveBeenCalled();
      });
    });

    describe('Business plans', () => {
      test('When matching tier exists for business plan, then it should update existing tier', async () => {
        const isBusinessPlan = true;
        const mockedUserId = getUser().id;
        const mockedTier = newTier();
        const mockedBusinessTier = newTier({
          featuresPerService: {
            drive: {
              workspaces: {
                enabled: true,
              },
            },
          } as any,
        });
        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedBusinessTier]);
        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await updateOrInsertUserTier({
          userId: mockedUserId,
          newTier: mockedTier,
          isBusinessPlan,
        });

        expect(updateTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedBusinessTier.id, mockedTier.id);
        expect(insertTierToUserSpy).not.toHaveBeenCalled();
      });

      test('When user with both subscriptions redeems business plan, then existing business tier gets updated', async () => {
        const isBusinessPlan = true;
        const mockedUserId = getUser().id;
        const mockedTier = newTier();
        const mockedIndividualTier = newTier();
        const mockedBusinessTier = newTier({
          featuresPerService: {
            drive: {
              workspaces: {
                enabled: true,
              },
            },
          } as any,
        });

        jest
          .spyOn(tiersService, 'getTiersProductsByUserId')
          .mockResolvedValue([mockedIndividualTier, mockedBusinessTier]);

        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await updateOrInsertUserTier({
          userId: mockedUserId,
          newTier: mockedTier,
          isBusinessPlan,
        });

        expect(updateTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedBusinessTier.id, mockedTier.id);
        expect(insertTierToUserSpy).not.toHaveBeenCalled();
      });

      test('When no matching tier exists (business), then it should insert new tier', async () => {
        const isBusinessPlan = true;
        const mockedUserId = getUser().id;
        const mockedTier = newTier();
        const mockedIndividualTier = newTier();

        jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedIndividualTier]);
        const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
        const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

        const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
        await updateOrInsertUserTier({
          userId: mockedUserId,
          newTier: mockedTier,
          isBusinessPlan,
        });

        expect(insertTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedTier.id);
        expect(updateTierToUserSpy).not.toHaveBeenCalled();
      });
    });

    test('When no matching tier exists (business), then it should insert new tier', async () => {
      const isBusinessPlan = true;
      const mockedUserId = getUser().id;
      const mockedTier = newTier();
      const mockedIndividualTier = newTier();

      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedIndividualTier]);

      const updateTierToUserSpy = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
      const insertTierToUserSpy = jest.spyOn(tiersService, 'insertTierToUser').mockResolvedValue();

      const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
      await updateOrInsertUserTier({
        userId: mockedUserId,
        newTier: mockedTier,
        isBusinessPlan,
      });

      expect(insertTierToUserSpy).toHaveBeenCalledWith(mockedUserId, mockedTier.id);
      expect(updateTierToUserSpy).not.toHaveBeenCalled();
    });

    test('When an error occurs while updating user tier, then an error indicating so is thrown', async () => {
      const usersTiersError = new UsersTiersError('User tiers error');
      const isBusinessPlan = false;
      const mockedUserId = getUser().id;
      const mockedTier = newTier({
        billingType: 'subscription',
        id: 'tier-1',
      });
      const mockedIndividualTier = newTier({
        billingType: 'subscription',
        id: 'tier-2',
      });
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedIndividualTier]);
      jest.spyOn(tiersService, 'updateTierToUser').mockRejectedValue(usersTiersError);
      const loggerSpy = jest.spyOn(Logger, 'error');

      const updateOrInsertUserTier = invoiceCompletedHandler['updateOrInsertUserTier'].bind(invoiceCompletedHandler);
      await expect(
        updateOrInsertUserTier({
          userId: mockedUserId,
          newTier: mockedTier,
          isBusinessPlan,
        }),
      ).rejects.toThrow(usersTiersError);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Error while updating or inserting the user-tier relationship. Error: Error: User tiers error`,
      );
    });
  });

  describe('User-Coupon Relationship', () => {
    test('When lifetime plan has discount, then it should store coupon from line item', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        lines: {
          data: [
            {
              discounts: [
                {
                  coupon: {
                    id: 'mocked-coupon',
                  },
                } as any,
              ],
            },
          ],
        },
      });
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockResolvedValue();

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);
      await handleUserCouponRelationship({
        userUuid: mockedUser.uuid,
        invoice: mockedInvoice,
        invoiceLineItem: mockedInvoice.lines.data[0],
        isLifetimePlan: true,
      });

      expect(storeCouponUsedByUserSpy).toHaveBeenCalledWith(
        mockedUser,
        (mockedInvoice.lines.data[0].discounts[0] as Stripe.Discount).coupon.id,
      );
    });

    test('When subscription plan has discount, then it should store coupon from invoice', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        discount: {
          coupon: {
            id: 'mocked-coupon',
          },
        } as any,
      });
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockResolvedValue();

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);
      await handleUserCouponRelationship({
        userUuid: mockedUser.uuid,
        invoice: mockedInvoice,
        invoiceLineItem: mockedInvoice.lines.data[0],
        isLifetimePlan: false,
      });

      expect(storeCouponUsedByUserSpy).toHaveBeenCalledWith(mockedUser, mockedInvoice.discount?.coupon.id);
    });

    test('When no discount exists, then the flow continues', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        discount: null,
      });
      const mockedInvoiceLineItem = {
        ...mockedInvoice.lines.data[0],
        discounts: [],
      };
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockResolvedValue();

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);
      await handleUserCouponRelationship({
        userUuid: mockedUser.uuid,
        invoice: mockedInvoice,
        invoiceLineItem: mockedInvoiceLineItem,
        isLifetimePlan: false,
      });

      expect(storeCouponUsedByUserSpy).not.toHaveBeenCalled();
    });

    test('When the coupon code is not tracked, then an error is caught and the flow continues without storing the coupon', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        discount: {
          coupon: {
            id: 'mocked-coupon',
          },
        } as any,
      });
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest
        .spyOn(usersService, 'storeCouponUsedByUser')
        .mockRejectedValue(new CouponNotBeingTrackedError('Coupon not tracked'));
      const loggerSpy = jest.spyOn(Logger, 'error');

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);
      await expect(
        handleUserCouponRelationship({
          userUuid: mockedUser.uuid,
          invoice: mockedInvoice,
          invoiceLineItem: mockedInvoice.lines.data[0],
          isLifetimePlan: false,
        }),
      ).resolves.not.toThrow();
      expect(storeCouponUsedByUserSpy).toHaveBeenCalledWith(mockedUser, 'mocked-coupon');
      expect(loggerSpy).not.toHaveBeenCalled();
    });

    test('When an unexpected error occurs while storing the coupon, then an error is logged and is thrown', async () => {
      const randomError = new Error('Random error');
      const mockedUser = getUser();
      const mockedInvoice = getInvoice({
        discount: {
          coupon: {
            id: 'mocked-coupon',
          },
        } as any,
      });
      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      const storeCouponUsedByUserSpy = jest.spyOn(usersService, 'storeCouponUsedByUser').mockRejectedValue(randomError);
      const loggerSpy = jest.spyOn(Logger, 'error');

      const handleUserCouponRelationship =
        invoiceCompletedHandler['handleUserCouponRelationship'].bind(invoiceCompletedHandler);
      await expect(
        handleUserCouponRelationship({
          userUuid: mockedUser.uuid,
          invoice: mockedInvoice,
          invoiceLineItem: mockedInvoice.lines.data[0],
          isLifetimePlan: false,
        }),
      ).rejects.toThrow(randomError);
      expect(storeCouponUsedByUserSpy).toHaveBeenCalledWith(mockedUser, 'mocked-coupon');
      expect(loggerSpy).toHaveBeenCalledWith(`Error while adding user ${mockedUser.uuid} and coupon: Random error`);
    });
  });

  describe('Cache Clearing', () => {
    test('When cache clearing succeeds, then it should log success message', async () => {
      const { customerId, uuid: userUuid } = getUser();
      const clearSubscriptionSpy = jest.spyOn(cacheService, 'clearSubscription').mockResolvedValue();
      const clearUsedUserPromoCodesSpy = jest.spyOn(cacheService, 'clearUsedUserPromoCodes').mockResolvedValue();
      const clearUserTierSpy = jest.spyOn(cacheService, 'clearUserTier').mockResolvedValue();
      const loggerSpy = jest.spyOn(Logger, 'info');

      const clearUserRelatedCache = invoiceCompletedHandler['clearUserRelatedCache'].bind(invoiceCompletedHandler);
      await clearUserRelatedCache(customerId, userUuid);

      expect(clearSubscriptionSpy).toHaveBeenCalledWith(customerId);
      expect(clearUsedUserPromoCodesSpy).toHaveBeenCalledWith(customerId);
      expect(clearUserTierSpy).toHaveBeenCalledWith(userUuid);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Cache for user with uuid: ${userUuid} and customer Id: ${customerId} has been cleaned`,
      );
    });

    test('When cache clearing fails, then it should log an error and throw', async () => {
      const randomError = new Error('Random error');
      const { customerId, uuid: userUuid } = getUser();
      jest.spyOn(cacheService, 'clearSubscription').mockRejectedValue(randomError);
      const loggerSpy = jest.spyOn(Logger, 'error');

      const clearUserRelatedCache = invoiceCompletedHandler['clearUserRelatedCache'].bind(invoiceCompletedHandler);

      await expect(clearUserRelatedCache(customerId, userUuid)).rejects.toThrow(randomError);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Error while trying to clear the cache in invoice completed handler for the customer ${customerId}. Error: ${randomError.message}`,
      );
    });
  });
});
