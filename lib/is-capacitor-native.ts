type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

declare global {
  interface Window {
    Capacitor?: CapacitorBridge;
  }
}

/**
 * True only when running inside a real Capacitor iOS/Android shell.
 *
 * Deliberately does NOT treat `window.Capacitor.Plugins` as a signal: this app's
 * remote server.url means the same JS bundle loads in plain mobile/desktop
 * browsers too, and merely importing a Capacitor plugin package (e.g. in
 * NativeOAuthListener, mounted for every page) registers its web-fallback
 * implementation on `window.Capacitor.Plugins` even outside the native shell.
 * `isNativePlatform()` / `getPlatform()` are the only reliable signals.
 */
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;

  const bridge = window.Capacitor;
  if (!bridge) return false;

  try {
    if (bridge.isNativePlatform?.() === true) return true;
  } catch {
    // Bridge may be partially initialized on remote URLs; fall through.
  }

  const platform = bridge.getPlatform?.();
  return platform === "ios" || platform === "android";
}
