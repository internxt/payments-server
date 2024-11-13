import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import { InvalidSeatNumberError, PaymentService } from '../services/payment.service';
import { UsersService } from '../services/users.service';
import { assertUser } from '../utils/assertUser';
import { UserType } from '../core/users/User';

export default function (paymentService: PaymentService, usersService: UsersService, config: AppConfig) {
  return async function (fastify: FastifyInstance) {
    fastify.patch<{ Body: { workspaceUpdatedSeats: number } }>('/subscription', async (req, res) => {
      const { workspaceUpdatedSeats } = req.body;
      const user = await assertUser(req, res, usersService);
      try {
        const activeSubscriptions = await paymentService.getActiveSubscriptions(user.customerId);
        const businessActiveSubscription = activeSubscriptions.find(
          (subscription) => subscription.product?.metadata.type === UserType.Business,
        );
        const currentSubscription = businessActiveSubscription?.items.data[0];
        const maxSpaceBytes = currentSubscription?.price.metadata.maxSpaceBytes as string;

        const { minimumSeats, maximumSeats } = await paymentService.getBusinessSubscriptionSeats(
          businessActiveSubscription?.product?.default_price as string,
        );

        if (minimumSeats && maximumSeats) {
          if (workspaceUpdatedSeats > parseInt(maximumSeats)) {
            throw new InvalidSeatNumberError('The new price does not allow the current amount of seats');
          }

          if (workspaceUpdatedSeats < parseInt(minimumSeats)) {
            throw new InvalidSeatNumberError('The new price does not allow the current amount of seats');
          }

          if (workspaceUpdatedSeats === currentSubscription?.quantity) {
            throw new InvalidSeatNumberError('The same seats are used');
          }
        }

        const updatedSub = await paymentService.updateBusinessSub({
          customerId: user.customerId,
          priceId: currentSubscription?.price.id as string,
          seats: workspaceUpdatedSeats,
        });

        await usersService.updateWorkspaceStorage(user.uuid, Number(maxSpaceBytes), workspaceUpdatedSeats);

        return updatedSub;
      } catch (error) {
        //
      }
    });
  };
}
