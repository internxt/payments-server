import { Service } from '../../../src/core/users/Tier';
import { BadRequestError } from '../../../src/errors/Errors';
import { getUser } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';

const { userFeaturesOverridesService, userFeatureOverridesRepository } = createTestServices();
describe('User Tier Override', () => {
  describe('Insert or update the custom user features', () => {
    test('When the service is not allowed, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const nonAllowedService = Service.Meet;

      await expect(
        userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser.id, nonAllowedService),
      ).rejects.toThrow(BadRequestError);
    });

    test('When the service is Antivirus, then the service should be enabled', async () => {
      const mockedUser = getUser();
      const antivirusService = Service.Antivirus;
      const upsertPayload = {
        userId: mockedUser.id,
        featuresPerService: {
          [antivirusService]: {
            enabled: true,
          },
        },
      };
      const upsertSpy = jest.spyOn(userFeatureOverridesRepository, 'upsert').mockResolvedValue();

      await userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser.id, antivirusService);

      expect(upsertSpy).toHaveBeenCalledWith(upsertPayload);
    });

    test('When the service is Backups, then the service should be enabled', async () => {
      const mockedUser = getUser();
      const backupsService = Service.Backups;
      const upsertPayload = {
        userId: mockedUser.id,
        featuresPerService: {
          [backupsService]: {
            enabled: true,
          },
        },
      };
      const upsertSpy = jest.spyOn(userFeatureOverridesRepository, 'upsert').mockResolvedValue();

      await userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser.id, backupsService);

      expect(upsertSpy).toHaveBeenCalledWith(upsertPayload);
    });

    test('When the service is Cleaner, then the service should be enabled', async () => {
      const mockedUser = getUser();
      const cleanerService = Service.Cleaner;
      const upsertPayload = {
        userId: mockedUser.id,
        featuresPerService: {
          [cleanerService]: {
            enabled: true,
          },
        },
      };
      const upsertSpy = jest.spyOn(userFeatureOverridesRepository, 'upsert').mockResolvedValue();

      await userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser.id, cleanerService);

      expect(upsertSpy).toHaveBeenCalledWith(upsertPayload);
    });
  });

  describe('Get the custom user features', () => {
    test('When the features are requested by a given user and he has custom features, then they are returned', async () => {
      const mockedUserId = getUser().id;
      const mockedResponse = {
        userId: mockedUserId,
        featuresPerService: {
          [Service.Antivirus]: {
            enabled: true,
          },
          [Service.Backups]: {
            enabled: true,
          },
          [Service.Cleaner]: {
            enabled: true,
          },
        },
      };
      jest.spyOn(userFeatureOverridesRepository, 'findByUserId').mockResolvedValue(mockedResponse);

      const customUserFeatures = await userFeaturesOverridesService.getCustomUserFeatures(mockedUserId);

      expect(customUserFeatures).toStrictEqual(mockedResponse);
    });

    test('When the features are requested by a given user and he does not have custom features, then nothing is returned', async () => {
      const mockedUserId = getUser().id;
      jest.spyOn(userFeatureOverridesRepository, 'findByUserId').mockResolvedValue(null);

      const customUserFeatures = await userFeaturesOverridesService.getCustomUserFeatures(mockedUserId);

      expect(customUserFeatures).toBeNull();
    });
  });
});
