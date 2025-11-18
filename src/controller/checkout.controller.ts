import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';

import { UsersService } from '../services/users.service';
import { PaymentIntent, PaymentService } from '../services/payment.service';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../errors/Errors';
import config from '../config';
import { fetchUserStorage } from '../utils/fetchUserStorage';
import { getAllowedCurrencies, isValidCurrency } from '../utils/currency';
import { signUserToken } from '../utils/signUserToken';
import { verifyRecaptcha } from '../utils/verifyRecaptcha';

export default function (usersService: UsersService, paymentsService: PaymentService) {
  return async function (fastify: FastifyInstance) {
    fastify.register(fastifyJwt, { secret: config.JWT_SECRET });
    fastify.register(fastifyRateLimit, {
      max: 1000,
      timeWindow: '1 minute',
    });

    fastify.addHook('onRequest', async (request) => {
      const skipAuth = request.routeOptions?.config?.skipAuth;
      const allowAnonymous = request.routeOptions?.config?.allowAnonymous;

      if (skipAuth) {
        return;
      }

      try {
        await request.jwtVerify();
      } catch (err) {
        if (allowAnonymous) {
          return;
        }
        request.log.warn(`JWT verification failed with error: ${(err as Error).message}`);
        throw new UnauthorizedError();
      }
    });

    /**
     * @deprecated This Endpoint has been deprecated, use `POST /customer` instead
     */
    fastify.get<{
      Querystring: {
        customerName: string;
        country: string;
        postalCode: string;
        captchaToken: string;
        companyVatId?: string;
      };
    }>(
      '/customer',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              customerName: { type: 'string' },
              country: { type: 'string' },
              postalCode: { type: 'string' },
              captchaToken: { type: 'string' },
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
      async (req, res): Promise<{ customerId: string; token: string }> => {
        let customerId: Stripe.Customer['id'];
        const { customerName, country, postalCode, companyVatId, captchaToken } = req.query;
        const { uuid: userUuid, email } = req.user.payload;

        const verifiedCaptcha = await verifyRecaptcha(captchaToken);

        if (!verifiedCaptcha) {
          throw new ForbiddenError('Token verification failed');
        }

        const userExists = await usersService.findUserByUuid(userUuid).catch(() => null);

        if (userExists) {
          await paymentsService.updateCustomer(
            userExists.customerId,
            {
              customer: {
                name: customerName,
              },
            },
            {
              address: {
                postal_code: postalCode,
                country,
              },
            },
          );
          customerId = userExists.customerId;
        } else {
          const { id } = await paymentsService.createCustomer({
            name: customerName,
            email,
            address: {
              country,
              postal_code: postalCode,
            },
          });
          await usersService.insertUser({
            customerId: id,
            uuid: userUuid,
            lifetime: false,
          });

          customerId = id;
        }

        if (country && companyVatId) {
          await paymentsService.getVatIdAndAttachTaxIdToCustomer(customerId, country, companyVatId);
        }

        return res.send({ customerId, token: signUserToken({ customerId }) });
      },
    );

    fastify.post<{
      Body: {
        customerName: string;
        lineAddress1: string;
        lineAddress2: string;
        city: string;
        country: string;
        postalCode: string;
        captchaToken: string;
        companyVatId?: string;
      };
    }>(
      '/customer',
      {
        schema: {
          body: {
            type: 'object',
            required: ['customerName', 'lineAddress1', 'city', 'country', 'postalCode', 'captchaToken'],
            properties: {
              customerName: { type: 'string' },
              lineAddress1: { type: 'string' },
              lineAddress2: { type: 'string' },
              city: { type: 'string' },
              country: { type: 'string' },
              postalCode: { type: 'string' },
              captchaToken: { type: 'string' },
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
      async (req, res): Promise<{ customerId: string; token: string }> => {
        let customerId: Stripe.Customer['id'];
        const { customerName, lineAddress1, lineAddress2, city, country, postalCode, companyVatId, captchaToken } =
          req.body;
        const { uuid: userUuid, email } = req.user.payload;

        const verifiedCaptcha = await verifyRecaptcha(captchaToken);

        if (!verifiedCaptcha) {
          throw new ForbiddenError('Token verification failed');
        }

        const userExists = await usersService.findUserByUuid(userUuid).catch(() => null);

        if (userExists) {
          await paymentsService.updateCustomer(
            userExists.customerId,
            {
              customer: {
                name: customerName,
              },
            },
            {
              email,
              address: {
                line1: lineAddress1,
                line2: lineAddress2,
                city,
                postal_code: postalCode,
                country,
              },
            },
          );
          customerId = userExists.customerId;
        } else {
          const { id } = await paymentsService.createCustomer({
            name: customerName,
            email,
            address: {
              line1: lineAddress1,
              line2: lineAddress2,
              city,
              postal_code: postalCode,
              country,
            },
          });
          await usersService.insertUser({
            customerId: id,
            uuid: userUuid,
            lifetime: false,
          });

          customerId = id;
        }

        if (country && companyVatId) {
          await paymentsService.getVatIdAndAttachTaxIdToCustomer(customerId, country, companyVatId);
        }

        return res.send({ customerId, token: signUserToken({ customerId }) });
      },
    );

    fastify.post<{
      Body: {
        customerId: string;
        priceId: string;
        token: string;
        captchaToken: string;
        currency?: string;
        promoCodeId?: string;
        quantity?: number;
      };
    }>(
      '/subscription',
      {
        schema: {
          body: {
            type: 'object',
            required: ['customerId', 'priceId', 'token', 'captchaToken'],
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
              captchaToken: { type: 'string' },
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
        const { customerId, priceId, currency, promoCodeId, quantity, captchaToken, token } = req.body;
        let tokenCustomerId;

        const verifiedCaptcha = await verifyRecaptcha(captchaToken);

        if (!verifiedCaptcha) {
          throw new ForbiddenError('Token verification failed');
        }

        try {
          const { customerId } = jwt.verify(token, config.JWT_SECRET) as {
            customerId: string;
          };
          tokenCustomerId = customerId;
        } catch {
          throw new ForbiddenError();
        }

        if (customerId !== tokenCustomerId) {
          throw new ForbiddenError();
        }

        const subscriptionAttempt = await paymentsService.createSubscription({
          customerId,
          priceId,
          currency,
          seatsForBusinessSubscription: quantity ?? 1,
          promoCodeId,
          additionalOptions: {
            automatic_tax: {
              enabled: true,
            },
          },
        });

        return res.status(200).send(subscriptionAttempt);
      },
    );

    fastify.post<{
      Body: {
        customerId: string;
        priceId: string;
        token: string;
        currency: string;
        captchaToken: string;
        promoCodeId?: string;
      };
    }>(
      '/payment-intent',
      {
        schema: {
          body: {
            type: 'object',
            required: ['customerId', 'priceId', 'token', 'currency', 'captchaToken'],
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
              captchaToken: { type: 'string' },
              promoCodeId: {
                type: 'string',
              },
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
      async (req, res): Promise<PaymentIntent> => {
        let tokenCustomerId: string;
        const { uuid, email } = req.user.payload;
        const { customerId, priceId, token, currency, captchaToken, promoCodeId } = req.body;

        const verifiedCaptcha = await verifyRecaptcha(captchaToken);

        if (!verifiedCaptcha) {
          throw new ForbiddenError('Token verification failed');
        }

        if (!isValidCurrency(currency)) {
          const allowedCurrencies = getAllowedCurrencies().join(', ');
          throw new BadRequestError(
            'Invalid currency. The currency must be one of the following: ' + allowedCurrencies,
          );
        }

        try {
          const { customerId } = jwt.verify(token, config.JWT_SECRET) as {
            customerId: string;
          };
          tokenCustomerId = customerId;
        } catch {
          throw new ForbiddenError();
        }

        if (customerId !== tokenCustomerId) {
          throw new ForbiddenError();
        }

        const price = await paymentsService.getPriceById(priceId);

        if (price.interval !== 'lifetime') {
          throw new BadRequestError('Only lifetime plans are supported');
        }

        const { canExpand: isStorageUpgradeAllowed } = await fetchUserStorage(uuid, email, price.bytes.toString());

        if (!isStorageUpgradeAllowed) {
          throw new BadRequestError('The user already has the maximum storage allowed');
        }

        const result = await paymentsService.createInvoice({
          customerId,
          priceId,
          userEmail: email,
          currency: currency.trim(),
          promoCodeId,
          additionalInvoiceOptions: {
            automatic_tax: {
              enabled: true,
            },
          },
        });

        return res.status(200).send(result);
      },
    );

    fastify.get<{
      Querystring: {
        priceId: string;
        currency?: string;
        userAddress?: string;
        promoCodeName?: string;
        postalCode?: string;
        country?: string;
      };
    }>(
      '/price-by-id',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['priceId'],
            properties: {
              priceId: { type: 'string', description: 'Price ID to fetch' },
              currency: { type: 'string', description: 'Optional currency for the price', default: 'eur' },
              userAddress: { type: 'string', description: 'The address of the user' },
              promoCodeName: {
                type: 'string',
                description: 'Optional coupon code name to apply to the price',
              },
              postalCode: {
                type: 'string',
                description: 'Optional postal code for tax calculation',
              },
              country: {
                type: 'string',
                description: 'Optional country for tax calculation',
              },
            },
          },
        },
        config: {
          allowAnonymous: true,
        },
      },
      async (req, res) => {
        let taxForPrice;
        const { priceId, currency, userAddress, promoCodeName, postalCode, country } = req.query;

        const userUuid = req.user?.payload?.uuid;
        const user = await usersService.findUserByUuid(userUuid).catch(() => null);

        const price = await paymentsService.getPriceById(priceId, currency);
        let amount = price.amount;

        if (promoCodeName) {
          const couponCode = await paymentsService.getPromoCodeByName(price.product, promoCodeName);
          if (couponCode.amountOff) {
            amount = price.amount - couponCode.amountOff;
          } else if (couponCode.percentOff) {
            const discount = Math.floor((price.amount * couponCode.percentOff) / 100);
            const discountedPrice = price.amount - discount;
            amount = discountedPrice;
          }
        }

        if (userAddress || (postalCode && country) || user?.customerId) {
          taxForPrice = await paymentsService.calculateTax(
            priceId,
            amount,
            userAddress,
            currency,
            user?.customerId,
            postalCode,
            country,
          );
        }

        const taxAmount = taxForPrice?.tax_amount_exclusive ?? 0;
        const amountTotal = taxForPrice?.amount_total ?? price.amount;

        return res.status(200).send({
          price,
          taxes: {
            tax: taxAmount,
            decimalTax: taxAmount / 100,
            amountWithTax: amountTotal,
            decimalAmountWithTax: amountTotal / 100,
          },
        });
      },
    );

    fastify.get(
      '/crypto/currencies',
      {
        config: {
          skipAuth: true,
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
        },
      },
      async (req, res) => {
        const cryptoCurrencies = await paymentsService.getCryptoCurrencies();
        return res.status(200).send(cryptoCurrencies);
      },
    );

    fastify.post<{
      Body: {
        token: string;
      };
    }>(
      '/crypto/verify/payment',
      {
        schema: {
          body: {
            type: 'object',
            required: ['token'],
            properties: {
              token: {
                type: 'string',
                description: 'The user token generated when creating the payment intent that contains the invoice id',
              },
            },
          },
        },
        config: {
          rateLimit: {
            max: 3,
            timeWindow: '1 minute',
          },
        },
      },
      async (req, res) => {
        let decodedInvoiceId: string;
        const { token } = req.body;

        try {
          const { invoiceId } = jwt.verify(token, config.JWT_SECRET) as {
            invoiceId: string;
          };
          decodedInvoiceId = invoiceId;
        } catch {
          throw new ForbiddenError();
        }

        const result = await paymentsService.verifyCryptoPayment(decodedInvoiceId);
        return res.status(200).send(result);
      },
    );
  };
}
