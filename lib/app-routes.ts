/** Signed-in destinations the shell keeps warm in the Client Cache. */

export const APP_TAB_HREFS = [
  "/dashboard",
  "/family",
  "/calendar",
  "/lists",
  "/documents",
] as const;

export const APP_WARM_HREFS = [...APP_TAB_HREFS, "/settings"] as const;
