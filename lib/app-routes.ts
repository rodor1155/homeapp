/** Signed-in destinations the shell keeps warm in the Client Cache. */

export const APP_TAB_HREFS = [
  "/dashboard",
  "/family",
  "/calendar",
  "/lists",
  "/documents",
] as const;

export const APP_WARM_HREFS = [...APP_TAB_HREFS, "/settings"] as const;

/** Shell service-worker priming only — excludes paths with secrets or sensitive SSR. */
export const SW_PRIME_HREFS = [
  "/dashboard",
  "/family",
  "/calendar",
  "/lists",
] as const;
