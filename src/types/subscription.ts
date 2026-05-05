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
    isFirstMonth?: boolean;
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
  minimumSeats?: number;
  maximumSeats?: number;
  type?: UserType;
};
