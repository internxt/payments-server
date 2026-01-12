/**
 * Stripe Fixtures Generator
 *
 * Generates TypeScript fixtures from Stripe's official OpenAPI specification.
 * The script automatically detects the installed Stripe SDK version and fetches
 * the corresponding OpenAPI fixtures to ensure compatibility.
 *
 * Usage:
 *   npm run generate:stripe-fixtures
 *   npm run generate:stripe-fixtures -- --version v1505
 *
 * How it works:
 * 1. Reads the installed stripe SDK version from node_modules
 * 2. Fetches the OPENAPI_VERSION from the stripe-node repo for that SDK version
 * 3. Downloads fixtures3.json from the stripe/openapi repo at that version
 * 4. Generates TypeScript file with typed base objects
 */

import fs from 'node:fs';
import path from 'node:path';

const STRIPE_NODE_OPENAPI_VERSION_URL = (sdkVersion: string) =>
  `https://raw.githubusercontent.com/stripe/stripe-node/v${sdkVersion}/OPENAPI_VERSION`;

const STRIPE_OPENAPI_FIXTURES_URL = (openapiVersion: string) =>
  `https://raw.githubusercontent.com/stripe/openapi/${openapiVersion}/openapi/fixtures3.json`;

const RESOURCES_TO_GENERATE = [
  'customer',
  'invoice',
  'subscription',
  'price',
  'product',
  'payment_intent',
  'payment_method',
  'charge',
  'coupon',
  'promotion_code',
  'dispute',
  'tax.calculation',
] as const;

type ResourceName = (typeof RESOURCES_TO_GENERATE)[number];

const STRIPE_TYPE_MAPPING: Record<ResourceName, string> = {
  customer: 'Stripe.Customer',
  invoice: 'Stripe.Invoice',
  subscription: 'Stripe.Subscription',
  price: 'Stripe.Price',
  product: 'Stripe.Product',
  payment_intent: 'Stripe.PaymentIntent',
  payment_method: 'Stripe.PaymentMethod',
  charge: 'Stripe.Charge',
  coupon: 'Stripe.Coupon',
  promotion_code: 'Stripe.PromotionCode',
  dispute: 'Stripe.Dispute',
  'tax.calculation': 'Stripe.Tax.Calculation',
};

function toConstName(resource: string): string {
  return resource.toUpperCase().replaceAll('.', '_') + '_BASE';
}

function getInstalledStripeVersion(): string {
  const packageJsonPath = path.join(__dirname, '../node_modules/stripe/package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('Stripe SDK not found in node_modules. Run npm install first.');
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

async function getOpenAPIVersion(sdkVersion: string): Promise<string> {
  const url = STRIPE_NODE_OPENAPI_VERSION_URL(sdkVersion);
  console.log(`Fetching OpenAPI version for SDK v${sdkVersion}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI version: ${response.status} ${response.statusText}`);
  }

  const version = (await response.text()).trim();
  console.log(`  OpenAPI version: ${version}`);
  return version;
}

async function fetchFixtures(openapiVersion: string): Promise<{ resources: Record<string, unknown> }> {
  const url = STRIPE_OPENAPI_FIXTURES_URL(openapiVersion);
  console.log(`Fetching fixtures from ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch fixtures: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<{ resources: Record<string, unknown> }>;
}

function generateTypeScript(objects: Record<string, unknown>, sdkVersion: string, openapiVersion: string): string {
  const lines = [
    '// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY',
    '// Run: npm run generate:stripe-fixtures',
    `// Generated: ${new Date().toISOString()}`,
    `// Stripe SDK: v${sdkVersion}`,
    `// OpenAPI Version: ${openapiVersion}`,
    '',
    "import Stripe from 'stripe';",
    '',
  ];

  for (const [name, value] of Object.entries(objects)) {
    const constName = toConstName(name);
    const typeName = STRIPE_TYPE_MAPPING[name as ResourceName];

    if (!typeName) {
      console.warn(`Warning: No type mapping for resource "${name}", skipping`);
      continue;
    }

    lines.push(`export const ${constName} = ${JSON.stringify(value, null, 2)} as unknown as ${typeName};`);
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let openapiVersion: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      openapiVersion = args[i + 1];
    }
  }

  // Get SDK version
  const sdkVersion = getInstalledStripeVersion();
  console.log(`Installed Stripe SDK: v${sdkVersion}`);

  // Get or use provided OpenAPI version
  if (!openapiVersion) {
    openapiVersion = await getOpenAPIVersion(sdkVersion);
  } else {
    console.log(`Using provided OpenAPI version: ${openapiVersion}`);
  }

  // Fetch fixtures
  const fixtures = await fetchFixtures(openapiVersion);

  // Extract resources
  console.log('\nExtracting resources...');
  const baseObjects: Record<string, unknown> = {};
  const missingResources: string[] = [];

  for (const resource of RESOURCES_TO_GENERATE) {
    const fixture = fixtures.resources[resource];
    if (fixture) {
      baseObjects[resource] = fixture;
      console.log(`  + ${resource}`);
    } else {
      missingResources.push(resource);
      console.log(`  - ${resource} (not found)`);
    }
  }

  if (missingResources.length > 0) {
    console.warn(`\nWarning: ${missingResources.length} resources not found in fixtures`);
  }

  // Generate TypeScript
  console.log('\nGenerating TypeScript...');
  const output = generateTypeScript(baseObjects, sdkVersion, openapiVersion);

  // Write file
  const outputPath = path.join(__dirname, '../tests/src/fixtures/stripe-base.generated.ts');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  console.log(`\nGenerated: ${outputPath}`);
  console.log(`Resources: ${Object.keys(baseObjects).length}/${RESOURCES_TO_GENERATE.length}`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
