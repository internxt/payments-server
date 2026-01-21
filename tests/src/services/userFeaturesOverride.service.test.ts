import { Service } from '../../../src/core/users/Tier';
import { BadRequestError } from '../../../src/errors/Errors';
import { getUser } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';

const { usersService, userFeaturesOverridesService, userFeatureOverridesRepository } = createTestServices();
describe('User Tier Override', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Insert or update the custom user features', () => {
    test('When the service is not allowed, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      const nonAllowedService = Service.Meet;

      jest.spyOn(userFeatureOverridesRepository, 'findByUserId').mockResolvedValue(null);
      await expect(
        userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser, nonAllowedService),
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

      const findByUserIdSpy = jest.spyOn(userFeatureOverridesRepository, 'findByUserId').mockResolvedValue(null);
      const upsertSpy = jest.spyOn(userFeatureOverridesRepository, 'upsert').mockResolvedValue();

      await userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser, antivirusService);

      expect(findByUserIdSpy).toHaveBeenCalledWith(mockedUser.id);
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
      const findByUserIdSpy = jest.spyOn(userFeatureOverridesRepository, 'findByUserId').mockResolvedValue(null);
      const upsertSpy = jest.spyOn(userFeatureOverridesRepository, 'upsert').mockResolvedValue();

      await userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser, backupsService);

      expect(findByUserIdSpy).toHaveBeenCalledWith(mockedUser.id);
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
      const findByUserIdSpy = jest.spyOn(userFeatureOverridesRepository, 'findByUserId').mockResolvedValue(null);
      const upsertSpy = jest.spyOn(userFeatureOverridesRepository, 'upsert').mockResolvedValue();

      await userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser, cleanerService);

      expect(findByUserIdSpy).toHaveBeenCalledWith(mockedUser.id);
      expect(upsertSpy).toHaveBeenCalledWith(upsertPayload);
    });

    test('When the service is Cli, then the service should be enabled', async () => {
      const mockedUser = getUser();
      const cliService = Service.Cli;
      const upsertPayload = {
        userId: mockedUser.id,
        featuresPerService: {
          [cliService]: {
            enabled: true,
          },
        },
      };
      const findByUserIdSpy = jest.spyOn(userFeatureOverridesRepository, 'findByUserId').mockResolvedValue(null);
      const upsertSpy = jest.spyOn(userFeatureOverridesRepository, 'upsert').mockResolvedValue();
      const overrideDriveLimitSpy = jest.spyOn(usersService, 'overrideDriveLimit').mockResolvedValue();

      await userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser, cliService);

      expect(findByUserIdSpy).toHaveBeenCalledWith(mockedUser.id);
      expect(upsertSpy).toHaveBeenCalledWith(upsertPayload);
      expect(overrideDriveLimitSpy).toHaveBeenCalledWith({
        userUuid: mockedUser.uuid,
        feature: Service.Cli,
        enabled: true,
      });
    });

    test('When the service is Cli and it is already enabled, then we should return directly without enabling anything', async () => {
      const mockedUser = getUser();
      const cliService = Service.Cli;
      const upsertPayload = {
        userId: mockedUser.id,
        featuresPerService: {
          [cliService]: {
            enabled: true,
          },
        },
      };

      const findByUserIdSpy = jest
        .spyOn(userFeatureOverridesRepository, 'findByUserId')
        .mockResolvedValue(upsertPayload);
      const upsertSpy = jest.spyOn(userFeatureOverridesRepository, 'upsert');
      const overrideDriveLimitSpy = jest.spyOn(usersService, 'overrideDriveLimit');

      await userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser, cliService);

      expect(findByUserIdSpy).toHaveBeenCalledWith(mockedUser.id);
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(overrideDriveLimitSpy).not.toHaveBeenCalled();
    });

    test('When the service is rClone, then the service should be enabled', async () => {
      const mockedUser = getUser();
      const rCloneService = Service.rClone;
      const upsertPayload = {
        userId: mockedUser.id,
        featuresPerService: {
          [rCloneService]: {
            enabled: true,
          },
        },
      };
      const findByUserIdSpy = jest.spyOn(userFeatureOverridesRepository, 'findByUserId').mockResolvedValue(null);
      const upsertSpy = jest.spyOn(userFeatureOverridesRepository, 'upsert').mockResolvedValue();
      const overrideDriveLimitSpy = jest.spyOn(usersService, 'overrideDriveLimit').mockResolvedValue();

      await userFeaturesOverridesService.upsertCustomUserFeatures(mockedUser, rCloneService);

      expect(findByUserIdSpy).toHaveBeenCalledWith(mockedUser.id);
      expect(upsertSpy).toHaveBeenCalledWith(upsertPayload);
      expect(overrideDriveLimitSpy).toHaveBeenCalledWith({
        userUuid: mockedUser.uuid,
        feature: Service.rClone,
        enabled: true,
      });
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
