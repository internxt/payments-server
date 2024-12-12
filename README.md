# Payments

[![node](https://img.shields.io/badge/node-20-iron)](https://nodejs.org/download/release/latest-iron/)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=coverage)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=internxt_payments-server&metric=bugs)](https://sonarcloud.io/summary/new_code?id=internxt_payments-server)

## Get started

### Requirements

- Node v22.12.0 or newest
- [Stripe CLI](https://docs.stripe.com/stripe-cli#install)

#### Setting up the project

- Install dependencies: `yarn`
- Prepare the environment: Rename `.env.template` to `.env` and fill the empty variables
- Go to '.env' and set STRIPE_SECRET_KEY as the value you can find on Stripe Dashboard in dev mode (Search Bar > Api Keys > Secret Key)
- Mount the infrastructure: `cd infrastructure && docker-compose up` or if you are using the latest docker version: `cd infrastructure && docker compose up`
- Redirect webhooks to your local server: `stripe listen --forward-to localhost:8003/webhook`
- Start the project: `yarn run dev`

#### Good to know

- If you go to `localhost:8082` you'll see a GUI to inspect the mongodb instance
- Install prettier & eslint vscode extensions for a better dev experience.
