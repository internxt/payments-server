import { Service, Tier } from '../core/users/Tier';
import { User } from '../core/users/User';
import { UserNotFoundError } from '../errors/PaymentErrors';
import { TierNotFoundError, TiersService } from './tiers.service';
import { UserFeaturesOverridesService } from './userFeaturesOverride.service';
import { UsersService } from './users.service';

export class ProductsService {
  constructor(
    private readonly tiersService: TiersService,
    private readonly usersService: UsersService,
    private readonly userFeatureOverridesService: UserFeaturesOverridesService,
  ) {}

  private async collectAllAvailableTiers(userUuid: string, ownersId?: string[]): Promise<Tier[]> {
    const availableTiers: Tier[] = [];

    try {
      const user = await this.usersService.findUserByUuid(userUuid);
      const userDirectTiers = await this.tiersService.getTiersProductsByUserId(user.id);
      availableTiers.push(...userDirectTiers);
    } catch (error) {
      if (error instanceof UserNotFoundError || error instanceof TierNotFoundError) return [];
      throw error;
    }

    if (ownersId && ownersId.length > 0) {
      const ownerTierPromises = ownersId.map(async (ownerUuid) => {
        try {
          const owner = await this.usersService.findUserByUuid(ownerUuid);
          const ownerTiers = await this.tiersService.getTiersProductsByUserId(owner.id).catch((err) => {
            if (err instanceof TierNotFoundError) return [];
            throw err;
          });
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

    return individualTiers.reduce(
      (best, current) => (this.compareIndividualTiers(current, best) > 0 ? current : best),
      individualTiers[0],
    );
  }

  private getBestBusinessTier(availableTiers: Tier[]): Tier | undefined {
    const businessTiers = availableTiers.filter((tier) => tier.featuresPerService[Service.Drive].workspaces.enabled);

    if (businessTiers.length === 0) {
      return undefined;
    }

    return businessTiers.reduce(
      (best, current) => (this.compareBusinessTiers(current, best) > 0 ? current : best),
      businessTiers[0],
    );
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

    return this.mergeTiers(individualTier, businessTier);
  }

  private countEnabledProducts(tier: Tier): number {
    return Object.values(tier.featuresPerService).filter((feature) => feature.enabled).length;
  }

  private mergeTiers(individualTier: Tier, businessTier: Tier): Tier {
    const individualEnabledCount = this.countEnabledProducts(individualTier);
    const businessEnabledCount = this.countEnabledProducts(businessTier);
    const tierWithMostProducts = businessEnabledCount > individualEnabledCount ? businessTier : individualTier;

    const individual = individualTier.featuresPerService;
    const business = businessTier.featuresPerService;

    const baseMerge = Object.values(Service).reduce(
      (acc, service) => {
        acc[service] = {
          ...individual[service],
          ...business[service],
          enabled: individual[service].enabled || business[service].enabled,
        };
        return acc;
      },
      {} as Record<Service, any>,
    );

    const mergedFeatures = {
      ...baseMerge,
      [Service.Drive]: {
        ...baseMerge[Service.Drive],
        maxSpaceBytes: individual[Service.Drive].maxSpaceBytes,
        workspaces: business[Service.Drive].workspaces,
        passwordProtectedSharing: {
          enabled:
            individual[Service.Drive].passwordProtectedSharing.enabled ||
            business[Service.Drive].passwordProtectedSharing.enabled,
        },
        restrictedItemsSharing: {
          enabled:
            individual[Service.Drive].restrictedItemsSharing.enabled ||
            business[Service.Drive].restrictedItemsSharing.enabled,
        },
        fileVersioning: {
          enabled: individual[Service.Drive].fileVersioning.enabled || business[Service.Drive].fileVersioning.enabled,
        },
      },
      [Service.Meet]: {
        ...baseMerge[Service.Meet],
        paxPerCall: Math.max(individual[Service.Meet].paxPerCall, business[Service.Meet].paxPerCall),
      },
      [Service.Mail]: {
        ...baseMerge[Service.Mail],
        addressesPerUser: Math.max(individual[Service.Mail].addressesPerUser, business[Service.Mail].addressesPerUser),
      },
      [Service.Vpn]: tierWithMostProducts.featuresPerService[Service.Vpn],
    };

    return {
      id: tierWithMostProducts.id,
      label: tierWithMostProducts.label,
      productId: tierWithMostProducts.productId,
      billingType: tierWithMostProducts.billingType,
      featuresPerService: mergedFeatures as Tier['featuresPerService'],
    };
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

  private async applyUserFeatureOverrides(tier: Tier, userId: string): Promise<Tier> {
    const userOverrides = await this.userFeatureOverridesService.getCustomUserFeatures(userId);

    if (!userOverrides?.featuresPerService) {
      return tier;
    }

    const mergedFeatures = { ...tier.featuresPerService };

    Object.entries(userOverrides.featuresPerService).forEach(([service, overrideFeature]) => {
      const serviceKey = service as Service;

      if (mergedFeatures[serviceKey] && overrideFeature) {
        mergedFeatures[serviceKey] = {
          ...mergedFeatures[serviceKey],
          ...overrideFeature,
        } as any;
      }
    });

    return {
      ...tier,
      featuresPerService: mergedFeatures,
    };
  }

  async getApplicableTierForUser({ userUuid, ownersId }: { userUuid: string; ownersId?: string[] }): Promise<Tier> {
    const freeTier = await this.tiersService.getTierProductsByProductsId('free');
    const availableTier = await this.determineUserTier(userUuid, ownersId);
    const baseTier = availableTier ?? freeTier;

    try {
      const user = await this.usersService.findUserByUuid(userUuid);
      const mergedFeatures = await this.applyUserFeatureOverrides(baseTier, user.id);
      return mergedFeatures;
    } catch {
      return baseTier;
    }
  }
}
