import config from '../../../../src/config';
import { updateUserTier } from '../../../../src/services/storage.service';
import { NoSubscriptionSeatsProvidedError } from '../../../../src/services/tiers.service';
import { getCustomer, getLogger, getProduct, getUser, voidPromise } from '../../fixtures';
import { handleOldInvoiceCompletedFlow } from '../../../../src/webhooks/utils/handleOldInvoiceCompletedFlow';
import { createTestServices } from '../../helpers/services-factory';

jest.mock('../../../../src/services/storage.service', () => ({
  ...jest.requireActual('../../../src/services/storage.service'),
  updateUserTier: jest.fn().mockResolvedValue(() => {}),
}));
const logger = getLogger();
const { usersService, storageService } = createTestServices();

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('When the user completes a successful payment (Old flow)', () => {
  describe('Business plans', () => {
    it("When it's a business plan and there are no subscription seats, then an error indicating so is thrown", async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedProduct = getProduct({});

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
          storageService,
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
        const mockedProduct = getProduct({});

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
            storageService,
            userUuid: mockedUser.uuid,
          }),
        ).rejects.toThrow(Error);
      });

      it('When the user does not have any workspace, then a new one should be created', async () => {
        const mockedUser = getUser();
        const mockedCustomer = getCustomer({
          id: mockedUser.customerId,
        });
        const mockedProduct = getProduct({});

        jest.spyOn(usersService, 'updateWorkspaceStorage').mockRejectedValue({
          response: { status: 404 },
        });

        const initializeWorkspaceSpy = jest.spyOn(usersService, 'initializeWorkspace').mockResolvedValue();
        const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

        await handleOldInvoiceCompletedFlow({
          config,
          customer: mockedCustomer,
          isBusinessPlan: true,
          log: logger,
          maxSpaceBytes: '10',
          subscriptionSeats: 3,
          product: mockedProduct,
          usersService,
          storageService,
          userUuid: mockedUser.uuid,
        });

        expect(initializeWorkspaceSpy).toHaveBeenCalledTimes(1);
        expect(changeStorageSpy).not.toHaveBeenCalled();
        expect(updateUserTier).not.toHaveBeenCalled();
      });

      it('When the user have a workspace, then the existing workspace is updated', async () => {
        const mockedUser = getUser();
        const mockedCustomer = getCustomer({
          id: mockedUser.customerId,
        });
        const mockedProduct = getProduct({});

        const updateWorkspaceStorageSpy = jest.spyOn(usersService, 'updateWorkspaceStorage').mockResolvedValue();
        const initializeWorkspaceSpy = jest.spyOn(usersService, 'initializeWorkspace').mockResolvedValue();
        const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

        await handleOldInvoiceCompletedFlow({
          config,
          customer: mockedCustomer,
          isBusinessPlan: true,
          log: logger,
          maxSpaceBytes: '10',
          subscriptionSeats: 3,
          product: mockedProduct,
          usersService,
          storageService,
          userUuid: mockedUser.uuid,
        });

        expect(updateWorkspaceStorageSpy).toHaveBeenCalledTimes(1);
        expect(initializeWorkspaceSpy).toHaveBeenCalledTimes(0);
        expect(changeStorageSpy).not.toHaveBeenCalled();
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
      const mockedProduct = getProduct({});
      const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);

      await handleOldInvoiceCompletedFlow({
        config,
        customer: mockedCustomer,
        isBusinessPlan: false,
        log: logger,
        maxSpaceBytes: '10',
        subscriptionSeats: 3,
        product: mockedProduct,
        usersService,
        storageService,
        userUuid: mockedUser.uuid,
      });

      expect(changeStorageSpy).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
    });

    it('When the user space update fails, then an error indicating so is thrown and the tier should not be updated', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedProduct = getProduct({});
      const changeStorageSpy = jest
        .spyOn(storageService, 'changeStorage')
        .mockRejectedValue(new Error('Error updating space'));

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
          storageService,
          userUuid: mockedUser.uuid,
        }),
      ).rejects.toThrow(Error);
      expect(changeStorageSpy).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(0);
    });

    it('When the user tier update fails, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const mockedCustomer = getCustomer({
        id: mockedUser.customerId,
      });
      const mockedProduct = getProduct({});

      const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);
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
          storageService,
          userUuid: mockedUser.uuid,
        }),
      ).rejects.toThrow(Error);
      expect(changeStorageSpy).toHaveBeenCalledTimes(1);
      expect(updateUserTier).toHaveBeenCalledTimes(1);
    });
  });
});
