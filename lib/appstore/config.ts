/* App Store configuration, all from the environment (see .env.example).
   Nothing here is secret: the bundle id, the app's numeric Apple ID and the
   product identifiers are public facts about the app. */

export const DEFAULT_BUNDLE_ID = "co.rodor.homeapp";

export const DEFAULT_PRODUCT_IDS = [
  "co.rodor.homeapp.household.monthly",
  "co.rodor.homeapp.household.yearly",
];

export type AppStoreConfig = {
  bundleId: string;
  /** The app's numeric Apple ID. Required to accept Production-signed data. */
  appAppleId: number | null;
  productIds: string[];
  /** OCSP revocation checks on Apple's signing certificates. */
  onlineChecks: boolean;
};

export function appStoreConfig(): AppStoreConfig {
  const rawAppleId = process.env.APPSTORE_APP_APPLE_ID?.trim();
  const parsedAppleId = rawAppleId ? Number(rawAppleId) : NaN;
  const productIds = (process.env.APPSTORE_PRODUCT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return {
    bundleId: process.env.APPSTORE_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID,
    appAppleId:
      Number.isSafeInteger(parsedAppleId) && parsedAppleId > 0
        ? parsedAppleId
        : null,
    productIds: productIds.length > 0 ? productIds : DEFAULT_PRODUCT_IDS,
    onlineChecks: process.env.APPSTORE_ONLINE_CHECKS?.trim() !== "false",
  };
}

/**
 * App Store billing counts as switched on once the app's Apple ID is set —
 * that is what lets Production purchases verify. Until then the server still
 * verifies Sandbox data (TestFlight, App Review) so the flow can be tested.
 */
export function isAppStoreConfigured(): boolean {
  return appStoreConfig().appAppleId !== null;
}
