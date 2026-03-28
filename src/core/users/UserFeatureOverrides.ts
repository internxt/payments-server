import { Service } from './Tier';
import { User } from './User';

interface DriveFeatureOverride {
  enabled: boolean;
  passwordProtectedSharing?: { enabled: boolean };
  restrictedItemsSharing?: { enabled: boolean };
  fileVersioning?: { enabled: boolean };
}

type ServiceFeatureOverride = { enabled: boolean };

export interface UserFeatureOverrides {
  userId: User['id'];
  featuresPerService: Partial<
    {
      [K in Exclude<Service, Service.Drive>]: ServiceFeatureOverride;
    } & {
      [Service.Drive]: DriveFeatureOverride;
    }
  >;
}
