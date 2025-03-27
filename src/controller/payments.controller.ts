import Stripe from 'stripe';
import { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import { type AppConfig } from '../config';
import { UsersService } from '../services/users.service';
import {
  CouponCodeError,
  IncompatibleSubscriptionTypesError,
  InvalidSeatNumberError,
  CustomerId,
  ExistingSubscriptionError,
  MissingParametersError,
  NotFoundPlanByIdError,
  NotFoundPromoCodeByNameError,
  PaymentService,
  PromoCodeIsNotValidError,
  UserAlreadyExistsError,
  CustomerNotFoundError,
  InvalidTaxIdError,
  Reason,
} from '../services/payment.service';
import { User, UserSubscription, UserType } from '../core/users/User';
import CacheService from '../services/cache.service';
import {
  InvalidLicenseCodeError,
  LicenseCodeAlreadyAppliedError,
  LicenseCodesService,
} from '../services/licenseCodes.service';
import { Coupon } from '../core/coupons/Coupon';
import { assertUser } from '../utils/assertUser';
import { fetchUserStorage } from '../utils/fetchUserStorage';
import { TierNotFoundError, TiersService } from '../services/tiers.service';

type AllowedMethods = 'GET' | 'POST';

export const allowedCurrency = ['eur', 'usd'];

const ALLOWED_PATHS: {
  [key: string]: AllowedMethods[];
} = {
  '/prices': ['GET'],
  '/is-unique-code-available': ['GET'],
  '/plan-by-id': ['GET'],
  '/promo-code-by-name': ['GET'],
  '/promo-code-info': ['GET'],
  '/object-storage-plan-by-id': ['GET'],
  '/create-customer-for-object-storage': ['POST'],
  '/payment-intent-for-object-storage': ['GET'],
  '/create-subscription-for-object-storage': ['POST'],
};

export default function (
  paymentService: PaymentService,
  usersService: UsersService,
  config: AppConfig,
  cacheService: CacheService,
  licenseCodesService: LicenseCodesService,
  tiersService: TiersService,
) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.register(fastifyLimit, {
      max: 1000,
      timeWindow: '1 minute',
    });
    fastify.addHook('onRequest', async (request, reply) => {
      try {
        const config: { url?: string; method?: AllowedMethods } = {
          url: request.url.split('?')[0],
          method: request.method as AllowedMethods,
        };
        if (
          config.method &&
          config.url &&
          ALLOWED_PATHS[config.url] &&
          ALLOWED_PATHS[config.url].includes(config.method)
        ) {
          return;
        }
        await request.jwtVerify();
      } catch (err) {
        request.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
        reply.status(401).send();
      }
    });

    fastify.post<{ Body: { name: string; email: string; country?: string; companyVatId?: string } }>(
      '/create-customer-for-object-storage',
      {
        schema: {
          body: {
            type: 'object',
            required: ['email', 'name'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              country: { type: 'string' },
              companyVatId: { type: 'string' },
            },
          },
        },
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 hour',
          },
        },
      },
      async (req, res) => {
        const { name, email, country, companyVatId } = req.body;

        if (!email) {
          return res.status(404).send({
            message: 'Email should be provided',
          });
        }
        try {
          const { id } = await paymentService.createOrGetCustomer(
            {
              name,
              email,
            },
            country,
            companyVatId,
          );

          const token = jwt.sign(
            {
              customerId: id,
            },
            config.JWT_SECRET,
          );

          return res.send({
            customerId: id,
            token,
          });
        } catch (err) {
          const error = err as Error;
          if (err instanceof UserAlreadyExistsError) {
            return res.status(409).send(err.message);
          }
          req.log.error(`ERROR WHILE CREATING CUSTOMER: ${error.stack ?? error.message}`);
          return res.status(500).send({
            message: 'Internal Server Error',
          });
        }
      },
    );

    fastify.post<{ Body: { name: string; email: string; country?: string; companyVatId?: string } }>(
      '/create-customer',
      {
        schema: {
          body: {
            type: 'object',
            required: ['email', 'name'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              country: { type: 'string' },
              companyVatId: { type: 'string' },
            },
          },
        },
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 hour',
          },
        },
      },
      async (req, res) => {
        const { name, email, country, companyVatId } = req.body;

        if (!email) {
          return res.status(404).send({
            message: 'Email should be provided',
          });
        }

        try {
          const { id } = await paymentService.createOrGetCustomer(
            {
              name,
              email,
            },
            country,
            companyVatId,
          );

          const token = jwt.sign(
            {
              customerId: id,
            },
            config.JWT_SECRET,
          );

          return res.send({
            customerId: id,
            token,
          });
        } catch (err) {
          const error = err as Error;

          req.log.error(`[ERROR CREATING CUSTOMER]: ${error.stack ?? error.message}`);

          if (error instanceof InvalidTaxIdError) {
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

    fastify.get<{
      Querystring: { email: string };
      schema: {
        querystring: {
          type: 'object';
          properties: { email: { type: 'number' } };
        };
      };
    }>('/get-customer-id', async (req, res) => {
      const { email } = req.query;

      if (!email) {
        return res.status(404).send({
          message: 'Email should be provided',
        });
      }

      try {
        const { id } = await paymentService.getCustomerIdByEmail(email);

        const token = jwt.sign(
          {
            customerId: id,
          },
          config.JWT_SECRET,
          {
            expiresIn: '1h',
          },
        );

        return res.status(200).send({
          customerId: id,
          token,
        });
      } catch (error) {
        if (error instanceof CustomerNotFoundError) {
          return res.status(404).send({
            message: error.message,
          });
        }

        const err = error as Error;
        req.log.error(`[ERROR FETCHING THE CUSTOMER ID]: ${err.stack ?? err.message}`);

        return res.status(500).send({
          message: 'Internal Server Error',
        });
      }
    });

    fastify.post<{
      Body: {
        customerId: string;
        priceId: string;
        currency: string;
        token: string;
        quantity?: number;
        promoCodeId?: string;
      };
    }>(
      '/create-subscription',
      {
        schema: {
          body: {
            type: 'object',
            required: ['customerId', 'priceId'],
            properties: {
              customerId: {
                type: 'string',
              },
              priceId: {
                type: 'string',
              },
              token: {
                type: 'string',
              },
              currency: {
                type: 'string',
              },
              promoCodeId: {
                type: 'string',
              },
              quantity: {
                type: 'number',
              },
            },
          },
        },
      },
      async (req, res) => {
        const { customerId, priceId, currency, token, promoCodeId, quantity: seatsForBusinessSubscription } = req.body;

        if (!customerId || !priceId) {
          throw new MissingParametersError(['customerId', 'priceId']);
        }

        try {
          const payload = jwt.verify(token, config.JWT_SECRET) as {
            customerId: string;
          };
          const tokenCustomerId = payload.customerId;

          if (customerId !== tokenCustomerId) {
            return res.status(403).send();
          }
        } catch (error) {
          return res.status(403).send();
        }

        try {
          const subscriptionSetup = await paymentService.createSubscription({
            customerId,
            priceId,
            seatsForBusinessSubscription: seatsForBusinessSubscription ?? 1,
            currency,
            promoCodeId,
          });

          return res.send(subscriptionSetup);
        } catch (err) {
          const error = err as Error;
          req.log.error(`[ERROR CREATING SUBSCRIPTION]: ${error.stack ?? error.message}`);

          if (error instanceof MissingParametersError) {
            return res.status(400).send({
              message: error.message,
            });
          } else if (error instanceof PromoCodeIsNotValidError) {
            return res
              .status(422)
              .send({ message: 'The promotion code is not applicable under the current conditions' });
          } else if (error instanceof ExistingSubscriptionError) {
            return res.status(409).send({
              message: error.message,
            });
          }

          return res.status(500).send({
            message: 'Internal Server Error',
          });
        }
      },
    );

    fastify.post<{
      Body: {
        customerId: string;
        priceId: string;
        currency: string;
        token: string;
        promoCodeId?: string;
        companyName: string;
        companyVatId: string;
      };
    }>(
      '/create-subscription-for-object-storage',
      {
        schema: {
          body: {
            type: 'object',
            required: ['customerId', 'priceId'],
            properties: {
              customerId: {
                type: 'string',
              },
              priceId: {
                type: 'string',
              },
              token: {
                type: 'string',
              },
              currency: {
                type: 'string',
              },
              promoCodeId: {
                type: 'string',
              },
              companyName: {
                type: 'string',
              },
              companyVatId: {
                type: 'string',
              },
            },
          },
        },
      },
      async (req, res) => {
        const { customerId, priceId, currency, token, promoCodeId, companyName, companyVatId } = req.body;

        if (!customerId || !priceId) {
          throw new MissingParametersError(['customerId', 'priceId']);
        }

        try {
          const payload = jwt.verify(token, config.JWT_SECRET) as {
            customerId: string;
          };
          const tokenCustomerId = payload.customerId;

          if (customerId !== tokenCustomerId) {
            return res.status(403).send();
          }
        } catch (error) {
          return res.status(403).send();
        }

        try {
          const subscriptionSetUp = await paymentService.createSubscription({
            customerId,
            priceId,
            currency,
            companyName,
            promoCodeId,
            companyVatId,
          });

          return res.send(subscriptionSetUp);
        } catch (err) {
          const error = err as Error;
          if (error instanceof MissingParametersError) {
            return res.status(400).send({
              message: error.message,
            });
          } else if (error instanceof ExistingSubscriptionError) {
            return res.status(409).send({
              message: error.message,
            });
          }

          req.log.error(`[ERROR CREATING SUBSCRIPTION]: ${error.stack ?? error.message}`);

          return res.status(500).send({
            message: 'Internal Server Error',
          });
        }
      },
    );

    fastify.post<{
      Querystring: { trialToken: string };
      Body: {
        customerId: string;
        priceId: string;
        currency: string;
        token: string;
        trialCode: string;
      };
    }>(
      '/create-subscription-with-trial',
      {
        schema: {
          body: {
            type: 'object',
            required: ['customerId', 'priceId'],
            properties: {
              customerId: {
                type: 'string',
              },
              priceId: {
                type: 'string',
              },
              token: {
                type: 'string',
              },
              currency: {
                type: 'string',
              },
              trialCode: {
                type: 'string',
              },
            },
          },
        },
      },
      async (req, res) => {
        const { customerId, priceId, currency, token } = req.body;

        if (!customerId || !priceId) {
          throw new MissingParametersError(['customerId', 'priceId']);
        }

        try {
          const payload = jwt.verify(token, config.JWT_SECRET) as {
            customerId: string;
          };
          const tokenCustomerId = payload.customerId;

          if (customerId !== tokenCustomerId) {
            return res.status(403).send();
          }
        } catch (error) {
          return res.status(403).send();
        }

        const { trialToken } = req.query;

        if (!trialToken) {
          return res.status(403).send('Invalid trial token');
        }
        const validTrialValues: Reason['name'][] = ['prevent-cancellation', 'pc-cloud-25', 'pc-componentes-25'];
       
        try {
          const payload = jwt.verify(trialToken, config.JWT_SECRET) as { trial?: string };
          if (!payload.trial || !validTrialValues.includes(payload.trial as Reason['name'])) {
            throw new Error('Invalid trial token');
          }
          
        } catch {
          return res.status(403).send('Invalid trial token');
        }

        try {
          const subscriptionSetup = await paymentService.createSubscriptionWithTrial(
            {
              customerId,
              priceId,
              currency,
            },
            {
              name: trialToken,
            },
          );

          return res.send(subscriptionSetup);
        } catch (err) {
          const error = err as Error;
          req.log.error(`[ERROR CREATING SUBSCRIPTION WITH TRIAL]: ${error.stack ?? error.message}`);

          if (error instanceof MissingParametersError) {
            return res.status(400).send({
              message: error.message,
            });
          } else if (error instanceof PromoCodeIsNotValidError) {
            return res
              .status(422)
              .send({ message: 'The promotion code is not applicable under the current conditions' });
          } else if (error instanceof ExistingSubscriptionError) {
            return res.status(409).send({
              message: error.message,
            });
          }

          return res.status(500).send({
            message: 'Internal Server Error',
          });
        }
      },
    );

    fastify.get<{
      Querystring: { code: string };
    }>('/trial-for-subscription', async (req, rep) => {
      const { code } = req.query;
      if (!code || code !== process.env.PC_CLOUD_TRIAL_CODE) {
        return rep.status(400).send();
      }

      return jwt.sign({ trial: 'pc-cloud-25' }, config.JWT_SECRET);
    });

    fastify.get('/users/exists', async (req, rep) => {
      await assertUser(req, rep, usersService);

      return rep.status(200).send();
    });

    fastify.get<{
      Querystring: { limit: number; starting_after?: string; userType?: UserType; subscription?: string };
    }>(
      '/invoices',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              limit: { type: 'number', default: 10 },
              starting_after: { type: 'string' },
              userType: { type: 'string', default: UserType.Individual },
              subscription: { type: 'string' },
            },
          },
        },
      },
      async (req, rep) => {
        const { limit, starting_after: startingAfter, userType, subscription: subscriptionId } = req.query;

        const user = await assertUser(req, rep, usersService);

        const userInvoices = await paymentService.getDriveInvoices(
          user.customerId,
          {
            limit,
            startingAfter,
          },
          userType,
          subscriptionId,
        );

        return rep.send(userInvoices);
      },
    );

    fastify.delete<{
      Querystring: { userType?: 'individual' | 'business' };
    }>(
      '/subscriptions',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { userType: { type: 'string', enum: ['individual', 'business'] } },
          },
        },
      },
      async (req, rep) => {
        const user = await assertUser(req, rep, usersService);
        if (req.query.userType === UserType.Business) {
          await usersService.cancelUserB2BSuscriptions(user.customerId);
        } else {
          await usersService.cancelUserIndividualSubscriptions(user.customerId);
        }

        return rep.status(204).send();
      },
    );

    fastify.patch<{ Body: { address?: string; phoneNumber?: string } }>(
      '/billing',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              phoneNumber: { type: 'string' },
            },
          },
        },
      },
      async (req, rep) => {
        const user = await assertUser(req, rep, usersService);
        const { address, phoneNumber } = req.body;
        await paymentService.updateCustomerBillingInfo(user.customerId, {
          address: {
            line1: address,
          },
          phone: phoneNumber,
        });

        return rep.status(204).send();
      },
    );

    fastify.put<{ Body: { price_id: string; couponCode: string; userType?: 'individual' | 'business' } }>(
      '/subscriptions',
      {
        schema: {
          body: {
            type: 'object',
            required: ['price_id'],
            properties: {
              price_id: { type: 'string' },
              couponCode: { type: 'string' },
              userType: { type: 'string', enum: ['individual', 'business'] },
            },
          },
        },
      },
      async (req, rep) => {
        const { price_id: priceId, couponCode } = req.body;
        const userType = (req.body.userType as UserType) || UserType.Individual;

        const user = await assertUser(req, rep, usersService);
        try {
          const userUpdated = await paymentService.updateSubscriptionPrice(
            {
              customerId: user.customerId,
              priceId: priceId,
              couponCode: couponCode,
            },
            userType,
          );

          const updatedSubscription = await paymentService.getUserSubscription(user.customerId, userType);
          return rep.send({
            userSubscription: updatedSubscription,
            request3DSecure: userUpdated.is3DSecureRequired,
            clientSecret: userUpdated.clientSecret,
          });
        } catch (err) {
          if (err instanceof InvalidSeatNumberError || err instanceof IncompatibleSubscriptionTypesError) {
            return rep.status(400).send({ message: err.message });
          }
          throw err;
        }
      },
    );

    fastify.post<{
      Body: { customerId: string };
    }>(
      '/setup-intent',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              trialReason: { type: 'string' },
            },
          },
        },
      },
      async (req, rep) => {
        const { customerId } = req.body;
        const { client_secret: clientSecret } = await paymentService.getSetupIntent(customerId, {
          userType: UserType.Individual,
        });

        return { clientSecret };
      },
    );

    fastify.get<{
      Querystring: { userType?: 'individual' | 'business' };
    }>(
      '/setup-intent',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              userType: { type: 'string', enum: ['individual', 'business'] },
            },
          },
        },
      },
      async (req, rep) => {
        const user = await assertUser(req, rep, usersService);
        const userType = (req.query.userType as UserType) || UserType.Individual;
        const metadata: Stripe.MetadataParam = { userType };
        const { client_secret: clientSecret } = await paymentService.getSetupIntent(user.customerId, metadata);

        return { clientSecret };
      },
    );

    fastify.get<{
      Querystring: {
        customerId: CustomerId;
        amount: number;
        planId: string;
        token: string;
        currency?: string;
        promoCodeName?: string;
      };
      schema: {
        querystring: {
          properties: {
            customerId: { type: 'string' };
            planId: { type: 'string' };
            amount: { type: 'number' };
            token: { type: 'string' };
            currency: { type: 'string' };
            promoCodeName: { type: 'string' };
          };
        };
      };
    }>('/payment-intent', async (req, res) => {
      const { uuid, email } = req.user.payload;
      const { customerId, amount, planId, currency, token, promoCodeName } = req.query;

      try {
        const payload = jwt.verify(token, config.JWT_SECRET) as {
          customerId: string;
        };
        const tokenCustomerId = payload.customerId;

        if (customerId !== tokenCustomerId) {
          return res.status(403).send();
        }
      } catch (error) {
        return res.status(403).send();
      }

      try {
        const { selectedPlan } = await paymentService.getPlanById(planId);
        const { canExpand: isStorageUpgradeAllowed } = await fetchUserStorage(
          uuid,
          email,
          selectedPlan.bytes.toString(),
        );

        if (!isStorageUpgradeAllowed) {
          return res.status(400).send({
            message: "The user can't stack more storage",
          });
        }

        const { clientSecret, id, invoiceStatus } = await paymentService.createPaymentIntent(
          customerId,
          amount,
          planId,
          currency,
          promoCodeName,
        );

        return { clientSecret, id, invoiceStatus };
      } catch (err) {
        const error = err as Error;
        if (error instanceof MissingParametersError) {
          return res.status(404).send({
            message: error.message,
          });
        }

        if (error instanceof PromoCodeIsNotValidError) {
          return res.status(400).send({
            message: error.message,
          });
        }

        req.log.error(`[ERROR WHILE CREATING PAYMENT INTENT]: ${error.stack ?? error.message}`);
        return res.status(500).send({
          message: 'Internal Server Error',
        });
      }
    });

    fastify.get<{
      Querystring: {
        customerId: CustomerId;
        amount: number;
        planId: string;
        token: string;
        currency?: string;
      };
      schema: {
        querystring: {
          type: 'object';
          properties: {
            customerId: { type: 'string' };
            planId: { type: 'string' };
            amount: { type: 'number' };
            token: { type: 'string' };
            currency: { type: 'string' };
          };
        };
      };
      config: {
        rateLimit: {
          max: 5;
          timeWindow: '1 hour';
        };
      };
    }>('/payment-intent-for-object-storage', async (req, res) => {
      const { customerId, amount, planId, currency, token } = req.query;

      try {
        const payload = jwt.verify(token, config.JWT_SECRET) as {
          customerId: string;
        };
        const tokenCustomerId = payload.customerId;

        if (customerId !== tokenCustomerId) {
          return res.status(403).send();
        }
      } catch (error) {
        return res.status(403).send();
      }

      try {
        const { clientSecret } = await paymentService.createPaymentIntent(customerId, amount, planId, currency);

        return { clientSecret };
      } catch (err) {
        const error = err as Error;
        if (error instanceof MissingParametersError) {
          return res.status(404).send({
            message: error.message,
          });
        }
        req.log.error(`[ERROR WHILE CREATING PAYMENT INTENT]: ${error.stack ?? error.message}`);
        return res.status(500).send({
          message: 'Internal Server Error',
        });
      }
    });

    fastify.get<{
      Querystring: { userType?: 'individual' | 'business' };
    }>(
      '/default-payment-method',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { userType: { type: 'string', enum: ['individual', 'business'] } },
          },
        },
      },
      async (req, rep) => {
        const { customerId, lifetime } = await assertUser(req, rep, usersService);
        const userType = (req.query.userType as UserType) || UserType.Individual;
        return paymentService.getDefaultPaymentMethod(customerId, lifetime, userType);
      },
    );

    fastify.get<{
      Querystring: { userType?: 'individual' | 'business' };
    }>(
      '/subscriptions',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { userType: { type: 'string', enum: ['individual', 'business'] } },
          },
        },
      },
      async (req, rep) => {
        let response: UserSubscription;

        const user: User = await assertUser(req, rep, usersService);
        const userType = (req.query.userType as UserType) || UserType.Individual;

        const isLifetimeUser = user.lifetime && userType === UserType.Individual;

        let subscriptionInCache: UserSubscription | null | undefined;
        try {
          subscriptionInCache = await cacheService.getSubscription(user.customerId, userType);
        } catch (err) {
          req.log.error(`Error while trying to retrieve ${user.customerId} subscription from cache`);
          req.log.error(err);
        }

        if (subscriptionInCache) {
          req.log.info(`Cache hit for ${user.customerId} subscription`);
          return subscriptionInCache;
        }

        if (isLifetimeUser) {
          try {
            const userTier = await tiersService.getTiersProductsByUserId(user.id);
            const lifetimePlan = userTier.filter((tier) => tier.billingType === 'lifetime');

            response = { type: 'lifetime', productId: lifetimePlan[0].productId };
          } catch (error) {
            if (!(error instanceof TierNotFoundError)) {
              throw error;
            }

            response = { type: 'lifetime' };
          }
        } else {
          response = await paymentService.getUserSubscription(user.customerId, userType);
        }

        cacheService.setSubscription(user.customerId, userType, response).catch((err) => {
          req.log.error(`Error while trying to set subscription cache for ${user.customerId}`);
          req.log.error(err);
        });

        return response;
      },
    );

    function checkCurrency(currency?: string): { currencyValue: string; isError: boolean; errorMessage?: string } {
      let currencyValue: string;

      if (!currency) {
        currencyValue = 'eur';
      } else {
        const validatedCurrency = allowedCurrency.includes(currency.toLowerCase());
        if (!validatedCurrency) {
          return { currencyValue: '', isError: true, errorMessage: 'Bad request' };
        } else {
          currencyValue = currency.toLowerCase();
        }
      }

      return { currencyValue, isError: false };
    }

    fastify.get<{
      Querystring: { currency?: string; userType?: 'individual' | 'business' };
      schema: {
        querystring: {
          type: 'object';
          properties: {
            currency: { type: 'string' };
            userType: { type: 'string'; enum: ['individual', 'business'] };
          };
        };
      };
    }>('/prices', async (req, rep) => {
      const { currency } = req.query;
      const userType = (req.query.userType as UserType) || UserType.Individual;

      const { currencyValue, isError, errorMessage } = checkCurrency(currency);

      if (isError) {
        return rep.status(400).send({ message: errorMessage });
      }

      return paymentService.getPrices(currencyValue, userType);
    });

    fastify.get('/request-prevent-cancellation', async (req) => {
      const { uuid } = req.user.payload;
      try {
        const user = await usersService.findUserByUuid(uuid);

        return paymentService.isUserElegibleForTrial(user, {
          name: 'prevent-cancellation',
        });
      } catch (err) {
        const error = err as Error;
        req.log.error(
          `[REQUEST-PREVENT-CANCELLATION/ERROR]: Error for user ${uuid} ${error.message}. ${error.stack || 'NO STACK'}`,
        );
        throw err;
      }
    });

    fastify.put('/prevent-cancellation', async (req, rep) => {
      const { uuid } = req.user.payload;
      const user = await usersService.findUserByUuid(uuid);

      try {
        await paymentService.applyFreeTrialToUser(user, {
          name: 'prevent-cancellation',
        });
        return rep.status(200).send({ message: 'Coupon applied' });
      } catch (err) {
        if (err instanceof CouponCodeError) {
          return rep.status(403).send({ message: err.message });
        } else {
          req.log.error(err);
          return rep.status(500).send({ message: 'Internal server error' });
        }
      }
    });

    fastify.get<{
      Querystring: { planId: string; currency?: string };
      schema: {
        querystring: {
          type: 'object';
          properties: { planId: { type: 'string' }; currency: { type: 'string' } };
        };
      };
      config: {
        rateLimit: {
          max: 5;
          timeWindow: '1 minute';
        };
      };
    }>('/plan-by-id', async (req, rep) => {
      const { planId, currency } = req.query;

      try {
        const planObject = await paymentService.getPlanById(planId, currency);

        return rep.status(200).send(planObject);
      } catch (error) {
        const err = error as Error;
        if (err instanceof NotFoundPlanByIdError) {
          return rep.status(404).send(err.message);
        }

        req.log.error(`[ERROR WHILE FETCHING PLAN BY ID]: ${err.message}. STACK ${err.stack ?? 'NO STACK'}`);
        return rep.status(500).send({ message: 'Internal Server Error' });
      }
    });

    fastify.get<{
      Querystring: { priceId: string; promotionCode: string };
      schema: {
        querystring: {
          type: 'object';
          properties: { priceId: { type: 'string' }; promotionCode: { type: 'string' } };
        };
      };
      config: {
        rateLimit: {
          max: 5;
          timeWindow: '1 minute';
        };
      };
    }>('/promo-code-by-name', async (req, rep) => {
      const { priceId, promotionCode } = req.query;

      try {
        const promoCodeObject = await paymentService.getPromotionCodeByName(priceId, promotionCode);

        return rep.status(200).send(promoCodeObject);
      } catch (error) {
        const err = error as Error;
        if (err instanceof NotFoundPromoCodeByNameError) {
          return rep.status(404).send(err.message);
        }

        if (err instanceof MissingParametersError || err instanceof PromoCodeIsNotValidError) {
          return rep.status(400).send(err.message);
        }

        req.log.error(`[ERROR WHILE FETCHING PROMO CODE BY NAME]: ${err.message}. STACK ${err.stack ?? 'NO STACK'}`);
        return rep.status(500).send({ message: 'Internal Server Error' });
      }
    });

    fastify.get<{
      Querystring: { planId: string; currency?: string };
      schema: {
        querystring: {
          type: 'object';
          properties: { planId: { type: 'string' }; currency: { type: 'string' } };
        };
      };
      config: {
        rateLimit: {
          max: 5;
          timeWindow: '1 minute';
        };
      };
    }>('/object-storage-plan-by-id', async (req, rep) => {
      const { planId, currency } = req.query;

      try {
        const planObject = await paymentService.getObjectStoragePlanById(planId, currency);

        return rep.status(200).send(planObject);
      } catch (error) {
        const err = error as Error;
        if (err instanceof NotFoundPlanByIdError) {
          return rep.status(404).send({ message: err.message });
        }

        req.log.error(`[ERROR WHILE FETCHING PLAN BY ID]: ${err.message}. STACK ${err.stack ?? 'NO STACK'}`);
        return rep.status(500).send({ message: 'Internal Server Error' });
      }
    });

    fastify.get<{
      Querystring: { promotionCode: string };
      schema: {
        querystring: {
          type: 'object';
          properties: { promotionCode: { type: 'string' } };
        };
      };
      config: {
        rateLimit: {
          max: 5;
          timeWindow: '1 minute';
        };
      };
    }>('/promo-code-info', async (req, rep) => {
      const { promotionCode } = req.query;

      try {
        const promoCode = await paymentService.getPromotionCodeObject(promotionCode);

        const promoCodeObj = {
          promoCodeName: promotionCode,
          codeId: promoCode.id,
          amountOff: promoCode.coupon.amount_off,
          percentOff: promoCode.coupon.percent_off,
        };

        return rep.status(200).send(promoCodeObj);
      } catch (error) {
        const err = error as Error;
        if (err instanceof NotFoundPromoCodeByNameError || err instanceof PromoCodeIsNotValidError) {
          return rep.status(404).send(err.message);
        }

        if (err instanceof MissingParametersError) {
          return rep.status(400).send(err.message);
        }

        req.log.error(`[ERROR WHILE FETCHING PROMO CODE BY NAME]: ${err.message}. STACK ${err.stack ?? 'NO STACK'}`);
        return rep.status(500).send({ message: 'Internal Server Error' });
      }
    });

    fastify.post<{
      Body: {
        price_id: string;
        success_url: string;
        coupon_code: string;
        cancel_url: string;
        customer_email: string;
        trial_days?: number;
        mode?: string;
        currency?: string;
        seats?: number;
      };
    }>(
      '/checkout-session',
      {
        schema: {
          body: {
            type: 'object',
            required: ['price_id', 'success_url', 'cancel_url', 'customer_email'],
            properties: {
              mode: { type: 'string' },
              price_id: { type: 'string' },
              seats: { type: 'number' },
              trial_days: { type: 'number' },
              coupon_code: { type: 'string' },
              success_url: { type: 'string' },
              cancel_url: { type: 'string' },
              customer_email: { type: 'string' },
              currency: { type: 'string' },
            },
          },
        },
      },
      async (req, rep) => {
        const { uuid } = req.user.payload;
        const { price_id, success_url, cancel_url, customer_email, trial_days, mode, coupon_code, currency, seats } =
          req.body;

        const { currencyValue, isError, errorMessage } = checkCurrency(currency);

        if (isError) {
          return rep.status(400).send({ message: errorMessage });
        }

        let user: User | undefined;

        try {
          user = await usersService.findUserByUuid(uuid);
        } catch (err) {
          req.log.info(`User with uuid ${uuid} not found in DB`);
        }

        try {
          const { id } = await paymentService.getCheckoutSession({
            priceId: price_id,
            successUrl: success_url,
            cancelUrl: cancel_url,
            customerId: user?.customerId,
            prefill: user ?? customer_email,
            mode: (mode as Stripe.Checkout.SessionCreateParams.Mode) || 'subscription',
            trialDays: trial_days,
            couponCode: coupon_code,
            currency: currencyValue,
            seats,
          });

          return { sessionId: id };
        } catch (err) {
          if (err instanceof ExistingSubscriptionError) {
            return rep.status(400).send({ message: err.message });
          }
        }
      },
    );

    fastify.get<{ Querystring: { code: string; provider: string } }>(
      '/is-unique-code-available',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { code: { type: 'string' }, provider: { type: 'string' } },
          },
        },
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
        },
      },
      async (req, res) => {
        const { code, provider } = req.query;
        try {
          await licenseCodesService.isLicenseCodeAvailable(code, provider);
          return res.status(200).send({ message: 'Code is available' });
        } catch (error) {
          const err = error as Error;
          if (err instanceof LicenseCodeAlreadyAppliedError || err instanceof InvalidLicenseCodeError) {
            return res.status(404).send({ message: err.message });
          }

          req.log.error(`[LICENSE/CHECK/ERROR]: ${err.message}. STACK ${err.stack || 'NO STACK'}`);
          return res.status(500).send({ message: 'Internal Server Error' });
        }
      },
    );

    fastify.post<{
      Body: {
        code: string;
        provider: string;
      };
    }>(
      '/licenses',
      {
        schema: {
          body: {
            type: 'object',
            required: ['code', 'provider'],
            properties: {
              code: { type: 'string' },
              provider: { type: 'string' },
            },
          },
        },
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
        },
      },
      async (req, rep) => {
        const { email, uuid, name, lastname } = req.user.payload;
        const { code, provider } = req.body;

        try {
          await licenseCodesService.redeem({ email, uuid, name: `${name} ${lastname}` }, code, provider);

          return rep.status(200).send({ message: 'Code redeemed' });
        } catch (error) {
          const err = error as Error;

          if (err instanceof InvalidLicenseCodeError) {
            return rep.status(400).send({ message: err.message });
          }

          if (err instanceof LicenseCodeAlreadyAppliedError) {
            return rep.status(403).send({ message: err.message });
          }

          req.log.error(`[LICENSE/REDEEM/ERROR]: ${err.message}. STACK ${err.stack || 'NO STACK'}`);
          return rep.status(500).send({ message: 'Internal Server Error' });
        }
      },
    );

    fastify.get('/display-billing', async (req, rep) => {
      try {
        const display = await usersService.getDisplayBilling();

        return rep.status(200).send(display);
      } catch (error) {
        const err = error as Error;

        req.log.error(`[DISPLAY-BILLING]: ${err.message}. STACK ${err.stack || 'NO STACK'}`);

        return rep.status(500).send({ message: 'Internal Server Error' });
      }
    });

    fastify.get<{ Querystring: { code: Coupon['code'] | Stripe.PromotionCode['code'] } }>(
      '/coupon-in-use',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { code: { type: 'string' } },
          },
        },
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
        },
      },
      async (req, rep) => {
        const { code } = req.query;
        const { uuid } = req.user.payload;
        const user = await usersService.findUserByUuid(uuid);

        if (!code) {
          return rep.status(400).send({ message: 'Bad Request' });
        }

        try {
          let isBeingUsed = await usersService.isCouponBeingUsedByUser(user, code);

          if (!isBeingUsed) {
            const stripePromotionCode = await paymentService.getPromotionCodeObject(code);

            if (stripePromotionCode) {
              isBeingUsed = await usersService.isCouponBeingUsedByUser(user, stripePromotionCode.coupon.id);
            }
          }

          return rep.status(200).send({ couponUsed: isBeingUsed });
        } catch (error) {
          const err = error as Error;
          if (
            err instanceof LicenseCodeAlreadyAppliedError ||
            err instanceof InvalidLicenseCodeError ||
            err instanceof NotFoundPromoCodeByNameError
          ) {
            return rep.status(404).send({ message: err.message });
          }

          req.log.error(`[LICENSE/CHECK/ERROR]: ${err.message}. STACK ${err.stack ?? 'NO STACK'}`);
          return rep.status(500).send({ message: 'Internal Server Error' });
        }
      },
    );

    fastify.get('/currencies', () => paymentService.getCryptoCurrencies());
  };
}
