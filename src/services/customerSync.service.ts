import { UsersService } from './users.service';
import { PaymentService } from './payment.service';
import { User } from '../core/users/User';
import Stripe from 'stripe';

export class CustomerSyncService {
  constructor(
    private readonly usersService: UsersService,
    private readonly paymentService: PaymentService,
  ) {}

  async findOrSyncCustomerByUuidOrEmail(uuid: string, email: string): Promise<string | null> {
    let user: User | null = null;

    try {
      user = await this.usersService.findUserByUuid(uuid);
      if (user.customerId) return user.customerId;
    } catch {
      // No action, we'll try with email
    }

    const stripeCustomers = await this.paymentService.getCustomersByEmail(email);

    if (stripeCustomers.length === 0) {
      return null;
    }

    if (stripeCustomers.length === 1) {
      try {
        const [customer] = stripeCustomers;
        const existingUser = await this.usersService.findUserByCustomerID(customer.id);

        if (!existingUser) return customer.id;

        if (existingUser.uuid !== uuid) {
          await this.usersService.updateUser(customer.id, {
            uuid,
          });
        }

        return customer.id;
      } catch {
        return null;
      }
    }

    let matchedCustomer: Stripe.Customer | undefined;

    for (const customer of stripeCustomers) {
      try {
        const matched = await this.usersService.findUserByCustomerID(customer.id);
        if (matched?.uuid === uuid) {
          matchedCustomer = customer;
          break;
        }
      } catch {
        //
      }
    }

    if (matchedCustomer) {
      return matchedCustomer.id;
    }

    return null;
  }
}
