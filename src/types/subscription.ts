import { DisplayPrice } from '../core/users/DisplayPrice';
import { UserType } from '../core/users/User';

export enum RenewalPeriod {
  Monthly = 'monthly',
  Semiannually = 'semiannually',
  Annually = 'annually',
  Lifetime = 'lifetime',
}

export interface PlanSubscription {
  status: string;
  planId: string;
  productId: string;
  name: string;
  simpleName: string;
  type: UserType;
  price: number;
  monthlyPrice: number;
  currency: string;
  isTeam: boolean;
  paymentInterval: string;
  isLifetime: boolean;
  renewalPeriod: RenewalPeriod;
  commitment: {
    enabled: boolean;
    remainingMonths?: number;
    cancellationDate?: string;
    isElegibleForCancellation?: boolean;
    earlyCancellationFee?: number;
  };
  storageLimit: number;
  amountOfSeats: number;
  cancellationTrial: {
    redeemed: boolean;
  };
  cancellation: {
    scheduled: boolean;
    cancelAt?: number;
  };
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
