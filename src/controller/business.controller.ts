import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import {
  IncompatibleSubscriptionTypesError,
  InvalidSeatNumberError,
  NotFoundSubscriptionError,
  PaymentService,
} from '../services/payment.service';
import { UsersService } from '../services/users.service';
import { assertUser } from '../utils/assertUser';
import { UserType } from '../core/users/User';
import fastifyJwt from '@fastify/jwt';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rateLimit = require('fastify-rate-limit');

export default function (paymentService: PaymentService, usersService: UsersService, config: AppConfig) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.register(rateLimit, {
      max: 1000,
      timeWindow: '1 minute',
    });
    fastify.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        request.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
        reply.status(401).send();
      }
    });

    fastify.patch<{ Body: { subscriptionId: string; workspaceUpdatedSeats: number } }>(
      '/subscription',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              subscriptionId: { type: 'string' },
              workspaceUpdatedSeats: { type: 'number' },
            },
            required: ['workspaceUpdatedSeats'],
          },
        },
      },
      async (req, res) => {
        const { subscriptionId, workspaceUpdatedSeats } = req.body;
        const user = await assertUser(req, res, usersService);
        try {
          const activeSubscriptions = await paymentService.getActiveSubscriptions(user.customerId);
          if (activeSubscriptions.length === 0) {
            throw new NotFoundSubscriptionError('Subscriptions not found');
          }

          const businessActiveSubscription = activeSubscriptions.find(
            (subscription) =>
              subscription.product?.metadata.type === UserType.Business && subscription.id === subscriptionId,
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
            additionalOptions: {
              proration_behavior: 'create_prorations',
            },
          });

          await usersService.updateWorkspaceStorage(user.uuid, Number(maxSpaceBytes), workspaceUpdatedSeats);

          return updatedSub;
        } catch (err) {
          const error = err as Error;
          req.log.error(`[WORKSPACES/ERROR]: Error trying to update seats: ${error.stack ?? error.message}`);
          if (
            error instanceof InvalidSeatNumberError ||
            error instanceof IncompatibleSubscriptionTypesError ||
            error instanceof NotFoundSubscriptionError
          ) {
            return res.status(400).send({
              message: error.message,
            });
          }

          return res.status(500).send({
            message: 'Internal Server Error',
          });
        }
      },
    );
  };
}
