import { Service } from './Tier';
import { User } from './User';

export interface UserFeatureOverrides {
  userUuid: User['uuid'];
  featuresPerService: Partial<{
    [key in Service]: {
      enabled: boolean;
    };
  }>;
}
