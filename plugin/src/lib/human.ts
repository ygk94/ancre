import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

/**
 * Human signing bridge for the override (D47). A one-time page on 127.0.0.1 asks the human's OWN MetaMask
 * extension (window.ethereum in their browser) to sign an EIP-3009 TransferWithAuthorization from their personal
 * wallet. The plugin never sees a key, never uses the Agent Wallet executor, and never touches the payer contract.
 * An agent has no browser extension with the human's account: it cannot produce this signature.
 */
export type HumanSignRequest = {
  chainId: number;
  summary: string; // shown on the page
  /** called when the human clicks: returns the typed data to sign (message.from is filled with the connected
   *  account), so that the validity window starts when the human acts, not when the page was opened */
  prepare: () => { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> };
  timeoutMs?: number;
  onUrl: (url: string) => void; // print it / open it
};

/** `template` is the typed data the plugin issued (held server-side, never taken back from the page). */
export type HumanSignature = { address: `0x${string}`; signature: `0x${string}`; template: Record<string, unknown> };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(req: HumanSignRequest, token: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANCRE human override</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#111;background:#fff}
.box{border:2px solid #b00;padding:16px;border-radius:8px}button{font-size:16px;padding:10px 18px;margin-top:12px}pre{white-space:pre-wrap;background:#f4f4f4;padding:8px}</style></head>
<body><div class="box"><h2>Human override: you pay, not ANCRE</h2>
<p>${esc(req.summary)}</p>
<p>This signs a USDC payment <b>from your own MetaMask wallet</b>. The agent cannot sign it, and the ANCRE payer contract is not used.</p>
<button id="b">Connect MetaMask and sign</button><pre id="o"></pre></div>
<script>
const out = (t) => (document.getElementById("o").textContent = t);
document.getElementById("b").onclick = async () => {
  try {
    if (!window.ethereum) return out("MetaMask extension not found in this browser.");
    const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
    const want = "0x" + (${req.chainId}).toString(16);
    if ((await window.ethereum.request({ method: "eth_chainId" })) !== want)
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
    const td = await (await fetch("/template?t=${token}")).json();
    td.message.from = account;
    const signature = await window.ethereum.request({ method: "eth_signTypedData_v4", params: [account, JSON.stringify(td)] });
    const r = await fetch("/done?t=${token}", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account, signature }) });
    out(r.ok ? "Signed. You can close this tab and go back to the terminal." : "The plugin refused: " + (await r.text()));
  } catch (e) { out("Not signed: " + (e && e.message ? e.message : e)); }
};
</script></body></html>`;
}

export function humanSign(req: HumanSignRequest): Promise<HumanSignature> {
  const token = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    let settled = false;
    let issued: ReturnType<HumanSignRequest["prepare"]> | undefined;
    const server = createServer((r, w) => {
      const u = new URL(r.url ?? "/", "http://127.0.0.1");
      if (u.searchParams.get("t") !== token) return w.writeHead(403).end("bad token");
      if (r.method === "GET" && u.pathname === "/") {
        return w.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(page(req, token));
      }
      if (r.method === "GET" && u.pathname === "/template" && !settled) {
        issued = req.prepare();
        return w.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(issued));
      }
      if (r.method === "POST" && u.pathname === "/done" && !settled && issued) {
        let body = "";
        r.on("data", (c) => (body += c));
        r.on("end", () => {
          try {
            const posted = JSON.parse(body) as { address: `0x${string}`; signature: `0x${string}` };
            settled = true;
            w.writeHead(200).end("ok");
            server.close();
            resolve({ address: posted.address, signature: posted.signature, template: issued as Record<string, unknown> });
          } catch {
            w.writeHead(400).end("bad body");
          }
        });
        return;
      }
      w.writeHead(404).end();
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      server.close();
      reject(new Error("no human signature before the timeout"));
    }, req.timeoutMs ?? 5 * 60_000);
    timer.unref?.();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      req.onUrl(`http://127.0.0.1:${port}/?t=${token}`);
    });
  });
}
