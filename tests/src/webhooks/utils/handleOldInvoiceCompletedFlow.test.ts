import axios from 'axios';
import config from '../../../../src/config';
import { CouponsRepository } from '../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { ProductsRepository } from '../../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../../src/services/bit2me.service';
import { PaymentService } from '../../../../src/services/payment.service';
import { createOrUpdateUser, updateUserTier } from '../../../../src/services/storage.service';
import { NoSubscriptionSeatsProvidedError } from '../../../../src/services/tiers.service';
import { UsersService } from '../../../../src/services/users.service';
import { getCustomer, getLogger, getProduct, getUser } from '../../fixtures';
import testFactory from '../../utils/factory';
import Stripe from 'stripe';
import { handleOldInvoiceCompletedFlow } from '../../../../src/webhooks/utils/handleOldInvoiceCompletedFlow';

// jest
//   .spyOn(require('../../../../src/services/storage.service'), 'createOrUpdateUser')
//   .mockImplementation(() => Promise.resolve() as any);

const logger = getLogger();

let tiersRepository: TiersRepository;
let paymentService: PaymentService;
let usersService: UsersService;
let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let bit2MeService: Bit2MeService;

beforeEach(() => {
  tiersRepository = testFactory.getTiersRepository();
  usersRepository = testFactory.getUsersRepositoryForTest();
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

  jest
    .spyOn(require('../../../../src/services/storage.service'), 'createOrUpdateUser')
    .mockImplementation(() => Promise.resolve());
  jest
    .spyOn(require('../../../../src/services/storage.service'), 'updateUserTier')
    .mockImplementation(() => Promise.resolve() as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('When the user completes a successful payment (Old flow)', () => {
  describe('Business plans', () => {
    it("When it's a business plan and there are no subscription seats, then an error indicating so is thrown", async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedProduct = getProduct();

      await expect(
        handleOldInvoiceCompletedFlow({
          config,
          customer: mockedCustomer,
          isBusinessPlan: true,
          log: logger,
          maxSpaceBytes: '10',
          subscriptionSeats: null,
          product: mockedProduct,
          usersService,
          userUuid: mockedUser.uuid,
        }),
      ).rejects.toThrow(NoSubscriptionSeatsProvidedError);
    });

    describe('All params are correct', () => {
      it('When the user does not have any workspace and something unexpected occurs, then an error indicating so is thrown', async () => {
        const mockedUser = getUser();
        const mockedCustomer = getCustomer({
          id: mockedUser.customerId,
        });
        const mockedProduct = getProduct();

        jest.spyOn(usersService, 'updateWorkspaceStorage').mockRejectedValue({});

        await expect(
          handleOldInvoiceCompletedFlow({
            config,
            customer: mockedCustomer,
            isBusinessPlan: true,
            log: logger,
            maxSpaceBytes: '10',
            subscriptionSeats: 3,
            product: mockedProduct,
            usersService,
            userUuid: mockedUser.uuid,
          }),
        ).rejects.toThrow(Error);
      });

      it('When the user does not have any workspace, then a new one should be created', async () => {
        const mockedUser = getUser();
        const mockedCustomer = getCustomer({
          id: mockedUser.customerId,
        });
        const mockedProduct = getProduct();

        jest.spyOn(usersService, 'updateWorkspaceStorage').mockRejectedValue({
          response: { status: 404 },
        });

        const initializeWorkspaceSpy = jest.spyOn(usersService, 'initializeWorkspace').mockResolvedValue();

        await handleOldInvoiceCompletedFlow({
          config,
          customer: mockedCustomer,
          isBusinessPlan: true,
          log: logger,
          maxSpaceBytes: '10',
          subscriptionSeats: 3,
          product: mockedProduct,
          usersService,
          userUuid: mockedUser.uuid,
        });

        expect(initializeWorkspaceSpy).toHaveBeenCalledTimes(1);
        expect(createOrUpdateUser).not.toHaveBeenCalled();
        expect(updateUserTier).not.toHaveBeenCalled();
      });

      it('When the user have a workspace, then the existing workspace is updated', async () => {
        const mockedUser = getUser();
        const mockedCustomer = getCustomer({
          id: mockedUser.customerId,
        });
        const mockedProduct = getProduct();

        const updateWorkspaceStorageSpy = jest.spyOn(usersService, 'updateWorkspaceStorage').mockResolvedValue();
        const initializeWorkspaceSpy = jest.spyOn(usersService, 'initializeWorkspace').mockResolvedValue();

        await handleOldInvoiceCompletedFlow({
          config,
          customer: mockedCustomer,
          isBusinessPlan: true,
          log: logger,
          maxSpaceBytes: '10',
          subscriptionSeats: 3,
          product: mockedProduct,
          usersService,
          userUuid: mockedUser.uuid,
        });

        expect(updateWorkspaceStorageSpy).toHaveBeenCalledTimes(1);
        expect(initializeWorkspaceSpy).toHaveBeenCalledTimes(0);
        expect(createOrUpdateUser).not.toHaveBeenCalled();
        expect(updateUserTier).not.toHaveBeenCalled();
      });
    });
  });

  describe('Individual plans', () => {
    it('When the subscription is individual, then the user space and tier are updated', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedProduct = getProduct();

      await handleOldInvoiceCompletedFlow({
        config,
        customer: mockedCustomer,
        isBusinessPlan: false,
        log: logger,
        maxSpaceBytes: '10',
        subscriptionSeats: 3,
        product: mockedProduct,
        usersService,
        userUuid: mockedUser.uuid,
      });

      expect(createOrUpdateUser).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
    });

    it('When the user space update fails, then an error indicating so is thrown and the tier should not be updated', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedProduct = getProduct();

      (createOrUpdateUser as jest.Mock).mockRejectedValue(new Error('Failed to update user storage'));

      await expect(
        handleOldInvoiceCompletedFlow({
          config,
          customer: mockedCustomer,
          isBusinessPlan: false,
          log: logger,
          maxSpaceBytes: '10',
          subscriptionSeats: 3,
          product: mockedProduct,
          usersService,
          userUuid: mockedUser.uuid,
        }),
      ).rejects.toThrow(Error);
      expect(createOrUpdateUser).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(0);
    });

    it('When the user tier update fails, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedProduct = getProduct();

      (updateUserTier as jest.Mock).mockRejectedValue(new Error('Failed to update user storage'));

      await expect(
        handleOldInvoiceCompletedFlow({
          config,
          customer: mockedCustomer,
          isBusinessPlan: false,
          log: logger,
          maxSpaceBytes: '10',
          subscriptionSeats: 3,
          product: mockedProduct,
          usersService,
          userUuid: mockedUser.uuid,
        }),
      ).rejects.toThrow(Error);
      expect(createOrUpdateUser).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
    });
  });
});
