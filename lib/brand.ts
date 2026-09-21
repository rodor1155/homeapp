/** User-facing product name. Bundle id stays co.rodor.homeapp. */
export const APP_NAME = "Hearth Home";

/** Titles like "Settings · Hearth Home". */
export function appTitle(page: string): string {
  return `${page} · ${APP_NAME}`;
}
