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
