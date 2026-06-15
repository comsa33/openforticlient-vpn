import * as assert from 'assert';
import { extractSamlAuthUrl, scanSamlAuthOutput } from '../utils/samlAuth';

const URL = 'https://gw.example.com/remote/saml/start?redirect=1';

suite('extractSamlAuthUrl', () => {
    test('strips the wrapping single quotes openfortivpn prints (issue #7)', () => {
        const line = `Authenticate at '${URL}'`;
        assert.strictEqual(extractSamlAuthUrl(line, false), URL);
    });

    test('preserves the redirect query parameter intact', () => {
        const line = `Authenticate at '${URL}'`;
        const result = extractSamlAuthUrl(line, false);
        assert.ok(result && result.endsWith('redirect=1'), 'redirect param must survive');
        assert.ok(result && !result.includes("'"), 'no quote may leak into the URL');
    });

    test('handles double quotes', () => {
        assert.strictEqual(extractSamlAuthUrl(`Please authenticate at "${URL}"`, false), URL);
    });

    test('handles an unquoted URL terminated by whitespace', () => {
        assert.strictEqual(extractSamlAuthUrl(`Please authenticate at ${URL}`, false), URL);
    });

    test('strips trailing sentence punctuation from an unquoted URL', () => {
        assert.strictEqual(extractSamlAuthUrl(`Authenticate at ${URL}.`, false), URL);
    });

    test('accepts a quote-terminated URL when a terminator is required', () => {
        assert.strictEqual(extractSamlAuthUrl(`Authenticate at '${URL}'`, true), URL);
    });

    test('rejects an unquoted (possibly truncated) URL when a terminator is required', () => {
        assert.strictEqual(extractSamlAuthUrl(`Authenticate at ${URL}`, true), null);
    });

    test('returns null for unrelated output', () => {
        assert.strictEqual(extractSamlAuthUrl('Tunnel is up and running', false), null);
        assert.strictEqual(extractSamlAuthUrl('VPN output: connecting...', false), null);
    });
});

suite('scanSamlAuthOutput', () => {
    test('finds the URL in a single newline-terminated chunk', () => {
        const { url } = scanSamlAuthOutput('', `Authenticate at '${URL}'\n`);
        assert.strictEqual(url, URL);
    });

    test('reassembles a URL split across stdout chunks', () => {
        const full = `Authenticate at '${URL}'\n`;
        const mid = Math.floor(full.length / 2);
        let { url, buffer } = scanSamlAuthOutput('', full.slice(0, mid));
        assert.strictEqual(url, null, 'must wait for the rest of the URL');
        ({ url, buffer } = scanSamlAuthOutput(buffer, full.slice(mid)));
        assert.strictEqual(url, URL);
    });

    test('opens a quote-terminated URL even without a trailing newline', () => {
        const { url } = scanSamlAuthOutput('', `Authenticate at '${URL}'`);
        assert.strictEqual(url, URL);
    });

    test('does not open a truncated, unterminated URL', () => {
        const { url } = scanSamlAuthOutput('', 'Authenticate at https://gw.example.com/remote/sa');
        assert.strictEqual(url, null);
    });

    test('finds the URL after unrelated leading lines', () => {
        const chunk = 'Connecting...\nReading password\n' + `Authenticate at '${URL}'\n`;
        const { url } = scanSamlAuthOutput('', chunk);
        assert.strictEqual(url, URL);
    });

    test('trims an oversized buffer but still finds a later complete URL', () => {
        let { buffer } = scanSamlAuthOutput('', 'x'.repeat(9000));
        assert.ok(buffer.length <= 8192, 'buffer must be trimmed');
        const { url } = scanSamlAuthOutput(buffer, `Authenticate at '${URL}'\n`);
        assert.strictEqual(url, URL);
    });
});
