"use client";

import { useIsCapacitorNative } from "@/lib/use-is-capacitor-native";

/**
 * The billing lines of the privacy policy. Inside the iPhone app,
 * subscriptions are sold by Apple, so the policy names Apple there and leaves
 * the web card processor unnamed (App Review Guideline 3.1.1).
 */
export function BillingDataCopy() {
  const inNativeShell = useIsCapacitorNative();
  if (inNativeShell) {
    return (
      <>
        if you subscribe, the payment is taken by Apple (or by our payment
        processor); we never see your card details. We store your plan status
        and the provider&apos;s reference for your subscription.
      </>
    );
  }
  return (
    <>
      if you subscribe on the web, Stripe holds payment details and we store
      your plan status and Stripe customer reference. If you subscribe in the
      iPhone app, Apple takes the payment and we store your plan status and
      Apple&apos;s reference for the subscription. We never see your card
      details either way.
    </>
  );
}

export function PaymentSubprocessors() {
  const inNativeShell = useIsCapacitorNative();
  return (
    <>
      {inNativeShell ? null : (
        <li>
          <strong>Stripe</strong> — subscription payments made on the web
          (when billing is enabled).
        </li>
      )}
      <li>
        <strong>Apple</strong> — App Store subscriptions bought in the iPhone
        app, and optional sign-in if you choose Sign in with Apple. When you
        delete your account we ask Apple to revoke that sign-in.
      </li>
    </>
  );
}
