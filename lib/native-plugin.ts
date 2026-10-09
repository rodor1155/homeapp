import { isCapacitorNative } from "@/lib/is-capacitor-native";

type CapacitorWithPlugins = {
  isPluginAvailable?: (name: string) => boolean;
  registerPlugin?: <T>(name: string) => T;
  Plugins?: Record<string, unknown>;
};

const cache = new Map<string, unknown>();

/**
 * A plugin the iOS shell registered with `registerPluginInstance`, or null in
 * a browser and in older app builds that do not have it. Same lookup as
 * lib/native-vault.ts: such plugins are not pre-populated on
 * `Capacitor.Plugins` for a remote (server.url) page.
 */
export function getNativePlugin<T extends object>(name: string): T | null {
  if (typeof window === "undefined" || !isCapacitorNative()) return null;
  if (cache.has(name)) return cache.get(name) as T;

  const cap = window.Capacitor as CapacitorWithPlugins | undefined;
  if (!cap) return null;

  try {
    if (cap.isPluginAvailable?.(name) !== true) {
      const existing = cap.Plugins?.[name];
      if (existing && typeof existing === "object") {
        cache.set(name, existing);
        return existing as T;
      }
      return null;
    }
    const proxy = cap.registerPlugin?.<T>(name);
    if (!proxy) return null;
    cache.set(name, proxy);
    return proxy;
  } catch {
    return null;
  }
}
