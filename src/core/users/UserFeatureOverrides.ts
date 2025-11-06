import { Service } from './Tier';
import { User } from './User';

export type AllowedServicesToOverride = Partial<Service> | 'cli';

export interface UserFeatureOverrides {
  userId: User['id'];
  featuresPerService: Partial<{
    [key in AllowedServicesToOverride]: {
      enabled: boolean;
    };
  }>;
}
