import {
  accountTokenOf,
  isHouseholdSubscription,
} from "@/lib/appstore/entitlement";
import { appStoreConfig } from "@/lib/appstore/config";
import {
  applySubscriptionEvent,
  findAppStoreSubscription,
  householdExists,
} from "@/lib/appstore/subscriptions";
import {
  AppStoreVerificationError,
  verifyNotification,
  verifyRenewalInfo,
  verifyTransaction,
} from "@/lib/appstore/verify";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/* App Store Server Notifications v2. Apple POSTs `{ "signedPayload": "<JWS>" }`
   for renewals, expiries, refunds and the rest; this is how a household's plan
   stays right when the app is not open.

   The URL is public, so the only thing that makes a request real is Apple's
   signature. The payload — and the transaction and renewal info nested inside
   it — is verified against Apple Root CA - G3 before a single field is read.
   Anything that fails that is answered 400: malformed JSON, a missing or
   unsigned payload, a forged chain, another app's bundle id. Only a genuine
   notification that we then fail to store answers 500, so Apple retries it. */

/** Notifications are a few kilobytes; refuse to buffer anything silly. */
const MAX_BODY_BYTES = 256_000;

function bad(reason: string): Response {
  return Response.json({ error: "invalid notification", reason }, { status: 400 });
}

export async function POST(request: Request) {
  let signedPayload: unknown;
  try {
    const text = await request.text();
    if (text.length === 0 || text.length > MAX_BODY_BYTES) {
      return bad("MALFORMED");
    }
    const body: unknown = JSON.parse(text);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return bad("MALFORMED");
    }
    signedPayload = (body as Record<string, unknown>).signedPayload;
  } catch {
    return bad("MALFORMED");
  }

  let verified;
  let transaction = null;
  let renewal = null;
  try {
    verified = await verifyNotification(signedPayload);
    const data = verified.payload.data;
    // The inner JWS documents are signed separately; hold them to the same
    // environment as the envelope they arrived in.
    if (data?.signedTransactionInfo) {
      transaction = (
        await verifyTransaction(
          data.signedTransactionInfo,
          undefined,
          verified.environment
        )
      ).payload;
    }
    if (data?.signedRenewalInfo) {
      renewal = (
        await verifyRenewalInfo(
          data.signedRenewalInfo,
          undefined,
          verified.environment
        )
      ).payload;
    }
  } catch (error) {
    const reason =
      error instanceof AppStoreVerificationError ? error.reason : "MALFORMED";
    console.warn("[appstore] rejected a notification:", reason);
    return bad(reason);
  }

  const { payload, environment } = verified;
  const notificationType = payload.notificationType ?? null;
  const received = { received: true, notificationType, environment };

  // TEST pings, summaries and the like carry no transaction to record.
  if (!transaction?.originalTransactionId) {
    return Response.json({ ...received, outcome: "ignored" });
  }
  if (!isHouseholdSubscription(transaction, appStoreConfig().productIds)) {
    return Response.json({ ...received, outcome: "not a household subscription" });
  }

  try {
    const admin = createAdminClient();
    const existing = await findAppStoreSubscription(
      admin,
      transaction.originalTransactionId
    );

    // A known subscription stays with its household. A new one is placed by
    // the household id the app handed StoreKit at purchase; without that the
    // app's own submission (POST /api/appstore/transactions) will place it.
    let householdId = existing?.household_id ?? null;
    if (!householdId) {
      const token = accountTokenOf(transaction);
      if (token && (await householdExists(admin, token))) householdId = token;
    }
    if (!householdId) {
      return Response.json({ ...received, outcome: "no household yet" });
    }

    const { applied } = await applySubscriptionEvent(
      admin,
      {
        transaction,
        renewal,
        environment,
        notificationType,
        notificationSubtype: payload.subtype ?? null,
        notificationSignedDate: payload.signedDate,
      },
      householdId,
      existing
    );
    return Response.json({
      ...received,
      outcome: applied ? "recorded" : "older than stored state",
    });
  } catch (error) {
    console.error(`[appstore] ${notificationType} could not be stored`, error);
    return Response.json({ error: "could not store notification" }, { status: 500 });
  }
}
