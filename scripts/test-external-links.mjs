#!/usr/bin/env node
/**
 * Policy tests for external link interception — no deps, run via npm run test:links
 */
import {
  shouldNavigateForOsScheme,
  shouldOpenExternalLink,
} from "../lib/open-external-link.mjs";

const ORIGIN = "https://homeapp-mu.vercel.app";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
}

assert(
  shouldOpenExternalLink("https://checkout.stripe.com/pay/cs_test", ORIGIN),
  "cross-origin https should open externally",
);

assert(
  shouldOpenExternalLink("https://homeapp-mu.vercel.app/dashboard", ORIGIN) === false,
  "same-origin https should stay in webview",
);

assert(
  shouldOpenExternalLink("/dashboard", ORIGIN) === false,
  "relative same-origin path should stay in webview",
);

assert(
  shouldOpenExternalLink("#section", ORIGIN) === false,
  "hash-only link should stay in webview",
);

assert(
  shouldOpenExternalLink("mailto:hello@example.com", ORIGIN) === false,
  "mailto should be left to the OS",
);

assert(
  shouldOpenExternalLink("tel:+441234567890", ORIGIN) === false,
  "tel should be left to the OS",
);

assert(
  shouldOpenExternalLink("sms:+441234567890", ORIGIN) === false,
  "sms should be left to the OS",
);

assert(
  shouldOpenExternalLink("https://other.example/file.pdf", ORIGIN, { download: true }) ===
    false,
  "download attribute should skip interception",
);

assert(
  shouldOpenExternalLink("webcal://homeapp-mu.vercel.app/api/ics/token.ics", ORIGIN) ===
    false,
  "non-http scheme should not be intercepted",
);

assert(
  shouldOpenExternalLink("javascript:alert(1)", ORIGIN) === false,
  "javascript: should not be intercepted",
);

assert(
  shouldOpenExternalLink("not a valid url %%", ORIGIN) === false,
  "malformed href should not throw or intercept",
);

assert(
  shouldOpenExternalLink("", ORIGIN) === false,
  "empty href should not intercept",
);

assert(
  shouldNavigateForOsScheme("webcal://homeapp-mu.vercel.app/api/ics/token.ics"),
  "webcal uses OS navigation in the shell",
);

assert(
  shouldNavigateForOsScheme("mailto:hello@example.com"),
  "mailto uses OS navigation in the shell",
);

assert(
  shouldNavigateForOsScheme("tel:+441234567890"),
  "tel uses OS navigation in the shell",
);

assert(
  shouldNavigateForOsScheme("https://checkout.stripe.com/pay/cs_test") === false,
  "https should not use OS navigation",
);

assert(
  shouldNavigateForOsScheme("not a valid url %%") === false,
  "malformed URL should not use OS navigation",
);

console.log(`external links: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
