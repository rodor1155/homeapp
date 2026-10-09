import {
  accessEndsAt,
  accountTokenOf,
  isAppStoreRowEntitled,
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
  verifyTransaction,
} from "@/lib/appstore/verify";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/* The iPhone app hands over the signed transaction (JWS) StoreKit gave it
   after a purchase or a restore. The device is not trusted: the transaction is
   verified here against Apple's root, and only then does the signed-in user's
   household get the plan.

   One Apple subscription pays for one household. It follows the household id
   the app passed to StoreKit at purchase (appAccountToken); someone who is not
   in that household cannot attach it to another. */

const MAX_BODY_BYTES = 512_000;
const MAX_TRANSACTIONS = 10;

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function readTransactions(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const list =
    record.signedTransactions ??
    (record.signedTransaction === undefined ? undefined : [record.signedTransaction]);
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_TRANSACTIONS) {
    return null;
  }
  return list.every((item) => typeof item === "string") ? (list as string[]) : null;
}

export async function POST(request: Request) {
  let signed: string[] | null;
  try {
    const text = await request.text();
    if (text.length === 0 || text.length > MAX_BODY_BYTES) {
      return fail(400, "Send a signedTransaction.");
    }
    signed = readTransactions(JSON.parse(text));
  } catch {
    signed = null;
  }
  if (!signed) return fail(400, "Send a signedTransaction.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "You are not signed in.");

  const productIds = appStoreConfig().productIds;
  const verified = [];
  for (const jws of signed) {
    try {
      const result = await verifyTransaction(jws);
      if (
        !result.payload.originalTransactionId ||
        !isHouseholdSubscription(result.payload, productIds)
      ) {
        return fail(400, "That is not a Hearth Household subscription.");
      }
      verified.push(result);
    } catch (error) {
      const reason =
        error instanceof AppStoreVerificationError ? error.reason : "MALFORMED";
      console.warn(`[appstore] rejected a transaction from ${user.id}:`, reason);
      return fail(400, "The App Store could not verify this purchase.");
    }
  }

  try {
    const admin = createAdminClient();
    const { data: memberships, error: membershipError } = await admin
      .from("household_members")
      .select("household_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (membershipError) throw new Error(membershipError.message);

    const mine = (memberships ?? []).map((row) => row.household_id as string);
    if (mine.length === 0) {
      return fail(409, "Set up your household before subscribing.");
    }

    let best: { entitled: boolean; endsAt: number | null; productId: string } | null =
      null;

    for (const { payload: transaction, environment } of verified) {
      const existing = await findAppStoreSubscription(
        admin,
        transaction.originalTransactionId as string
      );

      let householdId: string;
      if (existing) {
        if (!mine.includes(existing.household_id)) {
          return fail(
            409,
            "This Apple subscription is already linked to another household."
          );
        }
        householdId = existing.household_id;
      } else {
        const token = accountTokenOf(transaction);
        if (token && mine.includes(token)) {
          householdId = token;
        } else if (token && (await householdExists(admin, token))) {
          return fail(
            409,
            "This Apple subscription is already linked to another household."
          );
        } else {
          // No household on the purchase (or one that has since been deleted):
          // it goes to the household this person is signed in to.
          householdId = mine[0];
        }
      }

      const { row } = await applySubscriptionEvent(
        admin,
        { transaction, environment },
        householdId,
        existing,
        user.id
      );
      const entitled = isAppStoreRowEntitled(row);
      const endsAt = accessEndsAt(row);
      if (
        !best ||
        (entitled && !best.entitled) ||
        (entitled === best.entitled && (endsAt ?? 0) > (best.endsAt ?? 0))
      ) {
        best = { entitled, endsAt, productId: row.product_id };
      }
    }

    return Response.json({
      entitled: best?.entitled ?? false,
      productId: best?.productId ?? null,
      expiresAt: best?.endsAt ? new Date(best.endsAt).toISOString() : null,
    });
  } catch (error) {
    console.error(`[appstore] could not record a purchase for ${user.id}`, error);
    return fail(500, "We could not update your plan. Please try again.");
  }
}
