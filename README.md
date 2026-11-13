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

#### Nice to know

- If you go to `localhost:8082` you'll see a GUI to inspect the mongodb instance
- Install prettier & eslint vscode extensions for a better dev experience.

## Versioning and releases

Versions are managed by [release-please](https://github.com/googleapis/release-please). You don't bump `package.json` by hand.

- Every merge to `master` with at least one `feat`, `fix`, `refactor`, `perf` or `revert` commit opens or updates a single **release PR**. That PR bumps the version in `package.json` and adds the changes to `CHANGELOG.md`. Merges with only hidden types (see the table below) don't touch it.
- Several merged PRs accumulate in that same release PR. The version only changes when you merge it.
- Merging the release PR creates the `vX.Y.Z` tag and the GitHub Release. Like any push to `master`, it also runs the usual tests and a regular deploy of the same code; it only updates the version and changelog.
- The release PR is approved and merged like any other PR. CI checks don't run on the PR itself, because it's created with `GITHUB_TOKEN`.

The next version is calculated from the [Conventional Commits](https://www.conventionalcommits.org/) merged since the last release, taking the biggest bump found:

| Commit type                                                    | Bump       |
| -------------------------------------------------------------- | ---------- |
| `feat!:`, `fix!:`, `refactor!:` or a `BREAKING CHANGE:` footer | major      |
| `feat`                                                         | minor      |
| `fix`, `refactor`, `perf`, `revert`                            | patch      |
| `chore`, `ci`, `build`, `docs`, `test`, `style`                | no release |

To force a specific version, add a `Release-As: X.Y.Z` footer to a commit.

Configuration: `release-please-config.json`, `.release-please-manifest.json` and `.github/workflows/release-please.yml`.
