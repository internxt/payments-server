import { UserFeatureOverridesRepository } from '../core/users/MongoDBUserFeatureOverridesRepository';
import { DriveFeatures, Service } from '../core/users/Tier';
import { User } from '../core/users/User';
import { UserFeatureOverrides } from '../core/users/UserFeatureOverrides';
import { BadRequestError } from '../errors/Errors';
import { TiersService } from './tiers.service';
import { UsersService } from './users.service';

export class UserFeaturesOverridesService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userFeatureOverridesRepository: UserFeatureOverridesRepository,
    private readonly tiersService: TiersService,
  ) {}

  private async overrideDriveFeatures(
    userUuid: string,
    userId: string,
    driveFeature?: keyof DriveFeatures,
  ): Promise<void> {
    if (!driveFeature) {
      throw new BadRequestError('A Drive feature must be provided to override');
    }
    if (driveFeature === 'fileVersioning') {
      const minimumTier = await this.tiersService.getMinimumTierWithFeatureAvailable(Service.Drive, driveFeature);

      if (!minimumTier) {
        throw new BadRequestError('No minimum tier found for file versioning');
      }

      const tierId = minimumTier?.featuresPerService[Service.Drive].foreignTierId;
      await this.usersService.overrideDriveLimit({
        userUuid,
        feature: driveFeature,
        enabled: true,
        driveTierId: tierId,
      });
    }

    await this.userFeatureOverridesRepository.upsert({
      userId: userId,
      featuresPerService: {
        [Service.Drive]: {
          enabled: true,
          [driveFeature]: {
            enabled: true,
          },
        },
      },
    });
  }

  async upsertCustomUserFeatures(user: User, service: Service, driveFeature?: keyof DriveFeatures): Promise<void> {
    const { id: userId, uuid: userUuid } = user;
    const overrideUserFeatures = await this.userFeatureOverridesRepository.findByUserId(userId);

    if (overrideUserFeatures?.featuresPerService?.[service]?.enabled) {
      return;
    }

    switch (service) {
      case Service.Antivirus:
      case Service.Backups:
      case Service.Cleaner:
        await this.userFeatureOverridesRepository.upsert({
          userId: userId,
          featuresPerService: {
            [service]: {
              enabled: true,
            },
          },
        });
        break;

      case Service.Drive:
        await this.overrideDriveFeatures(userUuid, userId, driveFeature);
        break;

      case Service.Cli:
      case Service.rClone:
        await this.usersService.overrideDriveLimit({ userUuid, feature: service, enabled: true });

        await this.userFeatureOverridesRepository.upsert({
          userId: userId,
          featuresPerService: {
            [service]: {
              enabled: true,
            },
          },
        });
        break;

      default:
        throw new BadRequestError(
          `Service ${service} is not supported. Try with one of the following: antivirus, backups, cleaner, cli`,
        );
    }
  }

  async getCustomUserFeatures(userId: User['id']): Promise<UserFeatureOverrides | null> {
    return this.userFeatureOverridesRepository.findByUserId(userId);
  }
}
