/** User-facing product name. Bundle id stays co.rodor.homeapp. */
export const APP_NAME = "Hearth";

/** Titles like "Settings · Hearth". */
export function appTitle(page: string): string {
  return `${page} · ${APP_NAME}`;
}
