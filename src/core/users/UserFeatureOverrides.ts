import { Service } from './Tier';
import { User } from './User';

export interface UserFeatureOverrides {
  userId: User['id'];
  featuresPerService: Partial<{
    [key in Service]: {
      enabled: boolean;
    };
  }>;
}
