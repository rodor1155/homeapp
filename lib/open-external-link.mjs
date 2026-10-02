/**
 * Non-http(s) schemes that must be handed to the OS via same-window navigation
 * in the Capacitor shell (webcal, mailto, tel, sms).
 * @param {string} url
 * @returns {boolean}
 */
export function shouldNavigateForOsScheme(url) {
  try {
    const protocol = new URL(url).protocol;
    return (
      protocol === "webcal:" ||
      protocol === "mailto:" ||
      protocol === "tel:" ||
      protocol === "sms:"
    );
  } catch {
    return false;
  }
}

/**
 * Pure helper: should a link click leave the app WebView for the system browser?
 * Shared by lib/open-external.ts and scripts/test-external-links.mjs.
 */
export function shouldOpenExternalLink(href, pageOrigin, options = {}) {
  if (!href || options.download) return false;

  try {
    const url = new URL(href, pageOrigin);

    if (url.protocol === "mailto:" || url.protocol === "tel:" || url.protocol === "sms:") {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    if (url.origin === pageOrigin) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
