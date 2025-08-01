import { Service, Tier } from '../core/users/Tier';
import { NotFoundError } from '../errors/Errors';
import { TiersService } from './tiers.service';
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
  cleaner: {
    enabled: boolean;
    sourceTierId?: string;
  };
  drive: {
    enabled: boolean;
    maxSpaceBytes: number;
    workspaces: {
      enabled: boolean;
      minimumSeats: number;
      maximumSeats: number;
      maxSpaceBytesPerSeat: number;
    };
    sourceTierId?: string;
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

  private selectBestDriveFeatures(
    businessTiers: Tier[],
    individualTiers: Tier[],
  ): { driveFeatures: any; sourceTierId: string } {
    if (businessTiers.length > 0) {
      const bestBusinessTier = businessTiers.reduce((best, current) => {
        const bestStorage = best.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat;
        const currentStorage = current.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat;

        const isCurrentTierBetter = currentStorage > bestStorage;
        return isCurrentTierBetter ? current : best;
      }, businessTiers[0]);

      return {
        driveFeatures: bestBusinessTier.featuresPerService[Service.Drive],
        sourceTierId: bestBusinessTier.id,
      };
    }

    if (individualTiers.length > 0) {
      const bestIndividualTier = individualTiers.reduce((best, current) => {
        const bestStorage = best.featuresPerService[Service.Drive].maxSpaceBytes;
        const currentStorage = current.featuresPerService[Service.Drive].maxSpaceBytes;

        const isCurrentTierBetter = currentStorage > bestStorage;
        return isCurrentTierBetter ? current : best;
      }, individualTiers[0]);

      return {
        driveFeatures: bestIndividualTier.featuresPerService[Service.Drive],
        sourceTierId: bestIndividualTier.id,
      };
    }

    throw new NotFoundError('No drive tiers available');
  }

  private mergeNonDriveFeatures(tiers: Tier[], mergedFeatures: MergedTierFeatures): void {
    for (const tier of tiers) {
      this.mergeMailFeatures(tier, mergedFeatures);
      this.mergeMeetFeatures(tier, mergedFeatures);
      this.mergeVpnFeatures(tier, mergedFeatures);
      this.mergeAntivirusFeatures(tier, mergedFeatures);
      this.mergeBackupsFeatures(tier, mergedFeatures);
      this.mergeCleanerFeatures(tier, mergedFeatures);
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

  private mergeCleanerFeatures(tier: Tier, mergedFeatures: MergedTierFeatures): void {
    const cleanerFeatures = tier.featuresPerService[Service.Cleaner];
    if (cleanerFeatures.enabled && !mergedFeatures.cleaner.enabled) {
      mergedFeatures.cleaner = {
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
      cleaner: { enabled: false },
      drive: {
        enabled: false,
        maxSpaceBytes: 0,
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
          maxSpaceBytesPerSeat: 0,
        },
      },
    };

    const businessTiers = tiers.filter((tier) => tier.featuresPerService[Service.Drive].workspaces.enabled);
    const individualTiers = tiers.filter((tier) => !tier.featuresPerService[Service.Drive].workspaces.enabled);

    const { driveFeatures, sourceTierId } = this.selectBestDriveFeatures(businessTiers, individualTiers);
    mergedFeatures.drive = {
      ...driveFeatures,
      sourceTierId,
    };

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
      availableTiers.push(...businessTiers);
    }

    const uniqueTiers = availableTiers.filter((tier, index, self) => index === self.findIndex((t) => t.id === tier.id));

    return uniqueTiers;
  }

  async getApplicableTierForUser({
    userUuid,
    ownersId,
  }: {
    userUuid: string;
    ownersId?: string[];
  }): Promise<MergedTierFeatures> {
    const availableTiers = await this.collectAllAvailableTiers(userUuid, ownersId);

    if (availableTiers.length === 0) {
      const freeTier = await this.tiersService.getTierProductsByProductsId('free');
      return {
        mail: {
          enabled: freeTier.featuresPerService[Service.Mail].enabled,
          addressesPerUser: freeTier.featuresPerService[Service.Mail].addressesPerUser,
        },
        meet: {
          enabled: freeTier.featuresPerService[Service.Meet].enabled,
          paxPerCall: freeTier.featuresPerService[Service.Meet].paxPerCall,
        },
        vpn: {
          enabled: freeTier.featuresPerService[Service.Vpn].enabled,
          featureId: freeTier.featuresPerService[Service.Vpn].featureId,
        },
        antivirus: { enabled: freeTier.featuresPerService[Service.Antivirus].enabled },
        backups: { enabled: freeTier.featuresPerService[Service.Backups].enabled },
        cleaner: { enabled: freeTier.featuresPerService[Service.Cleaner].enabled },
        drive: {
          enabled: freeTier.featuresPerService[Service.Drive].enabled,
          maxSpaceBytes: freeTier.featuresPerService[Service.Drive].maxSpaceBytes,
          workspaces: freeTier.featuresPerService[Service.Drive].workspaces,
          sourceTierId: freeTier.id,
        },
      };
    }

    const user = await this.usersService.findUserByUuid(userUuid);
    if (user.lifetime) {
      const lifetimeTier = availableTiers.find((tier) => tier.billingType === 'lifetime');
      if (lifetimeTier) {
        return {
          mail: {
            enabled: lifetimeTier.featuresPerService[Service.Mail].enabled,
            addressesPerUser: lifetimeTier.featuresPerService[Service.Mail].addressesPerUser,
            sourceTierId: lifetimeTier.id,
          },
          meet: {
            enabled: lifetimeTier.featuresPerService[Service.Meet].enabled,
            paxPerCall: lifetimeTier.featuresPerService[Service.Meet].paxPerCall,
            sourceTierId: lifetimeTier.id,
          },
          vpn: {
            enabled: lifetimeTier.featuresPerService[Service.Vpn].enabled,
            featureId: lifetimeTier.featuresPerService[Service.Vpn].featureId,
            sourceTierId: lifetimeTier.id,
          },
          antivirus: {
            enabled: lifetimeTier.featuresPerService[Service.Antivirus].enabled,
            sourceTierId: lifetimeTier.id,
          },
          backups: { enabled: lifetimeTier.featuresPerService[Service.Backups].enabled, sourceTierId: lifetimeTier.id },
          cleaner: { enabled: lifetimeTier.featuresPerService[Service.Cleaner].enabled, sourceTierId: lifetimeTier.id },
          drive: {
            enabled: lifetimeTier.featuresPerService[Service.Drive].enabled,
            maxSpaceBytes: lifetimeTier.featuresPerService[Service.Drive].maxSpaceBytes,
            workspaces: lifetimeTier.featuresPerService[Service.Drive].workspaces,
            sourceTierId: lifetimeTier.id,
          },
        };
      }
    }

    return this.mergeFeatures(availableTiers);
  }
}
