import { TierNotFoundError } from '../../../src/services/tiers.service';
import { getLogger, getUser, newTier, voidPromise } from '../fixtures';
import { Service } from '../../../src/core/users/Tier';
import { UserTier } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { FREE_PLAN_BYTES_SPACE } from '../../../src/constants';
import { createTestServices } from '../helpers/services-factory';

describe('TiersService tests', () => {
  const { usersTiersRepository, tiersRepository, tiersService, usersService, storageService } = createTestServices();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
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

        const usersTiersRepositorySpy = jest.spyOn(usersTiersRepository, 'updateUserTier').mockResolvedValue(true);

        await expect(tiersService.updateTierToUser(user.id, oldTier.id, newTierData.id)).resolves.toBeUndefined();
        expect(usersTiersRepositorySpy).toHaveBeenCalledWith(user.id, oldTier.id, newTierData.id);
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

  describe('Remove Drive features', () => {
    it('When workspaces is enabled, then it is removed exclusively', async () => {
      const { uuid } = getUser();
      const tier = newTier();

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = true;

      const destroyWorkspace = jest.spyOn(usersService, 'destroyWorkspace').mockImplementation(() => Promise.resolve());

      await tiersService.removeDriveFeatures(uuid, tier, getLogger());

      expect(destroyWorkspace).toHaveBeenCalledWith(uuid);
    });

    it('When workspaces is not enabled, then update the user tier to free and downgrade the storage to the free plan', async () => {
      const { uuid } = getUser();
      const tier = newTier();
      const freeTier = newTier({
        featuresPerService: {
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: FREE_PLAN_BYTES_SPACE,
            foreignTierId: 'free',
          },
        } as any,
      });

      tier.featuresPerService[Service.Drive].enabled = true;
      tier.featuresPerService[Service.Drive].workspaces.enabled = false;

      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(freeTier);
      const destroyWorkspaceSpy = jest.spyOn(usersService, 'destroyWorkspace');
      const changeStorageSpy = jest.spyOn(storageService, 'updateUserStorageAndTier').mockImplementation(voidPromise);

      await tiersService.removeDriveFeatures(uuid, tier, getLogger());

      expect(destroyWorkspaceSpy).not.toHaveBeenCalled();
      expect(changeStorageSpy).toHaveBeenCalledWith(
        uuid,
        freeTier.featuresPerService[Service.Drive].maxSpaceBytes,
        freeTier.featuresPerService[Service.Drive].foreignTierId,
      );
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
