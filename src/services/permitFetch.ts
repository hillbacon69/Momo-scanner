export type PermitSourceType = "qr-text" | "qr-url";

export interface ResolvedPermitSource {
  sourceType: PermitSourceType;
  rawText: string;
  sourceUrl?: string;
}

export class PermitFetchError extends Error {
  code: "pdf-unsupported" | "fetch-failed" | "empty-response";

  constructor(message: string, code: PermitFetchError["code"]) {
    super(message);
    this.name = "PermitFetchError";
    this.code = code;
  }
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * Turns whatever the QR code decoded to into raw route text.
 * Oversize/overweight permit QR codes are not standardized across
 * states: some encode the full permit text directly, others just
 * link to a state portal page (or occasionally a PDF) that has to be
 * fetched. This handles both without assuming which one a given
 * permit uses.
 */
export async function resolvePermitQrPayload(
  qrData: string
): Promise<ResolvedPermitSource> {
  const trimmed = qrData.trim();

  if (URL_PATTERN.test(trimmed)) {
    const rawText = await fetchTextFromUrl(trimmed);
    return { sourceType: "qr-url", rawText, sourceUrl: trimmed };
  }

  return { sourceType: "qr-text", rawText: trimmed };
}

async function fetchTextFromUrl(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml,text/plain,application/pdf" },
    });
  } catch (err) {
    throw new PermitFetchError(
      `Couldn't reach the permit page (${(err as Error).message}). Check your connection or use "Paste Route Text" instead.`,
      "fetch-failed"
    );
  }

  if (!response.ok) {
    throw new PermitFetchError(
      `Permit page returned an error (HTTP ${response.status}). Use "Paste Route Text" to enter the route manually.`,
      "fetch-failed"
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("pdf")) {
    throw new PermitFetchError(
      'This QR code links to a PDF permit. Automatic text extraction from PDFs isn\'t supported yet - open the PDF, copy the route section, and use "Paste Route Text" instead.',
      "pdf-unsupported"
    );
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new PermitFetchError(
      "The permit page came back empty. Use \"Paste Route Text\" to enter the route manually.",
      "empty-response"
    );
  }

  return contentType.includes("html") ? htmlToText(body) : body;
}

/** Best-effort HTML -> plain text: strips scripts/styles/tags, decodes common entities, collapses whitespace. */
export function htmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const withBreaks = withoutScripts
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

  const withoutTags = withBreaks.replace(/<[^>]+>/g, " ");

  const decoded = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return decoded
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
