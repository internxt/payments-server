import { Service, Tier } from '../core/users/Tier';
import { User } from '../core/users/User';
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

export class ProductsService {
  constructor(
    private readonly tiersService: TiersService,
    private readonly usersService: UsersService,
  ) {}

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

  private getBestIndividualTier(availableTiers: Tier[]): Tier | undefined {
    const individualTiers = availableTiers.filter((tier) => !tier.featuresPerService[Service.Drive].workspaces.enabled);

    if (individualTiers.length === 0) {
      return undefined;
    }

    return individualTiers.reduce((best, current) => (this.compareIndividualTiers(current, best) > 0 ? current : best));
  }

  private getBestBusinessTier(availableTiers: Tier[]): Tier | undefined {
    const businessTiers = availableTiers.filter((tier) => tier.featuresPerService[Service.Drive].workspaces.enabled);

    if (businessTiers.length === 0) {
      return undefined;
    }

    return businessTiers.reduce((best, current) => (this.compareBusinessTiers(current, best) > 0 ? current : best));
  }

  private compareIndividualTiers(tierA: Tier, tierB: Tier): number {
    const best = tierA.featuresPerService[Service.Drive].maxSpaceBytes;
    const current = tierB.featuresPerService[Service.Drive].maxSpaceBytes;

    return best - current;
  }

  private compareBusinessTiers(bestTier: Tier, currentTier: Tier): number {
    const best = bestTier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat;
    const current = currentTier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat;

    return best - current;
  }

  private selectHighestTier(individualTier?: Tier, businessTier?: Tier): Tier | undefined {
    if (!individualTier && !businessTier) {
      return undefined;
    }

    if (!individualTier) return businessTier;
    if (!businessTier) return individualTier;

    const individualStorage = individualTier.featuresPerService[Service.Drive].maxSpaceBytes;
    const businessStoragePerSeat = businessTier.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat;

    return businessStoragePerSeat >= individualStorage ? businessTier : individualTier;
  }

  private async determineUserTier(userUuid: User['uuid'], ownersId?: string[]): Promise<Tier | undefined> {
    const availableTiers = await this.collectAllAvailableTiers(userUuid, ownersId);

    if (availableTiers.length === 0) {
      return undefined;
    }

    const individualTier = this.getBestIndividualTier(availableTiers);
    const businessTier = this.getBestBusinessTier(availableTiers);

    return this.selectHighestTier(individualTier, businessTier);
  }

  async getApplicableTierForUser({ userUuid, ownersId }: { userUuid: string; ownersId?: string[] }): Promise<Tier> {
    const freeTier = await this.tiersService.getTierProductsByProductsId('free');
    const availableTier = await this.determineUserTier(userUuid, ownersId);

    return availableTier ?? freeTier;
  }
}
