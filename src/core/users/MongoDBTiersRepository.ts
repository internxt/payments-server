import { Collection, MongoClient } from 'mongodb';

interface AntivirusFeatures {
  enabled: boolean;
};

interface BackupsFeatures {
  enabled: boolean;
};

interface DriveFeatures {
  enabled: boolean;
  maxSpaceBytes: number;
  workspaces: {
    enabled: boolean;
    minimumSeats: number;
    maximumSeats: number;
  }
};

interface MeetFeatures {
  enabled: boolean;
  paxPerCall: number;
};

interface MailFeatures {
  enabled: boolean;
  addressesPerUser: number;
}

interface VpnFeatures {
  enabled: boolean;
  locationsAvailable: number;
};

enum Service {
  Drive = 'drive',
  Backups = 'backups',
  Antivirus = 'antivirus',
  Meet = 'meet',
  Mail = 'mail',
  Vpn = 'vpn'
}

export interface Tier {
  label: string;
  productId: string;
  billingType: "subscription" | "lifetime",
  featuresPerService: {
    [Service.Drive]: DriveFeatures,
    [Service.Backups]: BackupsFeatures,
    [Service.Antivirus]: AntivirusFeatures,
    [Service.Meet]: MeetFeatures,
    [Service.Mail]: MailFeatures,
    [Service.Vpn]: VpnFeatures
  }
}

export interface TiersRepository {
  findByProductId(productId: Tier['productId']): Promise<Tier | null>;
}

export class MongoDBDisplayBillingRepository implements DisplayBillingRepository {
  private readonly collection: Collection<Tier>;

  constructor(mongo: MongoClient) {
    this.collection = mongo.db('payments').collection<Tier>('tiers');
  }

  async findByProductId(productId: Tier['productId']): Promise<Tier | null> {
    const tier = await this.collection.findOne({
      productId
    });

    return tier;
  }
}
