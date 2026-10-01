// Minimal x402 v2 resource server for the demo: one route per provider, `exact` USDC, the provider's ERC-8004
// agentId advertised in the NON-STANDARD offer field extra.erc8004AgentId (ANCRE proposal). Default flow
// `authorization`: /verify, then the handler, then /settle; the response is returned only if /settle succeeds.
// Settlement: the real facilitator (facilitatorUrl) or an emulated one (settleLocal), never our own key.
import { createServer } from "node:http";
import { decodeB64Json, encodeB64Json } from "../dist/lib/x402.js";

/**
 * @param routes { "/good": { payTo, agentId, amount, body } }
 * @param facilitator (phase, paymentPayload, paymentRequirements) => Promise<{ok, ...}>
 * @param hooks.beforeSettle optional async () => void (demo: an anchor vetoes between /verify and /settle)
 */
export function startX402Server({ port = 4021, network, usdc, routes, facilitator, hooks = {}, log = () => {} }) {
  const server = createServer(async (req, res) => {
    const route = routes[req.url];
    if (!route) return res.writeHead(404).end();
    const requirements = { scheme: "exact", network, amount: route.amount, asset: usdc, payTo: route.payTo, maxTimeoutSeconds: 120,
      extra: { name: "USDC", version: "2", erc8004AgentId: String(route.agentId) } };
    const challenge = { x402Version: 2, resource: { url: `http://127.0.0.1:${port}${req.url}`, description: route.description ?? req.url }, accepts: [requirements] };
    const sig = req.headers["payment-signature"];
    if (!sig) {
      log({ route: req.url, http: 402 });
      return res.writeHead(402, { "PAYMENT-REQUIRED": encodeB64Json(challenge), "content-type": "application/json" }).end("{}");
    }
    let payload;
    try {
      payload = decodeB64Json(sig);
    } catch {
      return res.writeHead(400).end('{"error":"invalid_payload"}');
    }
    const v = await facilitator("verify", payload, requirements);
    log({ route: req.url, verify: v });
    if (!v.ok) return res.writeHead(402, { "PAYMENT-REQUIRED": encodeB64Json({ ...challenge, error: "verify failed" }) }).end(JSON.stringify(v));
    const body = JSON.stringify(route.body ?? { ok: true });
    if (hooks.beforeSettle) await hooks.beforeSettle(req.url);
    const s = await facilitator("settle", payload, requirements);
    log({ route: req.url, settle: s });
    if (!s.ok) return res.writeHead(402, { "PAYMENT-REQUIRED": encodeB64Json({ ...challenge, error: "settle failed" }) }).end(JSON.stringify(s));
    const settle = { success: true, transaction: s.hash ?? s.transaction, network, payer: payload.payload?.authorization?.from };
    return res.writeHead(200, { "PAYMENT-RESPONSE": encodeB64Json(settle), "content-type": "application/json" }).end(body);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() })));
}

/** The real facilitator (x402 v2 HTTP API). */
export function httpFacilitator(url) {
  return async (phase, paymentPayload, paymentRequirements) => {
    const res = await fetch(`${url}/${phase}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements }) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && (json.isValid === true || json.success === true), httpStatus: res.status, transaction: json.transaction, response: json };
  };
}
