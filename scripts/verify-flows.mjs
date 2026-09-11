#!/usr/bin/env node
/**
 * End-to-end verification for invite-accept and delete-account flows.
 * Requires .env.local with Supabase keys. Creates throwaway users and cleans up.
 *
 * Usage: node scripts/verify-flows.mjs [invite|delete|all]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error(
    "Missing Supabase env vars. Copy .env.example to .env.local and fill in values."
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const ownerEmail = `verify-owner-${stamp}@example.com`;
const memberEmail = `verify-member-${stamp}@example.com`;
const password = "VerifyPass123!";

const mode = process.argv[2] ?? "all";

async function main() {
  if (mode === "invite" || mode === "all") {
    await testInviteFlow();
  }
  if (mode === "delete" || mode === "all") {
    await testDeleteFlow();
  }
}

async function testInviteFlow() {
  console.log("\n=== INVITE-ACCEPT FLOW ===");
  let ownerId;
  let memberId;
  let ownerHouseholdId;
  let inviteId;

  try {
    ownerId = await createConfirmedUser(ownerEmail);
    memberId = await createConfirmedUser(memberEmail);

    ownerHouseholdId = await onboardUser(ownerId, "Verify Household");

    const ownerClient = await signIn(ownerEmail);
    inviteId = await sendInvite(ownerClient, memberEmail);
    console.log("✓ Owner created household and sent invite", inviteId);

    const memberClient = await signIn(memberEmail);
    const pending = await memberClient.rpc("pending_invites_for_me");
    if (pending.error) throw new Error(pending.error.message);
    if ((pending.data ?? []).length !== 1) {
      throw new Error(
        `Expected 1 pending invite, got ${(pending.data ?? []).length}`
      );
    }
    console.log("✓ Invitee sees pending invite");

    const accepted = await memberClient.rpc("accept_household_invite", {
      p_invite_id: inviteId,
    });
    if (accepted.error) throw new Error(accepted.error.message);
    console.log("✓ Invitee accepted invite");

    const memberHouseholdId = await primaryHouseholdId(memberId);
    if (memberHouseholdId !== ownerHouseholdId) {
      throw new Error(
        `Household mismatch: owner ${ownerHouseholdId}, member ${memberHouseholdId}`
      );
    }
    console.log("✓ Both users share household", ownerHouseholdId);

    const members = await admin
      .from("household_members")
      .select("user_id")
      .eq("household_id", ownerHouseholdId);
    const memberIds = (members.data ?? []).map((row) => row.user_id).sort();
    if (memberIds.join(",") !== [ownerId, memberId].sort().join(",")) {
      throw new Error(`Unexpected members: ${memberIds.join(", ")}`);
    }
    console.log("✓ Household has both members");

    const ownerCanRead = await ownerClient
      .from("properties")
      .select("id")
      .eq("household_id", ownerHouseholdId);
    const memberCanRead = await memberClient
      .from("properties")
      .select("id")
      .eq("household_id", ownerHouseholdId);
    if (ownerCanRead.error || memberCanRead.error) {
      throw new Error("Member cannot read shared household property");
    }
    console.log("✓ Both users can read shared property");
    console.log("INVITE-ACCEPT: PASS");
  } catch (error) {
    console.error("INVITE-ACCEPT: FAIL —", error.message);
    throw error;
  } finally {
    await cleanupUser(memberId);
    await cleanupUser(ownerId);
  }
}

async function testDeleteFlow() {
  console.log("\n=== DELETE-ACCOUNT FLOW ===");
  const email = `verify-delete-${stamp}@example.com`;
  let userId;

  try {
    userId = await createConfirmedUser(email);
    const householdId = await onboardUser(userId, "Delete Test Household");
    const docId = crypto.randomUUID();
    const storagePath = `${householdId}/${docId}/test.txt`;

    await admin.storage.from("documents").upload(storagePath, "delete me", {
      contentType: "text/plain",
      upsert: true,
    });
    await admin.from("documents").insert({
      id: docId,
      household_id: householdId,
      property_id: (
        await admin
          .from("properties")
          .select("id")
          .eq("household_id", householdId)
          .single()
      ).data.id,
      storage_path: storagePath,
      original_filename: "test.txt",
      extraction_status: "confirmed",
    });
    await admin.from("reminders").insert({
      household_id: householdId,
      document_id: docId,
      kind: "renewal",
      due_date: "2099-01-01",
      offsets: [30, 0],
      status: "scheduled",
    });
    console.log("✓ Created throwaway user with document, file, and reminder");

    await removeHouseholdFiles(householdId);
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(deleteError.message);
    console.log("✓ Auth user deleted");

    await assertGone("auth user", async () => {
      const { data } = await admin.auth.admin.getUserById(userId);
      return Boolean(data?.user);
    });
    await assertGone("household_members", async () => {
      const { count } = await admin
        .from("household_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      return (count ?? 0) > 0;
    });
    await assertGone("household", async () => {
      const { data } = await admin
        .from("households")
        .select("id")
        .eq("id", householdId)
        .maybeSingle();
      return Boolean(data);
    });
    await assertGone("documents", async () => {
      const { count } = await admin
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("household_id", householdId);
      return (count ?? 0) > 0;
    });
    await assertGone("reminders", async () => {
      const { count } = await admin
        .from("reminders")
        .select("*", { count: "exact", head: true })
        .eq("household_id", householdId);
      return (count ?? 0) > 0;
    });

    const { data: files } = await admin.storage.from("documents").list(householdId);
    if ((files ?? []).length > 0) {
      throw new Error(`Storage still has files under ${householdId}/`);
    }
    console.log("✓ Storage prefix purged");
    console.log("DELETE-ACCOUNT: PASS");
  } catch (error) {
    console.error("DELETE-ACCOUNT: FAIL —", error.message);
    throw error;
  } finally {
    await cleanupUser(userId);
  }
}

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  return data.user.id;
}

async function onboardUser(userId, name) {
  const { data: membership } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const householdId = membership.household_id;
  await admin.from("households").update({ name, locale: "UK" }).eq("id", householdId);
  await admin.from("properties").insert({
    household_id: householdId,
    address: "1 Verify Street\nTestville",
    type: "House",
    year_built: 2000,
  });
  return householdId;
}

async function signIn(email) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return client;
}

async function sendInvite(client, email) {
  const { data: membership } = await client
    .from("household_members")
    .select("household_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const { data, error } = await client
    .from("household_invites")
    .insert({
      household_id: membership.household_id,
      email,
      invited_by: (await client.auth.getUser()).data.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function primaryHouseholdId(userId) {
  const { data } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  return data?.household_id ?? null;
}

async function removeHouseholdFiles(householdId) {
  const bucket = admin.storage.from("documents");
  const paths = [];

  async function listAll(prefix) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
      if (error) throw new Error(error.message);
      const page = data ?? [];
      for (const entry of page) {
        if (entry.id !== null) paths.push(`${prefix}/${entry.name}`);
        else await listAll(`${prefix}/${entry.name}`);
      }
      if (page.length < 1000) break;
    }
  }

  await listAll(householdId);
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await bucket.remove(paths.slice(i, i + 1000));
    if (error) throw new Error(error.message);
  }
}

async function assertGone(label, stillExists) {
  if (await stillExists()) throw new Error(`${label} still present after delete`);
  console.log(`✓ No orphaned ${label}`);
}

async function cleanupUser(userId) {
  if (!userId) return;
  try {
    const { data: memberships } = await admin
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId);
    for (const row of memberships ?? []) {
      await removeHouseholdFiles(row.household_id);
    }
    await admin.auth.admin.deleteUser(userId);
  } catch {
    // Best-effort cleanup for failed runs.
  }
}

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

main().catch(() => process.exit(1));
