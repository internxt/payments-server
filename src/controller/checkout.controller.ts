import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';

import { UsersService } from '../services/users.service';
import { PaymentService } from '../services/payment.service';
import CacheService from '../services/cache.service';
import { User } from '../core/users/User';
import { PaymentIntent } from '../types/payment';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../errors/Errors';
import {
  AccountSetupPendingError,
  InvalidConfirmationTokenError,
  MissingParametersError,
} from '../errors/PaymentErrors';
import config from '../config';
import { fetchUserStorage } from '../utils/fetchUserStorage';
import { getAllowedCurrencies, isCryptoCurrency, isValidCurrency } from '../utils/currency';
import { signUserToken } from '../utils/signUserToken';
import { verifyRecaptcha } from '../utils/verifyRecaptcha';
import { setupAuth } from '../plugins/auth';
import { stripePaymentsAdapter } from '../infrastructure/adapters/stripe.adapter';
import { CreateCustomerParams } from '../infrastructure/domain/entities/customer';
import Logger from '../Logger';

export function checkoutController(
  usersService: UsersService,
  paymentsService: PaymentService,
  cacheService: CacheService,
) {
  async function upsertCustomerForUser(
    uuid: User['uuid'],
    email: string,
    customerDetails: Partial<CreateCustomerParams>,
  ): Promise<Stripe.Customer['id']> {
    const userExists = await usersService.findUserByUuid(uuid).catch(() => null);

    if (userExists) {
      await stripePaymentsAdapter.updateCustomer(userExists.customerId, { ...customerDetails, email });
      return userExists.customerId;
    }

    const { id } = await stripePaymentsAdapter.createCustomer({ ...customerDetails, email });
    await usersService.insertUser({ customerId: id, uuid, lifetime: false });

    return id;
  }

  async function claimConfirmationToken(confirmationTokenId: string): Promise<void> {
    const confirmationToken = await stripePaymentsAdapter.getConfirmationToken(confirmationTokenId);
    if (!confirmationToken.canStartPaymentAttempt()) {
      throw new InvalidConfirmationTokenError();
    }

    const isFirstUse = await cacheService.markConfirmationTokenAsUsed(confirmationToken.id);
    if (!isFirstUse) {
      throw new InvalidConfirmationTokenError();
    }
  }

  async function preCreateBuyerWithoutAccount(email: string): Promise<User['uuid']> {
    const { uuid, setupPending } = await usersService.preCreateUser(email);

    if (setupPending) {
      throw new AccountSetupPendingError();
    }

    return uuid;
  }

  async function upsertCustomerForPaymentAttempt(
    email: string,
    confirmationTokenId: string,
    customerDetails: Partial<CreateCustomerParams>,
  ): Promise<Stripe.Customer['id']> {
    await claimConfirmationToken(confirmationTokenId);

    const uuid = await preCreateBuyerWithoutAccount(email);

    return upsertCustomerForUser(uuid, email, {
      ...customerDetails,
      metadata: { ...customerDetails.metadata, new_user_id: uuid },
    });
  }

  async function getEmailOfBuyerWithoutAccount(customerId: Stripe.Customer['id'], currency: string): Promise<string> {
    if (isCryptoCurrency(currency)) {
      throw new UnauthorizedError('Crypto payments require a logged in user');
    }

    const { email } = await stripePaymentsAdapter.getCustomer(customerId);

    await preCreateBuyerWithoutAccount(email);

    return email;
  }

  return async function (fastify: FastifyInstance) {
    await setupAuth(fastify, { secret: config.JWT_SECRET });

    fastify.post<{
      Body: {
        customerName?: string;
        lineAddress1?: string;
        lineAddress2?: string;
        city?: string;
        country: string;
        postalCode?: string;
        captchaToken: string;
        companyVatId?: string;
        metadata?: Record<string, string>;
        email?: string;
        confirmationTokenId?: string;
      };
    }>(
      '/customer',
      {
        schema: {
          body: {
            type: 'object',
            required: ['country', 'captchaToken'],
            properties: {
              customerName: { type: 'string' },
              lineAddress1: { type: 'string' },
              lineAddress2: { type: 'string' },
              city: { type: 'string' },
              country: { type: 'string' },
              postalCode: { type: 'string' },
              captchaToken: { type: 'string' },
              companyVatId: { type: 'string' },
              metadata: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
              email: { type: 'string', format: 'email' },
              confirmationTokenId: { type: 'string' },
            },
          },
        },
        config: {
          allowAnonymous: true,
          rateLimit: {
            max: 5,
            timeWindow: '1 hour',
          },
        },
      },
      async (req, res): Promise<{ customerId: string; token: string }> => {
        let customerId: Stripe.Customer['id'];
        const {
          customerName,
          lineAddress1,
          lineAddress2,
          city,
          country,
          postalCode,
          companyVatId,
          captchaToken,
          metadata,
          email: anonymousEmail,
          confirmationTokenId,
        } = req.body;
        const driveUser = req.user?.payload;

        const verifiedCaptcha = await verifyRecaptcha(captchaToken);

        if (!verifiedCaptcha) {
          throw new ForbiddenError('Token verification failed');
        }

        const customerDetails = {
          name: customerName,
          address: {
            line1: lineAddress1,
            line2: lineAddress2,
            city,
            postalCode,
            country,
          },
          metadata,
        };

        if (driveUser) {
          customerId = await upsertCustomerForUser(driveUser.uuid, driveUser.email, customerDetails);
        } else {
          if (!anonymousEmail || !confirmationTokenId) {
            throw new MissingParametersError(['email', 'confirmationTokenId']);
          }
          customerId = await upsertCustomerForPaymentAttempt(
            anonymousEmail.toLowerCase(),
            confirmationTokenId,
            customerDetails,
          );
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
            },
          },
        },
        config: {
          allowAnonymous: true,
        },
      },
      async (req, res) => {
        const { customerId, priceId, currency, promoCodeId, captchaToken, token } = req.body;
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

        const price = await stripePaymentsAdapter.getPriceById(priceId);

        if (price.isBusinessPlan()) throw new BadRequestError('Business plan is no longer available');

        const shouldCalculateTaxes = await stripePaymentsAdapter.shouldCalculateTaxForCustomer(customerId);

        const subscriptionAttempt = await paymentsService.createSubscription({
          customerId,
          priceId,
          currency,
          promoCodeId,
          additionalOptions: {
            automatic_tax: {
              enabled: shouldCalculateTaxes,
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
        userAddress: string;
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
              userAddress: { type: 'string' },
              promoCodeId: {
                type: 'string',
              },
            },
          },
        },
        config: {
          allowAnonymous: true,
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
        },
      },
      async (req, res): Promise<PaymentIntent> => {
        let tokenCustomerId: string;
        let email: string;
        const driveUser = req.user?.payload;
        const { customerId, priceId, token, currency, userAddress, captchaToken, promoCodeId } = req.body;

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

        const price = await stripePaymentsAdapter.getPriceById(priceId);

        if (price.interval !== 'lifetime') {
          throw new BadRequestError('Only lifetime plans are supported');
        }

        if (driveUser) {
          email = driveUser.email;
          const { canExpand: isStorageUpgradeAllowed } = await fetchUserStorage(
            driveUser.uuid,
            email,
            price.bytes.toString(),
          );

          if (!isStorageUpgradeAllowed) {
            throw new BadRequestError('The user already has the maximum storage allowed');
          }
        } else {
          email = await getEmailOfBuyerWithoutAccount(customerId, currency);
        }

        const shouldCalculateTaxes = await stripePaymentsAdapter.shouldCalculateTaxForCustomer(customerId);

        const result = await paymentsService.createInvoice({
          customerId,
          priceId,
          userEmail: email,
          currency: currency.trim(),
          promoCodeId,
          userAddress,
          additionalInvoiceOptions: {
            automatic_tax: {
              enabled: shouldCalculateTaxes,
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

        const price = await stripePaymentsAdapter.getPriceById(priceId, currency);

        const isUserAddressProvided = !!userAddress || (!!postalCode && !!country) || !!user?.customerId;
        const isCountryAllowedForTaxes = stripePaymentsAdapter.shouldCalculateTax(country);
        const shouldCalculateTaxes = isUserAddressProvided && isCountryAllowedForTaxes;

        let amount = price.amount;

        if (promoCodeName) {
          const couponCode = await paymentsService.getPromoCodeByName(price.productId, promoCodeName);
          if (couponCode.amountOff) {
            amount = Math.max(0, price.amount - couponCode.amountOff);
          } else if (couponCode.percentOff) {
            const discount = Math.floor((price.amount * couponCode.percentOff) / 100);
            const discountedPrice = price.amount - discount;
            amount = Math.max(0, discountedPrice);
          }
        }

        if (shouldCalculateTaxes) {
          Logger.info(
            `[GET PRICE BY ID] Calculating taxes for user with customer ID: ${user?.customerId} and uuid: ${userUuid} with country: ${country}`,
          );
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
        const amountTotal = taxForPrice?.amount_total ?? amount;

        return res.status(200).send({
          price: price.toJSON(),
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
