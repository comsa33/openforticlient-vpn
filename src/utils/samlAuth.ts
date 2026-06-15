/**
 * Parsing helpers for extracting the SAML authentication URL from the stdout of
 * `openfortivpn --saml-login`.
 *
 * These are pure, side-effect-free functions so the URL parsing — the part that
 * regressed in issue #7 — can be unit tested without a VS Code host or a live
 * gateway.
 */

/**
 * Extract the SAML authentication URL from a piece of openfortivpn output.
 * Returns null when no auth URL is present.
 *
 * openfortivpn prints the URL wrapped in quotes, e.g.
 *   Authenticate at 'https://gw.example.com/remote/saml/start?redirect=1'
 * A naive `https?://\S+` match captures the trailing quote (".../redirect=1'"),
 * which corrupts the `redirect` query parameter. The gateway then ignores it and
 * serves its web portal page ("tunnel mode use only / FortiClient required")
 * instead of starting the SAML flow (issue #7).
 *
 * @param text Output to scan (a single line, or the residual buffer).
 * @param requireTerminator When true, only a quote-terminated URL is accepted.
 *   The closing quote proves the URL was received in full, which lets us safely
 *   parse an un-terminated residual buffer without risking a truncated URL.
 */
export function extractSamlAuthUrl(text: string, requireTerminator: boolean): string | null {
    // Only consider output that looks like an auth prompt to avoid opening
    // unrelated URLs that may appear in logs.
    if (!/authenticate|saml|\/remote\/|please|login/i.test(text)) {
        return null;
    }

    // Preferred form: openfortivpn wraps the URL in quotes. The closing quote
    // guarantees the URL is complete even without a trailing newline.
    const quoted = text.match(/['"]\s*(https?:\/\/[^'"\s]+)\s*['"]/i);
    if (quoted && quoted[1]) {
        return quoted[1];
    }

    // Without a closing quote we cannot tell a complete URL from one that is
    // still streaming in, so a partial buffer must wait for more data.
    if (requireTerminator) {
        return null;
    }

    const match = text.match(/https?:\/\/[^\s]+/i);
    if (!match) {
        return null;
    }

    let url = match[0];
    // Strip wrapping/trailing punctuation that openfortivpn (or a log formatter)
    // may place around the URL: quotes, brackets, angle brackets, and sentence
    // punctuation.
    url = url.replace(/^['"<(\[]+/, '');
    url = url.replace(/['"'`.,;>)\]]+$/, '');

    return url.length > 0 ? url : null;
}

/** Largest residual buffer we keep before trimming, in characters. */
const MAX_BUFFER = 8192;
/** Amount of the tail we retain when trimming an oversized buffer. */
const BUFFER_TRIM_TAIL = 4096;

export interface SamlScanResult {
    /** The auth URL once a complete one is found, otherwise null. */
    url: string | null;
    /** The carry-over buffer to pass into the next call. */
    buffer: string;
}

/**
 * Feed the next stdout chunk into the SAML URL scanner.
 *
 * stdout arrives in arbitrary chunks, so a URL can be split across reads. We
 * accumulate into `buffer` and parse only fully terminated lines, which means a
 * split URL is never opened truncated. If the prompt arrives without a trailing
 * newline (openfortivpn can print it and then block on the callback), we fall
 * back to a quote-terminated URL in the residual buffer, which is known to be
 * complete.
 *
 * @param buffer Carry-over buffer from the previous call ('' on first call).
 * @param chunk  The newly received stdout chunk.
 */
export function scanSamlAuthOutput(buffer: string, chunk: string): SamlScanResult {
    buffer += chunk;
    let url: string | null = null;

    // Primary path: consume fully terminated lines.
    let newlineIndex: number;
    while (url === null && (newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        url = extractSamlAuthUrl(line, false);
    }

    // Fallback: quote-terminated URL in the un-terminated residual buffer.
    if (url === null) {
        url = extractSamlAuthUrl(buffer, true);
    }

    // Guard against unbounded growth if no newline ever comes.
    if (buffer.length > MAX_BUFFER) {
        buffer = buffer.slice(-BUFFER_TRIM_TAIL);
    }

    return { url, buffer };
}
