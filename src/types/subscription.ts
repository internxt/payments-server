import { DisplayPrice } from '../core/users/DisplayPrice';
import { UserType } from '../core/users/User';
import { CommitmentCancellationInfo } from '../infrastructure/domain/entities/subscription';

export enum RenewalPeriod {
  Monthly = 'monthly',
  Semiannually = 'semiannually',
  Annually = 'annually',
  Lifetime = 'lifetime',
}

export interface PlanSubscription {
  status: string;
  name: string;
  type: UserType;
  price: number;
  monthlyPrice: number;
  currency: string;
  renewalPeriod: RenewalPeriod;
  commitment: CommitmentCancellationInfo & {
    enabled: boolean;
    isCancellationTrialRedeemed: boolean;
  };
  storageLimit: number;
  amountOfSeats: number;
  seats?: {
    minimumSeats: number;
    maximumSeats: number;
  };
}

export interface SubscriptionCreated {
  type: 'setup' | 'payment';
  clientSecret: string;
  subscriptionId?: string;
  paymentIntentId?: string;
}

export type RequestedPlanData = DisplayPrice & {
  decimalAmount: number;
  type?: UserType;
};
