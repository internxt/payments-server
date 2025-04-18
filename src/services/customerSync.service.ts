import { UsersService } from './users.service';
import { PaymentService } from './payment.service';
import { User } from '../core/users/User';

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
      const [customer] = stripeCustomers;
      const existingUser = await this.usersService.findUserByCustomerID(customer.id);

      if (!existingUser) return customer.id;

      // Si el uuid ha cambiado, actualizamos
      if (existingUser.uuid !== uuid) {
        await this.usersService.updateUser(customer.id, {
          uuid,
        });
      }

      return customer.id;
    }

    const matchedCustomer = stripeCustomers.find(async (customer) => {
      const customerId = customer.id;
      const matched = await this.usersService.findUserByCustomerID(customerId);
      return matched?.uuid === uuid;
    });

    if (matchedCustomer) {
      return matchedCustomer.id;
    }

    return null;
  }
}
