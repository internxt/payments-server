import { UserFeatureOverridesRepository } from '../core/users/MongoDBUserFeatureOverridesRepository';
import { Service } from '../core/users/Tier';
import { User } from '../core/users/User';
import { UserFeatureOverrides } from '../core/users/UserFeatureOverrides';
import { BadRequestError } from '../errors/Errors';

export class UserFeaturesOverridesService {
  constructor(private readonly userFeatureOverridesRepository: UserFeatureOverridesRepository) {}

  async upsertCustomUserFeatures(userId: User['id'], allowedServices: Service | 'cli') {
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

      case 'cli':
        // Activate product through Drive Server using an EP
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
