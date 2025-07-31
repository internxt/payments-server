import { Service, Tier } from '../core/users/Tier';
import { UserType } from '../core/users/User';
import { TierNotFoundError, TiersService } from './tiers.service';
import { UserNotFoundError, UsersService } from './users.service';

interface MergedTierFeatures {
  mail: {
    enabled: boolean;
    addressesPerUser: number;
    sourceTierId?: string;
  };
  meet: {
    enabled: boolean;
    paxPerCall: number;
    sourceTierId?: string;
  };
  vpn: {
    enabled: boolean;
    featureId: string;
    sourceTierId?: string;
  };
  antivirus: {
    enabled: boolean;
    sourceTierId?: string;
  };
  backups: {
    enabled: boolean;
    sourceTierId?: string;
  };
  drive: {
    tier: Tier;
  };
}

interface AllVpnFeatures {
  vpnOptions: Array<{
    featureId: string;
    sourceTierId: string;
    tierLabel: string;
  }>;
}

export class ProductsService {
  constructor(
    private readonly tiersService: TiersService,
    private readonly usersService: UsersService,
  ) {}

  private selectBestDriveTier(businessTiers: Tier[], individualTiers: Tier[]): Tier {
    if (businessTiers.length > 0) {
      return businessTiers.reduce((best, current) => {
        const bestStorage = best.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat;
        const currentStorage = current.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat;

        const isCurrentTierBetter = currentStorage > bestStorage;
        return isCurrentTierBetter ? current : best;
      }, businessTiers[0]);
    }

    if (individualTiers.length > 0) {
      return individualTiers.reduce((best, current) => {
        const bestStorage = best.featuresPerService[Service.Drive].maxSpaceBytes;
        const currentStorage = current.featuresPerService[Service.Drive].maxSpaceBytes;

        const isCurrentTierBetter = currentStorage > bestStorage;
        return isCurrentTierBetter ? current : best;
      }, individualTiers[0]);
    }

    throw new TierNotFoundError('No drive tiers available');
  }

  private mergeNonDriveFeatures(tiers: Tier[], mergedFeatures: MergedTierFeatures): void {
    for (const tier of tiers) {
      this.mergeMailFeatures(tier, mergedFeatures);
      this.mergeMeetFeatures(tier, mergedFeatures);
      this.mergeVpnFeatures(tier, mergedFeatures);
      this.mergeAntivirusFeatures(tier, mergedFeatures);
      this.mergeBackupsFeatures(tier, mergedFeatures);
    }
  }

  private mergeMailFeatures(tier: Tier, mergedFeatures: MergedTierFeatures): void {
    const mailFeatures = tier.featuresPerService[Service.Mail];
    if (mailFeatures.enabled && mailFeatures.addressesPerUser > mergedFeatures.mail.addressesPerUser) {
      mergedFeatures.mail = {
        enabled: true,
        addressesPerUser: mailFeatures.addressesPerUser,
        sourceTierId: tier.id,
      };
    }
  }

  private mergeMeetFeatures(tier: Tier, mergedFeatures: MergedTierFeatures): void {
    const meetFeatures = tier.featuresPerService[Service.Meet];
    if (meetFeatures.enabled && meetFeatures.paxPerCall > mergedFeatures.meet.paxPerCall) {
      mergedFeatures.meet = {
        enabled: true,
        paxPerCall: meetFeatures.paxPerCall,
        sourceTierId: tier.id,
      };
    }
  }

  private mergeVpnFeatures(tier: Tier, mergedFeatures: MergedTierFeatures): void {
    const vpnFeatures = tier.featuresPerService[Service.Vpn];
    // We cannot determine which featureId provides access to more zones
    // maybe add this info to the tier object?
    if (vpnFeatures.enabled && !mergedFeatures.vpn.enabled) {
      mergedFeatures.vpn = {
        enabled: true,
        featureId: vpnFeatures.featureId,
        sourceTierId: tier.id,
      };
    }
  }

  private mergeAntivirusFeatures(tier: Tier, mergedFeatures: MergedTierFeatures): void {
    const antivirusFeatures = tier.featuresPerService[Service.Antivirus];
    if (antivirusFeatures.enabled && !mergedFeatures.antivirus.enabled) {
      mergedFeatures.antivirus = {
        enabled: true,
        sourceTierId: tier.id,
      };
    }
  }

  private mergeBackupsFeatures(tier: Tier, mergedFeatures: MergedTierFeatures): void {
    const backupsFeatures = tier.featuresPerService[Service.Backups];
    if (backupsFeatures.enabled && !mergedFeatures.backups.enabled) {
      mergedFeatures.backups = {
        enabled: true,
        sourceTierId: tier.id,
      };
    }
  }

  private mergeFeatures(tiers: Tier[]): MergedTierFeatures {
    const mergedFeatures: MergedTierFeatures = {
      mail: { enabled: false, addressesPerUser: 0 },
      meet: { enabled: false, paxPerCall: 0 },
      vpn: { enabled: false, featureId: '' },
      antivirus: { enabled: false },
      backups: { enabled: false },
      drive: { tier: tiers[0] },
    };

    const businessTiers = tiers.filter((tier) => tier.featuresPerService[Service.Drive].workspaces.enabled);
    const individualTiers = tiers.filter((tier) => !tier.featuresPerService[Service.Drive].workspaces.enabled);

    mergedFeatures.drive.tier = this.selectBestDriveTier(businessTiers, individualTiers);

    this.mergeNonDriveFeatures(tiers, mergedFeatures);

    return mergedFeatures;
  }

