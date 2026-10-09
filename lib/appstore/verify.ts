import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { appleRootCertificates } from "@/lib/appstore/apple-root-ca";
import { appStoreConfig, type AppStoreConfig } from "@/lib/appstore/config";

/* Verification of App Store signed data (JWS). Every payload is checked
   against Apple Root CA - G3: the x5c chain, the leaf and intermediate OIDs,
   the signature, the bundle id and the environment. Both Production and
   Sandbox are accepted, because TestFlight and App Review purchases are
   Sandbox-signed and hit the production server.

   Nothing in here trusts a field before the signature has been checked. */

export type AppStoreEnvironment = "Production" | "Sandbox";

/** Thrown for anything that is not genuine App Store data for this app. */
export class AppStoreVerificationError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`App Store verification failed: ${reason}`);
    this.name = "AppStoreVerificationError";
    this.reason = reason;
  }
}

export type AppStoreVerifier = {
  environment: AppStoreEnvironment;
  verifier: SignedDataVerifier;
};

export type VerifierOptions = {
  /** DER root certificates. Defaults to the embedded Apple root. */
  roots?: Buffer[];
  config?: AppStoreConfig;
};

/** Largest signed payload we will look at. Real ones are a few kilobytes. */
const MAX_JWS_LENGTH = 100_000;
const JWS_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** A compact JWS with three base64url segments — shape only, no trust. */
export function looksLikeJws(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_JWS_LENGTH &&
    JWS_SHAPE.test(value)
  );
}

let defaultVerifiers: AppStoreVerifier[] | null = null;
let defaultVerifiersKey = "";

export function createVerifiers(options: VerifierOptions = {}): AppStoreVerifier[] {
  const config = options.config ?? appStoreConfig();
  const roots = options.roots ?? appleRootCertificates();
  const verifiers: AppStoreVerifier[] = [];

  // The library refuses to build a Production verifier without the app's
  // Apple ID, so Production data is only accepted once that is configured.
  if (config.appAppleId !== null) {
    verifiers.push({
      environment: "Production",
      verifier: new SignedDataVerifier(
        roots,
        config.onlineChecks,
        Environment.PRODUCTION,
        config.bundleId,
        config.appAppleId
      ),
    });
  }
  verifiers.push({
    environment: "Sandbox",
    verifier: new SignedDataVerifier(
      roots,
      config.onlineChecks,
      Environment.SANDBOX,
      config.bundleId
    ),
  });
  return verifiers;
}

function verifiersFor(options?: VerifierOptions): AppStoreVerifier[] {
  if (options) return createVerifiers(options);
  const config = appStoreConfig();
  const key = JSON.stringify(config);
  if (!defaultVerifiers || defaultVerifiersKey !== key) {
    defaultVerifiers = createVerifiers({ config });
    defaultVerifiersKey = key;
  }
  return defaultVerifiers;
}

function describe(error: unknown): string {
  if (error instanceof VerificationException) {
    return VerificationStatus[error.status] ?? "VERIFICATION_FAILURE";
  }
  return "MALFORMED";
}

/**
 * Runs a verification against each accepted environment in turn. Any throw —
 * a failed chain, a wrong bundle id, or a parser choking on garbage — counts
 * as "not verified"; nothing escapes as an unexpected error.
 */
async function verifyInAnyEnvironment<T>(
  jws: unknown,
  run: (verifier: SignedDataVerifier) => Promise<T>,
  options?: VerifierOptions,
  only?: AppStoreEnvironment
): Promise<{ payload: T; environment: AppStoreEnvironment }> {
  if (!looksLikeJws(jws)) {
    throw new AppStoreVerificationError("MALFORMED");
  }

  let reason = "NO_VERIFIER";
  for (const { environment, verifier } of verifiersFor(options)) {
    if (only && environment !== only) continue;
    try {
      const payload = await run(verifier);
      return { payload, environment };
    } catch (error) {
      const described = describe(error);
      // Keep the most telling reason: a wrong-environment miss on one
      // verifier should not hide a real signature failure on the other.
      if (reason === "NO_VERIFIER" || reason === "INVALID_ENVIRONMENT") {
        reason = described;
      }
    }
  }
  throw new AppStoreVerificationError(reason);
}

export function verifyNotification(
  signedPayload: unknown,
  options?: VerifierOptions
): Promise<{
  payload: ResponseBodyV2DecodedPayload;
  environment: AppStoreEnvironment;
}> {
  return verifyInAnyEnvironment(
    signedPayload,
    (verifier) => verifier.verifyAndDecodeNotification(signedPayload as string),
    options
  );
}

export function verifyTransaction(
  signedTransaction: unknown,
  options?: VerifierOptions,
  only?: AppStoreEnvironment
): Promise<{
  payload: JWSTransactionDecodedPayload;
  environment: AppStoreEnvironment;
}> {
  return verifyInAnyEnvironment(
    signedTransaction,
    (verifier) =>
      verifier.verifyAndDecodeTransaction(signedTransaction as string),
    options,
    only
  );
}

export function verifyRenewalInfo(
  signedRenewalInfo: unknown,
  options?: VerifierOptions,
  only?: AppStoreEnvironment
): Promise<{
  payload: JWSRenewalInfoDecodedPayload;
  environment: AppStoreEnvironment;
}> {
  return verifyInAnyEnvironment(
    signedRenewalInfo,
    (verifier) =>
      verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo as string),
    options,
    only
  );
}
