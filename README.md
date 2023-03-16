# Payments

## Get started

- Install and use Node v16 (last LTS).
- Install yarn (`npm i -g yarn`)
- Install dependencies: `yarn`
- Run the needed services with `cd infrastructure && docker-compose up`
- Rename `.env.template` to `.env` and fill the empty variables
- Go to '.env' and set STRIPE_SECRET_KEY as the value you can found on Stripe Dashboard on dev mode (Search Bar > Api Keys > Secret Key)
- Redirect webhooks to your local server `stripe listen --forward-to localhost:8003/webhook`
- Run `yarn run dev`

### Nice to know

- If you go to `localhost:8082` you'll see a GUI to inspect the mongodb instance
- Install prettier & eslint vscode extensions for a better dev experience.
