import { UserNotFoundError } from '../../../src/services/users.service';
import { getUser, newTier } from '../fixtures';
import { Service } from '../../../src/core/users/Tier';
import { createTestServices } from '../helpers/services-factory';

describe('Products Service Tests', () => {
  const { productsService, usersService, tiersService } = createTestServices();
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Finding the applicable tier for a user (feature merging approach)', () => {
    it('When the user has no tiers, then the free tier is returned', async () => {
      const mockedUser = getUser();
      const freeTier = newTier({
        id: 'free',
        label: 'free',
        productId: 'free',
      });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([]);
      jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(freeTier);

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(result.drive.enabled).toBe(false);
      expect(result.drive.sourceTierId).toBe('free');
      expect(result.mail.enabled).toBe(false);
      expect(result.vpn.enabled).toBe(false);
    });

    it('When the user has a lifetime subscription, the lifetime tier is returned', async () => {
      const mockedUser = getUser({ lifetime: true });
      const regularTier = newTier();
      const lifetimeTier = newTier({ billingType: 'lifetime' });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([regularTier, lifetimeTier]);

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(result.drive.sourceTierId).toStrictEqual(lifetimeTier.id);
      expect(result.mail.sourceTierId).toStrictEqual(lifetimeTier.id);
      expect(result.vpn.sourceTierId).toStrictEqual(lifetimeTier.id);
    });

    it('When the user has only individual tiers, the best individual tier is returned', async () => {
      const mockedUser = getUser();
      const basicTier = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 1000000,
            workspaces: {
              enabled: false,
              minimumSeats: 0,
              maximumSeats: 0,
              maxSpaceBytesPerSeat: 0,
            },
          },
        },
      });
      const premiumTier = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 5000000,
            workspaces: {
              enabled: false,
              minimumSeats: 0,
              maximumSeats: 0,
              maxSpaceBytesPerSeat: 0,
            },
          },
        },
      });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([basicTier, premiumTier]);

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(result.drive.maxSpaceBytes).toBe(5000000);
      expect(result.drive.workspaces.enabled).toBe(false);
      expect(result.drive.sourceTierId).toBeDefined();
    });

    it('When the user has both individual and business tiers, the business tier is preferred for drive', async () => {
      const mockedUser = getUser();
      const individualTier = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 5000000,
            workspaces: {
              enabled: false,
              minimumSeats: 0,
              maximumSeats: 0,
              maxSpaceBytesPerSeat: 0,
            },
          },
        },
      });
      const businessTier = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 1000000,
            workspaces: {
              enabled: true,
              minimumSeats: 3,
              maximumSeats: 50,
              maxSpaceBytesPerSeat: 2000000,
            },
          },
        },
      });

      jest.spyOn(usersService, 'findUserByUuid').mockResolvedValue(mockedUser);
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([individualTier, businessTier]);

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
      });

      expect(result.drive.workspaces.enabled).toBe(true);
      expect(result.drive.workspaces.maxSpaceBytesPerSeat).toBe(2000000);
      expect(result.drive.sourceTierId).toBeDefined();
    });

    it('When the user has access to multiple business tiers via ownersId, the highest workspace tier is returned', async () => {
      const mockedUser = getUser();
      const mockedOwner = getUser();
      const businessTier1 = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 1000000,
            workspaces: {
              enabled: true,
              minimumSeats: 3,
              maximumSeats: 50,
              maxSpaceBytesPerSeat: 1000000,
            },
          },
        },
      });
      const businessTier2 = newTier({
        featuresPerService: {
          ...newTier().featuresPerService,
          [Service.Drive]: {
            enabled: true,
            maxSpaceBytes: 1000000,
            workspaces: {
              enabled: true,
              minimumSeats: 3,
              maximumSeats: 100,
              maxSpaceBytesPerSeat: 2000000,
            },
          },
        },
      });

      jest.spyOn(usersService, 'findUserByUuid').mockImplementation(async (uuid: string) => {
        if (uuid === mockedUser.uuid) return mockedUser;
        if (uuid === mockedOwner.uuid) return mockedOwner;
        throw new UserNotFoundError(`User with uuid ${uuid} not found`);
      });
      jest.spyOn(tiersService, 'getTiersProductsByUserId').mockImplementation(async (ownerId: string) => {
        if (ownerId === mockedUser.id) return [businessTier1];
        if (ownerId === mockedOwner.id) return [businessTier2];
        return [];
      });

      const result = await productsService.getApplicableTierForUser({
        userUuid: mockedUser.uuid,
        ownersId: [mockedUser.uuid, mockedOwner.uuid],
      });

      expect(result.drive.workspaces.enabled).toBe(true);
      expect(result.drive.workspaces.maxSpaceBytesPerSeat).toBe(2000000);
      expect(result.drive.sourceTierId).toBeDefined();
    });
  });

  describe('Feature merging logic', () => {
    describe('Mail feature merging', () => {
      it('When no tiers have mail enabled, mail should remain disabled', () => {
        const tier1 = newTier({
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: false, addressesPerUser: 5 },
          },
        });
        const tier2 = newTier({
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: false, addressesPerUser: 10 },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tier1, tier2]);

        expect(mergedFeatures.mail.enabled).toBe(false);
        expect(mergedFeatures.mail.addressesPerUser).toBe(0);
        expect(mergedFeatures.mail.sourceTierId).toBeUndefined();
      });

      it('When multiple tiers have mail enabled, should take the one with most addresses', () => {
        const tier1 = newTier({
          id: 'tier-basic',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: true, addressesPerUser: 5 },
          },
        });
        const tier2 = newTier({
          id: 'tier-premium',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: true, addressesPerUser: 15 },
          },
        });
        const tier3 = newTier({
          id: 'tier-standard',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: true, addressesPerUser: 10 },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tier1, tier2, tier3]);

        expect(mergedFeatures.mail.enabled).toBe(true);
        expect(mergedFeatures.mail.addressesPerUser).toBe(15);
        expect(mergedFeatures.mail.sourceTierId).toBe('tier-premium');
      });

      it('When only one tier has mail enabled, should use that tier', () => {
        const tierWithMail = newTier({
          id: 'mail-tier',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: true, addressesPerUser: 8 },
          },
        });
        const tierWithoutMail = newTier({
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: false, addressesPerUser: 0 },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tierWithMail, tierWithoutMail]);

        expect(mergedFeatures.mail.enabled).toBe(true);
        expect(mergedFeatures.mail.addressesPerUser).toBe(8);
        expect(mergedFeatures.mail.sourceTierId).toBe('mail-tier');
      });
    });

    describe('Meet feature merging', () => {
      it('When multiple tiers have meet enabled, should take the one with most participants', () => {
        const tier1 = newTier({
          id: 'meet-basic',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Meet]: { enabled: true, paxPerCall: 5 },
          },
        });
        const tier2 = newTier({
          id: 'meet-premium',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Meet]: { enabled: true, paxPerCall: 25 },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tier1, tier2]);

        expect(mergedFeatures.meet.enabled).toBe(true);
        expect(mergedFeatures.meet.paxPerCall).toBe(25);
        expect(mergedFeatures.meet.sourceTierId).toBe('meet-premium');
      });

      it('When no tiers have meet enabled, meet should remain disabled', () => {
        const tier1 = newTier({
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Meet]: { enabled: false, paxPerCall: 5 },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tier1]);

        expect(mergedFeatures.meet.enabled).toBe(false);
        expect(mergedFeatures.meet.paxPerCall).toBe(0);
      });
    });

    describe('VPN feature merging', () => {
      it('When multiple tiers have VPN enabled, should take the first available', () => {
        const tier1 = newTier({
          id: 'vpn-first',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Vpn]: { enabled: true, featureId: 'vpn-basic-123' },
          },
        });
        const tier2 = newTier({
          id: 'vpn-second',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Vpn]: { enabled: true, featureId: 'vpn-premium-456' },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tier1, tier2]);

        expect(mergedFeatures.vpn.enabled).toBe(true);
        expect(mergedFeatures.vpn.featureId).toBe('vpn-basic-123');
        expect(mergedFeatures.vpn.sourceTierId).toBe('vpn-first');
      });

      it('When no tiers have VPN enabled, VPN should remain disabled', () => {
        const tier1 = newTier({
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Vpn]: { enabled: false, featureId: '' },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tier1]);

        expect(mergedFeatures.vpn.enabled).toBe(false);
        expect(mergedFeatures.vpn.featureId).toBe('');
      });
    });

    describe('Boolean feature merging (Antivirus, Backups, Cleaner)', () => {
      it('When any tier has antivirus enabled, should enable antivirus from first available', () => {
        const tierWithoutAntivirus = newTier({
          id: 'no-antivirus',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Antivirus]: { enabled: false },
          },
        });
        const tierWithAntivirus = newTier({
          id: 'with-antivirus',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Antivirus]: { enabled: true },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tierWithoutAntivirus, tierWithAntivirus]);

        expect(mergedFeatures.antivirus.enabled).toBe(true);
        expect(mergedFeatures.antivirus.sourceTierId).toBe('with-antivirus');
      });

      it('When any tier has backups enabled, should enable backups from first available', () => {
        const tierWithBackups = newTier({
          id: 'backup-tier',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Backups]: { enabled: true },
          },
        });
        const tierWithoutBackups = newTier({
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Backups]: { enabled: false },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tierWithBackups, tierWithoutBackups]);

        expect(mergedFeatures.backups.enabled).toBe(true);
        expect(mergedFeatures.backups.sourceTierId).toBe('backup-tier');
      });

      it('When any tier has cleaner enabled, should enable cleaner from first available', () => {
        const tierWithCleaner = newTier({
          id: 'cleaner-tier',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Cleaner]: { enabled: true },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tierWithCleaner]);

        expect(mergedFeatures.cleaner.enabled).toBe(true);
        expect(mergedFeatures.cleaner.sourceTierId).toBe('cleaner-tier');
      });

      it('When no tiers have boolean features enabled, they should remain disabled', () => {
        const tier = newTier({
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Antivirus]: { enabled: false },
            [Service.Backups]: { enabled: false },
            [Service.Cleaner]: { enabled: false },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([tier]);

        expect(mergedFeatures.antivirus.enabled).toBe(false);
        expect(mergedFeatures.backups.enabled).toBe(false);
        expect(mergedFeatures.cleaner.enabled).toBe(false);
      });
    });

    describe('Drive tier selection', () => {
      it('When both business and individual tiers are available, should prefer business tier with highest storage', () => {
        const individualTier = newTier({
          id: 'individual-ultimate',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 10 * 1024 * 1024 * 1024, // 10GB
              workspaces: {
                enabled: false,
                minimumSeats: 0,
                maximumSeats: 0,
                maxSpaceBytesPerSeat: 0,
              },
            },
          },
        });
        const businessTier1 = newTier({
          id: 'business-standard',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 1 * 1024 * 1024 * 1024, // 1GB
              workspaces: {
                enabled: true,
                minimumSeats: 3,
                maximumSeats: 50,
                maxSpaceBytesPerSeat: 2 * 1024 * 1024 * 1024, // 2GB per seat
              },
            },
          },
        });
        const businessTier2 = newTier({
          id: 'business-premium',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 1 * 1024 * 1024 * 1024, // 1GB
              workspaces: {
                enabled: true,
                minimumSeats: 3,
                maximumSeats: 100,
                maxSpaceBytesPerSeat: 5 * 1024 * 1024 * 1024, // 5GB per seat
              },
            },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([individualTier, businessTier1, businessTier2]);

        expect(mergedFeatures.drive.enabled).toBe(true);
        expect(mergedFeatures.drive.workspaces.enabled).toBe(true);
        expect(mergedFeatures.drive.workspaces.maxSpaceBytesPerSeat).toBe(5 * 1024 * 1024 * 1024);
        expect(mergedFeatures.drive.sourceTierId).toBe('business-premium');
      });

      it('When only individual tiers are available, should select the one with highest storage', () => {
        const basicTier = newTier({
          id: 'individual-basic',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 2 * 1024 * 1024 * 1024, // 2GB
              workspaces: {
                enabled: false,
                minimumSeats: 0,
                maximumSeats: 0,
                maxSpaceBytesPerSeat: 0,
              },
            },
          },
        });
        const premiumTier = newTier({
          id: 'individual-premium',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 10 * 1024 * 1024 * 1024, // 10GB
              workspaces: {
                enabled: false,
                minimumSeats: 0,
                maximumSeats: 0,
                maxSpaceBytesPerSeat: 0,
              },
            },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([basicTier, premiumTier]);

        expect(mergedFeatures.drive.enabled).toBe(true);
        expect(mergedFeatures.drive.maxSpaceBytes).toBe(10 * 1024 * 1024 * 1024);
        expect(mergedFeatures.drive.workspaces.enabled).toBe(false);
        expect(mergedFeatures.drive.sourceTierId).toBe('individual-premium');
      });
    });

    describe('Complex feature merging scenarios', () => {
      it('When user has multiple tiers with different features, should merge the best of each', () => {
        const mailTier = newTier({
          id: 'mail-specialist',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: true, addressesPerUser: 20 },
            [Service.Meet]: { enabled: false, paxPerCall: 0 },
            [Service.Vpn]: { enabled: false, featureId: '' },
            [Service.Antivirus]: { enabled: false },
            [Service.Backups]: { enabled: false },
            [Service.Cleaner]: { enabled: false },
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 2 * 1024 * 1024 * 1024,
              workspaces: { enabled: false, minimumSeats: 0, maximumSeats: 0, maxSpaceBytesPerSeat: 0 },
            },
          },
        });
        const meetTier = newTier({
          id: 'meet-specialist',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: false, addressesPerUser: 0 },
            [Service.Meet]: { enabled: true, paxPerCall: 30 },
            [Service.Vpn]: { enabled: true, featureId: 'vpn-premium-789' },
            [Service.Antivirus]: { enabled: true },
            [Service.Backups]: { enabled: false },
            [Service.Cleaner]: { enabled: false },
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 1 * 1024 * 1024 * 1024,
              workspaces: { enabled: false, minimumSeats: 0, maximumSeats: 0, maxSpaceBytesPerSeat: 0 },
            },
          },
        });
        const businessTier = newTier({
          id: 'business-workspace',
          featuresPerService: {
            ...newTier().featuresPerService,
            [Service.Mail]: { enabled: false, addressesPerUser: 0 },
            [Service.Meet]: { enabled: false, paxPerCall: 0 },
            [Service.Vpn]: { enabled: false, featureId: '' },
            [Service.Antivirus]: { enabled: false },
            [Service.Backups]: { enabled: true },
            [Service.Cleaner]: { enabled: true },
            [Service.Drive]: {
              enabled: true,
              maxSpaceBytes: 1 * 1024 * 1024 * 1024,
              workspaces: {
                enabled: true,
                minimumSeats: 5,
                maximumSeats: 25,
                maxSpaceBytesPerSeat: 3 * 1024 * 1024 * 1024,
              },
            },
          },
        });

        const mergedFeatures = (productsService as any).mergeFeatures([mailTier, meetTier, businessTier]);

        // Mail from mailTier (20 addresses)
        expect(mergedFeatures.mail.enabled).toBe(true);
        expect(mergedFeatures.mail.addressesPerUser).toBe(20);
        expect(mergedFeatures.mail.sourceTierId).toBe('mail-specialist');

        // Meet from meetTier (30 participants)
        expect(mergedFeatures.meet.enabled).toBe(true);
        expect(mergedFeatures.meet.paxPerCall).toBe(30);
        expect(mergedFeatures.meet.sourceTierId).toBe('meet-specialist');

        // VPN from meetTier (first available)
        expect(mergedFeatures.vpn.enabled).toBe(true);
        expect(mergedFeatures.vpn.featureId).toBe('vpn-premium-789');
        expect(mergedFeatures.vpn.sourceTierId).toBe('meet-specialist');

        // Antivirus from meetTier (first available)
        expect(mergedFeatures.antivirus.enabled).toBe(true);
        expect(mergedFeatures.antivirus.sourceTierId).toBe('meet-specialist');

        // Backups from businessTier (first available)
        expect(mergedFeatures.backups.enabled).toBe(true);
        expect(mergedFeatures.backups.sourceTierId).toBe('business-workspace');

        // Cleaner from businessTier (first available)
        expect(mergedFeatures.cleaner.enabled).toBe(true);
        expect(mergedFeatures.cleaner.sourceTierId).toBe('business-workspace');

        // Drive from businessTier (business preferred)
        expect(mergedFeatures.drive.enabled).toBe(true);
        expect(mergedFeatures.drive.workspaces.enabled).toBe(true);
        expect(mergedFeatures.drive.workspaces.maxSpaceBytesPerSeat).toBe(3 * 1024 * 1024 * 1024);
        expect(mergedFeatures.drive.sourceTierId).toBe('business-workspace');
      });
    });
  });
});
