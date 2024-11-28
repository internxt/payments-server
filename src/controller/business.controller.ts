import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config';
import {
  IncompatibleSubscriptionTypesError,
  InvalidSeatNumberError,
  NotFoundSubscriptionError,
  PaymentService,
  UpdateWorkspaceError,
} from '../services/payment.service';
import { UserNotFoundError, UsersService } from '../services/users.service';
import { assertUser } from '../utils/assertUser';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';
import Stripe from 'stripe';

export default function (paymentService: PaymentService, usersService: UsersService, config: AppConfig) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.register(fastifyLimit, {
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

    fastify.patch<{ Body: { workspaceId: string; subscriptionId: string; workspaceUpdatedSeats: number } }>(
      '/subscription',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              workspaceId: { type: 'string' },
              subscriptionId: { type: 'string' },
              workspaceUpdatedSeats: { type: 'number' },
            },
            required: ['workspaceId', 'subscriptionId', 'workspaceUpdatedSeats'],
          },
        },
      },
      async (req, res): Promise<Stripe.Subscription> => {
        const { workspaceId, subscriptionId, workspaceUpdatedSeats } = req.body;
        const user = await assertUser(req, res, usersService);

        if (!user) throw new UserNotFoundError('User does not exist');

        try {
          const activeSubscription = await paymentService.getSubscriptionById(subscriptionId);
          if (activeSubscription.status !== 'active') {
            throw new NotFoundSubscriptionError('Subscription not found');
          }
          const productItem = activeSubscription.items.data[0];
          const maxSpaceBytes = productItem?.price.metadata.maxSpaceBytes as string;

          const { minimumSeats, maximumSeats } = await paymentService.getBusinessSubscriptionSeats(
            productItem?.price.id as string,
          );

          if (minimumSeats && maximumSeats) {
            if (workspaceUpdatedSeats > parseInt(maximumSeats)) {
              throw new InvalidSeatNumberError('The new price does not allow the current amount of seats');
            }

            if (workspaceUpdatedSeats < parseInt(minimumSeats)) {
              throw new InvalidSeatNumberError('The new price does not allow the current amount of seats');
            }

            if (workspaceUpdatedSeats === productItem?.quantity) {
              throw new InvalidSeatNumberError('The workspace already has these seats');
            }
          }

          await usersService.isWorkspaceUpgradeAllowed(
            user.uuid,
            workspaceId,
            Number(maxSpaceBytes),
            workspaceUpdatedSeats,
          );

          const updatedSub = await paymentService.updateBusinessSub({
            customerId: user.customerId,
            priceId: productItem?.price.id as string,
            seats: workspaceUpdatedSeats,
            additionalOptions: {
              proration_behavior: 'create_prorations',
            },
          });

          await usersService.updateWorkspaceStorage(user.uuid, Number(maxSpaceBytes), workspaceUpdatedSeats);

          return res.status(200).send(updatedSub);
        } catch (err) {
          const error = err as Error;
          req.log.error(`[WORKSPACES/ERROR]: Error trying to update seats: ${error.stack ?? error.message}`);
          if (
            error instanceof InvalidSeatNumberError ||
            error instanceof IncompatibleSubscriptionTypesError ||
            error instanceof NotFoundSubscriptionError ||
            error instanceof UpdateWorkspaceError ||
            error instanceof UserNotFoundError
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
