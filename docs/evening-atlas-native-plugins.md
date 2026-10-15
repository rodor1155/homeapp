# Evening Atlas 2 — native Capacitor plugin contracts

Web branch: `cursor/evening-atlas-2-7bb0`. iOS shell: `rodor1155/ios-shell-template` (`vault/production`).

All renewal / scan / share-in data stays on the device. The web layer never POSTs file bytes or OCR text to Rodor servers.

Register plugins with `registerPluginInstance` (remote `server.url` WebView) so `Capacitor.isPluginAvailable(name)` and `registerPlugin(name)` resolve them from the live page.

---

## `HearthMap`

MapKit underlay for Home (`/dashboard`). The WebView background must be transparent while Home is visible.

```typescript
show(options: {
  lat: number;
  lng: number;
  /** Matches `prefers-color-scheme: dark` on the web layer. */
  dark: boolean;
}): Promise<void>;

hide(): Promise<void>;

setAppearance(options: { dark: boolean }): Promise<void>;
```

Web caller: `lib/hearth-map.ts`, `components/HearthMapController.tsx`.

**Contract:** `show()` must **resolve `true` only after MapKit is actually visible** behind the WebView. If registration or presentation fails, resolve `false` (do not throw). The web layer applies `hearth-native-map-active` (transparent WebView) **only after `show()` returns true** — otherwise users see the daylight grid fallback, not a blank cream layer.

When the plugin is missing or `show()` returns false, Home uses the CSS grid fallback in `EveningMapView` (no raster tiles).

---

## `HearthScan`

On-device document capture + OCR. No server upload.

```typescript
scan(): Promise<{
  text: string;
  dates: { iso: string; label?: string }[];
  suggestedTitle?: string;
}>;
```

Web caller: `lib/hearth-scan.ts` → `components/AddToHouseSheet.tsx` (confirm step → `HearthVault.confirmRenewalDraft`).

---

## `HearthShareIn`

Files shared into Hearth from other apps (Share sheet → Hearth).

```typescript
/** In-app Files picker — same on-device ingest pipeline as the Share extension. */
pickFiles(): Promise<{
  text?: string;
  dates?: { iso: string; label?: string }[];
  suggestedTitle?: string;
  sourceNames?: string[];
} | null>;

/** Optional: cold-start queue after the shell receives files before JS loads. */
consumePendingDraft(): Promise<{
  text?: string;
  dates?: { iso: string; label?: string }[];
  suggestedTitle?: string;
  sourceNames?: string[];
} | null>;

addListener(
  event: "shareReceived",
  listener: (payload: {
    files: { name: string; mimeType: string; base64?: string }[];
  }) => void
): Promise<{ remove: () => void }>;
```

After native OCR/extraction, the shell should make `consumePendingDraft()` return the same shape as `HearthScan` so the web confirm sheet can call `confirmRenewalDraft`. File bytes must not leave the phone.

Web caller: `lib/hearth-share-in.ts`, `components/HearthShareInListener.tsx`.

---

## `HearthVault` (extensions)

Existing methods unchanged: `openVault()`, `openAdd()`.

New methods for Atlas Home + Add sheet:

```typescript
listDeckCards(): Promise<{
  cards: {
    id: string;
    eyebrow: string;
    title: string;
    badge?: string;
    whenLabel: string;
    color: "navy" | "forest" | "maroon" | "plum" | "amber" | "teal" | "rose" | "slate";
    bookLabel?: string;
    bookUrl?: string;
    position: number;
    total: number;
  }[];
}>;

openRecord(options: { id: string }): Promise<void>;

/** Opens booking flow or URL; if `bookUrl` is set on the card, web may open it directly. */
bookRecord(options: { id: string }): Promise<void>;

addRenewalFromPreset(options: {
  presetId: string;
}): Promise<{ ok: boolean; needsPaywall?: boolean }>;

confirmRenewalDraft(options: {
  draft: {
    presetId?: string;
    title?: string;
    expiryIso?: string;
    scan?: { text: string; dates: { iso: string; label?: string }[]; suggestedTitle?: string };
    shareIn?: { text?: string; dates?: { iso: string; label?: string }[]; suggestedTitle?: string; sourceNames?: string[] };
  };
}): Promise<{ ok: boolean; needsPaywall?: boolean }>;
```

Preset IDs (web): `car-insurance`, `home-insurance`, `mot`, `car-tax`, `boiler-service`, `tv-licence`, `passport`, `breakdown-cover`, `broadband` — see `lib/uk-renewals.ts`.

Web caller: `lib/hearth-vault-renewals.ts`, `lib/native-vault.ts` (existing open/add).

---

## Unchanged integrations

- **`HearthStore`**: StoreKit paywall, `setPlan`, transaction POST to `/api/appstore/transactions`.
- **`HearthAuth`**: Sign in with Apple in the native shell.
- Stripe checkout remains blocked in the shell (`lib/open-external.ts` / `web-payment-url`).
