// modules/testmail-api.js
// Thin fetch wrapper around the testmail.app JSON API. GET-only, query-param
// auth. Called only from inbox.js.

const BASE_URL = "https://api.testmail.app/api/json";
const GENERIC_UNREACHABLE_MESSAGE = "Couldn't reach testmail.app — try again.";

/**
 * Fetches the latest `limit` emails for a namespace.
 * @param {{ apiKey: string, namespace: string, limit?: number }} params
 * @returns {Promise<Array<object>>} the `emails` array from the response
 * @throws {Error} with a short, user-facing message on any failure
 */
export async function fetchInbox({ apiKey, namespace, limit = 40 }) {
    const url = new URL(BASE_URL);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("namespace", namespace);
    url.searchParams.set("limit", String(limit));
    // No pretty=true (only useful for manual browser testing).
    // No tag/tag_prefix filter — filtering happens client-side (§6.4).

    let response;
    try {
        response = await fetch(url.toString());
    } catch (networkErr) {
        throw new Error(GENERIC_UNREACHABLE_MESSAGE);
    }

    if (!response.ok) {
        throw new Error(GENERIC_UNREACHABLE_MESSAGE);
    }

    let data;
    try {
        data = await response.json();
    } catch (parseErr) {
        throw new Error(GENERIC_UNREACHABLE_MESSAGE);
    }

    if (data.result !== "success") {
        // Surface the API's own message field when it explains what went wrong.
        throw new Error(data.message || GENERIC_UNREACHABLE_MESSAGE);
    }

    return Array.isArray(data.emails) ? data.emails : [];
}