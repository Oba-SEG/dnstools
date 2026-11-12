// Fetch wrapper that survives cold starts on free-tier hosting.
//
// The Render instance spins down after ~15 min of inactivity and needs
// 50s+ to boot. A sleeping instance answers with connection-refused /
// 5xx from the gateway, which surfaces to users as "Failed to fetch".
// This wrapper retries those failures with generous gaps while the
// instance boots, surfacing progress via the optional onNote callback.
// Real client errors (4xx, incl. 429 rate limits) are returned as-is.
export async function fetchResilient(
  url: string,
  init?: RequestInit,
  onNote?: (msg: string) => void,
): Promise<Response> {
  const ATTEMPTS = 3;
  const GAPS_MS = [10_000, 15_000];
  let lastErr: unknown;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < ATTEMPTS) {
      const wait = GAPS_MS[attempt - 1];
      onNote?.(`Waking the API… retrying (${attempt + 1}/${ATTEMPTS})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Request failed");
}
