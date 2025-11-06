import { UserFeatureOverridesRepository } from '../core/users/MongoDBUserFeatureOverridesRepository';
import { User } from '../core/users/User';
import { AllowedServicesToOverride } from '../core/users/UserFeatureOverrides';
import Logger from '../Logger';

export class SupportService {
  constructor(private readonly userFeatureOverridesRepository: UserFeatureOverridesRepository) {}

  async updateUserFeaturesOverrides(userId: User['id'], allowedServices: AllowedServicesToOverride) {
    allowedServices;
    switch (allowedServices) {
      case 'antivirus':
      case 'backups':
      case 'cleaner':
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
        Logger.info(`Service ${allowedServices} is not allowed to be enabled manually`);
    }
  }

  async getUserFeaturesOverrides(userId: User['id']) {
    return this.userFeatureOverridesRepository.findByUserId(userId);
  }
}
