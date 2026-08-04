// Per-mile rates by vehicle type (USD), configurable via env
const PER_MILE_RATE = {
  bicycle: parseFloat(process.env.RATE_BICYCLE || '0.60'),
  scooter: parseFloat(process.env.RATE_SCOOTER || '0.75'),
  motorcycle: parseFloat(process.env.RATE_MOTORCYCLE || '0.90'),
  car: parseFloat(process.env.RATE_CAR || '1.10'),
  truck: parseFloat(process.env.RATE_TRUCK || '1.50'),
};
// Weight-class surcharge — separate from the delivery fee itself, covers the
// extra handling effort for heavier/bulkier orders. Kept modest since the
// truck per-mile rate already prices in vehicle cost; stacking a large
// surcharge on top of that would double-charge for the same thing.
const SURCHARGE_BY_WEIGHT_CLASS = {
  light: parseFloat(process.env.SURCHARGE_LIGHT || '0'),
  medium: parseFloat(process.env.SURCHARGE_MEDIUM || '1.00'),
  heavy: parseFloat(process.env.SURCHARGE_HEAVY || '2.50'),
  bulk: parseFloat(process.env.SURCHARGE_BULK || '4.50'),
};
// Driver keeps 80% of the delivery fee and 90% of the surcharge (higher
// share on surcharge since it's compensation for the driver's extra
// effort/vehicle specifically, not a general platform-margin item), plus
// 100% of any tip (handled separately, added post-delivery).
const DRIVER_DELIVERY_FEE_SHARE = parseFloat(process.env.DRIVER_DELIVERY_FEE_SHARE || '0.80');
const DRIVER_SURCHARGE_SHARE = parseFloat(process.env.DRIVER_SURCHARGE_SHARE || '0.90');
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
const BASE_FARE = parseFloat(process.env.BASE_FARE || '2.99');
const DEFAULT_RADIUS_MI = parseFloat(process.env.DEFAULT_DELIVERY_RADIUS_MI || '7.5');
const PLATFORM_DELIVERY_MARGIN = parseFloat(process.env.PLATFORM_DELIVERY_MARGIN || '0.20');
const PLATFORM_COMMISSION_RATE = parseFloat(process.env.PLATFORM_COMMISSION_RATE || '0.15');
// Customer-facing service fee, charged on the order subtotal (separate from
// seller commission and delivery fee) — this is Zelo's second revenue stream
// alongside commission, matching how DoorDash/Uber Eats layer a service fee
// on top of delivery fees. Kept below both competitors (~10-11% and ~15%+).
const SERVICE_FEE_RATE = parseFloat(process.env.SERVICE_FEE_RATE || '0.085');
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
  const driverEarnings = Math.round(fee * DRIVER_DELIVERY_FEE_SHARE * 100) / 100;
  const platformMargin = Math.round((fee - driverEarnings) * 100) / 100;
  return {
    deliveryFee: Math.round(fee * 100) / 100,
    driverEarnings,
    platformMargin,
    isExtendedDistance,
  };
};

/**
 * Weight-class surcharge — split 90% driver / 10% platform, separate from
 * the base delivery fee's 80/20 split, since this exists specifically to
 * compensate the driver's extra handling effort.
 */
const calculateSurcharge = (weightClass) => {
  const surcharge = SURCHARGE_BY_WEIGHT_CLASS[weightClass] ?? 0;
  const driverEarnings = Math.round(surcharge * DRIVER_SURCHARGE_SHARE * 100) / 100;
  const platformMargin = Math.round((surcharge - driverEarnings) * 100) / 100;
  return { surcharge, driverEarnings, platformMargin };
};
const calculateCommission = (subtotal, commissionRatePercent) => {
  const rate = (commissionRatePercent ?? PLATFORM_COMMISSION_RATE * 100) / 100;
  const commission = Math.round(subtotal * rate * 100) / 100;
  const sellerEarnings = Math.round((subtotal - commission) * 100) / 100;
  return { commission, sellerEarnings };
};
/**
 * Customer-facing service fee, charged on the subtotal. This is pure platform
 * revenue (unlike delivery fee, none of it goes to the driver, and unlike
 * commission, none of it comes out of the seller's payout).
 */
const calculateServiceFee = (subtotal, rate = SERVICE_FEE_RATE) => {
  const serviceFee = Math.round(subtotal * rate * 100) / 100;
  return { serviceFee, serviceFeeRate: rate };
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
  calculateSurcharge,
  calculateCommission,
  calculateServiceFee,
  calculateTax,
  estimateDeliveryMinutes,
  eligibleVehiclesForWeightClass,
  DEFAULT_RADIUS_MI,
  DEFAULT_SALES_TAX_RATE,
  SERVICE_FEE_RATE,
};
