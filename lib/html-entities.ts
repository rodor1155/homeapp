/** Decode the handful of entities ICS titles and feed names sometimes carry. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (entity, code) => {
      const n = Number(code);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(n);
      } catch {
        return entity;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (entity, hex) => {
      const n = parseInt(hex, 16);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(n);
      } catch {
        return entity;
      }
    });
}
