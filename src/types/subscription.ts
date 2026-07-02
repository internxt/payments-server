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
  name: string;
  type: UserType;
  price: number;
  monthlyPrice: number;
  currency: string;
  renewalPeriod: RenewalPeriod;
  commitment: {
    enabled: boolean;
    isCancellationTrialRedeemed?: boolean;
    remainingMonths?: number;
    cancellationDate?: string;
    isCancellable?: boolean;
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
