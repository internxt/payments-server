import { UserFeatureOverridesRepository } from '../core/users/MongoDBUserFeatureOverridesRepository';
import { Service } from '../core/users/Tier';
import { User } from '../core/users/User';
import { UserFeatureOverrides } from '../core/users/UserFeatureOverrides';
import { BadRequestError } from '../errors/Errors';
import { UsersService } from './users.service';

export class UserFeaturesOverridesService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userFeatureOverridesRepository: UserFeatureOverridesRepository,
  ) {}

  async upsertCustomUserFeatures(user: User, service: Service) {
    const { id: userId, uuid: userUuid, customerId } = user;
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

      case Service.Cli:
        await this.usersService.overrideDriveLimit({ userUuid, feature: Service.Cli, enabled: true });

        await this.userFeatureOverridesRepository.upsert({
          userId: userId,
          featuresPerService: {
            [Service.Cli]: {
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
