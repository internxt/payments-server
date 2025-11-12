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

  async upsertCustomUserFeatures(user: User, allowedServices: Service) {
    const { id: userId, uuid: userUuid } = user;

    switch (allowedServices) {
      case Service.Antivirus:
      case Service.Backups:
      case Service.Cleaner:
        await this.userFeatureOverridesRepository.upsert({
          userId: userId,
          featuresPerService: {
            [allowedServices]: {
              enabled: true,
            },
          },
        });
        break;

      case Service.Cli:
        await this.userFeatureOverridesRepository.upsert({
          userId: userId,
          featuresPerService: {
            [Service.Cli]: {
              enabled: true,
            },
          },
        });

        await this.usersService.overrideDriveLimit({ userUuid, feature: Service.Cli, enabled: true });
        break;

      default:
        throw new BadRequestError(
          `Service ${allowedServices} is not supported. Try with one of the following: antivirus, backups, cleaner, cli`,
        );
    }
  }

  async getCustomUserFeatures(userId: User['id']): Promise<UserFeatureOverrides | null> {
    return this.userFeatureOverridesRepository.findByUserId(userId);
  }
}
