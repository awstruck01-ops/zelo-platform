const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Creates a Stripe Express Connect account for a seller or driver.
 * Express accounts let Stripe host the onboarding form (bank details,
 * identity, etc.) so Zelo never touches sensitive banking data directly.
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.type - 'seller' or 'driver', used only for metadata
 * @param {string} params.entityId - the sellers.id or driver_profiles.id
 */
const createConnectAccount = async ({ email, type, entityId }) => {
  const account = await stripe.accounts.create({
    type: 'express',
    email: email || undefined,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: type === 'seller' },
    },
    business_type: 'individual',
    metadata: { zelo_type: type, zelo_entity_id: entityId },
  });
  return account.id;
};

/**
 * Generates a Stripe-hosted onboarding link for a Connect account. The
 * driver/seller opens this URL to enter their bank account / debit card
 * and identity info directly with Stripe. refreshUrl is where Stripe sends
 * them if the link expires before they finish; returnUrl is where they land
 * after completing (or leaving) the flow.
 */
const createOnboardingLink = async (stripeAccountId, refreshUrl, returnUrl) => {
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return accountLink.url;
};

module.exports = {
  stripe,
  createConnectAccount,
  createOnboardingLink,
};
