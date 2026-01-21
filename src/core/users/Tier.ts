interface AntivirusFeatures {
  enabled: boolean;
}

interface BackupsFeatures {
  enabled: boolean;
}

export interface DriveFeatures {
  foreignTierId: string;
  enabled: boolean;
  maxSpaceBytes: number;
  workspaces: {
    enabled: boolean;
    minimumSeats: number;
    maximumSeats: number;
    maxSpaceBytesPerSeat: number;
  };
  passwordProtectedSharing: {
    enabled: boolean;
  };
  restrictedItemsSharing: {
    enabled: boolean;
  };
}

interface MeetFeatures {
  enabled: boolean;
  paxPerCall: number;
}

interface MailFeatures {
  enabled: boolean;
  addressesPerUser: number;
}

export interface VpnFeatures {
  enabled: boolean;
  featureId: string;
}

interface CleanerFeatures {
  enabled: boolean;
}

interface DarkMonitorFeatures {
  enabled: boolean;
}

interface CliFeatures {
  enabled: boolean;
}

interface RCloneFeatures {
  enabled: boolean;
}

export enum Service {
  Drive = 'drive',
  Backups = 'backups',
  Antivirus = 'antivirus',
  Meet = 'meet',
  Mail = 'mail',
  Vpn = 'vpn',
  Cli = 'cli',
  Cleaner = 'cleaner',
  darkMonitor = 'darkMonitor',
  rClone = 'rclone',
}

export interface Tier {
  id: string;
  label: string;
  productId: string;
  billingType: 'subscription' | 'lifetime';
  featuresPerService: {
    [Service.Drive]: DriveFeatures;
    [Service.Backups]: BackupsFeatures;
    [Service.Antivirus]: AntivirusFeatures;
    [Service.Meet]: MeetFeatures;
    [Service.Mail]: MailFeatures;
    [Service.Vpn]: VpnFeatures;
    [Service.Cleaner]: CleanerFeatures;
    [Service.darkMonitor]: DarkMonitorFeatures;
    [Service.Cli]: CliFeatures;
    [Service.rClone]: RCloneFeatures;
  };
}
