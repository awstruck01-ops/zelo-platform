// Per-mile rates by vehicle type (USD), configurable via env
const PER_MILE_RATE = {
  bicycle: parseFloat(process.env.RATE_BICYCLE || '0.60'),
  scooter: parseFloat(process.env.RATE_SCOOTER || '0.75'),
  motorcycle: parseFloat(process.env.RATE_MOTORCYCLE || '0.90'),
  car: parseFloat(process.env.RATE_CAR || '1.10'),
  truck: parseFloat(process.env.RATE_TRUCK || '1.75'),
};

// Average speed by vehicle type (mph), used for ETA estimates
const AVG_SPEED_MPH = {
  bicycle: 9,
  scooter: 18,
  motorcycle: 22,
  car: 20,
  truck: 16,
};

// Which vehicle types can carry which weight class
const WEIGHT_CLASS_VEHICLE_ELIGIBILITY = {
  light: ['bicycle', 'scooter', 'motorcycle', 'car', 'truck'],
  medium: ['scooter', 'motorcycle', 'car', 'truck'],
  heavy: ['car', 'truck'],
  bulk: ['truck'],
};

const BASE_FARE = parseFloat(process.env.BASE_FARE || '2.50');
const DEFAULT_RADIUS_MI = parseFloat(process.env.DEFAULT_DELIVERY_RADIUS_MI || '7.5');
const PLATFORM_DELIVERY_MARGIN = parseFloat(process.env.PLATFORM_DELIVERY_MARGIN || '0.20');
const PLATFORM_COMMISSION_RATE = parseFloat(process.env.PLATFORM_COMMISSION_RATE || '0.15');
const MIN_DELIVERY_FEE = 3.99;

// Sales tax is charged on the subtotal (food/merchandise), not on delivery fees,
// matching how most US marketplaces handle it. Rate is a placeholder single default;
// in production this should come from a per-address (state/county/city) tax table
// or a tax API (e.g. TaxJar, Stripe Tax) keyed off delivery_address.
const DEFAULT_SALES_TAX_RATE = parseFloat(process.env.DEFAULT_SALES_TAX_RATE || '0.08');

/**
 * Calculates the delivery fee for a given distance & vehicle type.
 * Adds an extended-distance premium once past the default radius,
 * matching the "willing to pay for distance" flow from the product spec.
 */
const calculateDeliveryFee = (distanceMiles, vehicleType, surgeMultiplier = 1) => {
  const rate = PER_MILE_RATE[vehicleType] || PER_MILE_RATE.motorcycle;
  let fee = BASE_FARE + distanceMiles * rate;

  const isExtendedDistance = distanceMiles > DEFAULT_RADIUS_MI;
  if (isExtendedDistance) {
    const extraMiles = distanceMiles - DEFAULT_RADIUS_MI;
    fee += extraMiles * rate * 0.5; // 50% premium on the miles beyond normal radius
  }

  fee *= surgeMultiplier;
  fee = Math.max(fee, MIN_DELIVERY_FEE);

  const platformMargin = Math.round(fee * PLATFORM_DELIVERY_MARGIN * 100) / 100;
  const driverEarnings = Math.round((fee - platformMargin) * 100) / 100;

  return {
    deliveryFee: Math.round(fee * 100) / 100,
    driverEarnings,
    platformMargin,
    isExtendedDistance,
  };
};

const calculateCommission = (subtotal, commissionRatePercent) => {
  const rate = (commissionRatePercent ?? PLATFORM_COMMISSION_RATE * 100) / 100;
  const commission = Math.round(subtotal * rate * 100) / 100;
  const sellerEarnings = Math.round((subtotal - commission) * 100) / 100;
  return { commission, sellerEarnings };
};

/**
 * Sales tax on the order subtotal. Pass an explicit rate (e.g. resolved from
 * the delivery address's state/county) when you have one; otherwise falls
 * back to DEFAULT_SALES_TAX_RATE.
 */
const calculateTax = (subtotal, taxRate = DEFAULT_SALES_TAX_RATE) => {
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  return { tax, taxRate };
};

const estimateDeliveryMinutes = (distanceMiles, vehicleType, prepTimeMinutes = 20) => {
  const speed = AVG_SPEED_MPH[vehicleType] || AVG_SPEED_MPH.motorcycle;
  const travelMinutes = (distanceMiles / speed) * 60;
  const buffer = 10;
  return Math.ceil(prepTimeMinutes + travelMinutes + buffer);
};

const eligibleVehiclesForWeightClass = (weightClass) => {
  return WEIGHT_CLASS_VEHICLE_ELIGIBILITY[weightClass] || WEIGHT_CLASS_VEHICLE_ELIGIBILITY.light;
};

module.exports = {
  calculateDeliveryFee,
  calculateCommission,
  calculateTax,
  estimateDeliveryMinutes,
  eligibleVehiclesForWeightClass,
  DEFAULT_RADIUS_MI,
  DEFAULT_SALES_TAX_RATE,
};