  private async collectAllAvailableTiers(userUuid: string, ownersId?: string[]): Promise<Tier[]> {
    const availableTiers: Tier[] = [];

    const user = await this.usersService.findUserByUuid(userUuid);
    const userDirectTiers = await this.tiersService.getTiersProductsByUserId(user.id);
    availableTiers.push(...userDirectTiers);

    if (ownersId && ownersId.length > 0) {
      const ownerTierPromises = ownersId.map(async (ownerUuid) => {
        try {
          const owner = await this.usersService.findUserByUuid(ownerUuid);
          const ownerTiers = await this.tiersService.getTiersProductsByUserId(owner.id);
          return ownerTiers.filter((tier) => tier.featuresPerService[Service.Drive].workspaces.enabled);
        } catch (error) {
          if (error instanceof UserNotFoundError) return [];
          throw error;
        }
      });

      const ownerTiersArrays = await Promise.all(ownerTierPromises);
      const businessTiers = ownerTiersArrays.flat();
      console.log('businessTiers', businessTiers);
      availableTiers.push(...businessTiers);
    }

    const uniqueTiers = availableTiers.filter((tier, index, self) => index === self.findIndex((t) => t.id === tier.id));

    return uniqueTiers;
  }

  async getApplicableTierForUser({ userUuid, ownersId }: { userUuid: string; ownersId?: string[] }): Promise<Tier> {
    const availableTiers = await this.collectAllAvailableTiers(userUuid, ownersId);

    if (availableTiers.length === 0) {
      throw new TierNotFoundError(`No tiers found for user uuid ${userUuid}`);
    }

    const user = await this.usersService.findUserByUuid(userUuid);
    if (user.lifetime) {
      const lifetimeTier = availableTiers.find((tier) => tier.billingType === 'lifetime');
      if (lifetimeTier) {
        return lifetimeTier;
      }
    }

    const mergedFeatures = this.mergeFeatures(availableTiers);
    return mergedFeatures.drive.tier;
  }

  async getMergedFeaturesForUser({
    userUuid,
    ownersId,
  }: {
    userUuid: string;
    ownersId?: string[];
  }): Promise<MergedTierFeatures> {
    const availableTiers = await this.collectAllAvailableTiers(userUuid, ownersId);

    if (availableTiers.length === 0) {
      throw new TierNotFoundError(`No tiers found for user uuid ${userUuid}`);
    }

    return this.mergeFeatures(availableTiers);
  }

  async getFeatureSourceBreakdown({ userUuid, ownersId }: { userUuid: string; ownersId?: string[] }): Promise<{
    mergedFeatures: MergedTierFeatures;
    availableTiers: Tier[];
    breakdown: {
      mail: string | null;
      meet: string | null;
      vpn: string | null;
      antivirus: string | null;
      backups: string | null;
      drive: string;
    };
  }> {
    const availableTiers = await this.collectAllAvailableTiers(userUuid, ownersId);

    if (availableTiers.length === 0) {
      throw new TierNotFoundError(`No tiers found for user uuid ${userUuid}`);
    }

    const mergedFeatures = this.mergeFeatures(availableTiers);

    const breakdown = {
      mail: mergedFeatures.mail.enabled
        ? `${mergedFeatures.mail.addressesPerUser} addresses from tier ${mergedFeatures.mail.sourceTierId}`
        : null,
      meet: mergedFeatures.meet.enabled
        ? `${mergedFeatures.meet.paxPerCall} participants from tier ${mergedFeatures.meet.sourceTierId}`
        : null,
      vpn: mergedFeatures.vpn.enabled ? `VPN access from tier ${mergedFeatures.vpn.sourceTierId}` : null,
      antivirus: mergedFeatures.antivirus.enabled
        ? `Antivirus from tier ${mergedFeatures.antivirus.sourceTierId}`
        : null,
      backups: mergedFeatures.backups.enabled ? `Backups from tier ${mergedFeatures.backups.sourceTierId}` : null,
      drive: `Drive features from tier ${mergedFeatures.drive.tier.id} (${mergedFeatures.drive.tier.label})`,
    };

    return { mergedFeatures, availableTiers, breakdown };
  }

  async getAllVpnFeatures({ userUuid, ownersId }: { userUuid: string; ownersId?: string[] }): Promise<AllVpnFeatures> {
    const availableTiers = await this.collectAllAvailableTiers(userUuid, ownersId);

    const vpnOptions = availableTiers
      .filter((tier) => tier.featuresPerService[Service.Vpn].enabled)
      .map((tier) => ({
        featureId: tier.featuresPerService[Service.Vpn].featureId,
        sourceTierId: tier.id,
        tierLabel: tier.label,
      }));

    return { vpnOptions };
  }

  async hasVpnAccess({ userUuid, ownersId }: { userUuid: string; ownersId?: string[] }): Promise<boolean> {
    const vpnFeatures = await this.getAllVpnFeatures({ userUuid, ownersId });
    return vpnFeatures.vpnOptions.length > 0;
  }
}
