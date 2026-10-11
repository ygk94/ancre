// /mera — P4 prototype (ROADMAP 06-E3): does the synced passkey give the SAME PRF output, hence the same epoch
// keys, on the Mac and on the iPhone, for rpId ancre-xyz.netlify.app? Nothing leaves the browser: the page makes
// no network request (CSP connect-src 'none' in netlify.toml) and only the public credential ID is stored.
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { useEffect, useMemo, useState } from "react";
import {
  deriveEpochPublic,
  epochSalt,
  epochSaltLabel,
  formatReport,
  parseReport,
  PROTO_LABEL,
  sameAddress,
  type EpochPublic,
} from "./derive";
import { browserLabel, DEFINITIVE_RP_ID, explainError, probeCapabilities, rpInfo, type Capabilities } from "./env";

const EPOCHS = [0, 1] as const;
const STORE_KEY = "ancre.mera.p4.credential";

function loadPinned(): PasskeyCredentialMetadata | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PasskeyCredentialMetadata;
    return typeof v?.credentialId === "string" && v.credentialId.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function savePinned(c: PasskeyCredentialMetadata | null) {
  try {
    if (c) localStorage.setItem(STORE_KEY, JSON.stringify({ credentialId: c.credentialId, transports: c.transports }));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* private mode: pinning just won't survive a reload */
  }
}

const shortId = (id: string) => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id);
const flag = (v: boolean | "unknown") => (v === "unknown" ? "unknown" : v ? "yes" : "no");

type Derived = { credentialId: string; epochs: EpochPublic[] };

export function MeraProto() {
  const rp = useMemo(() => rpInfo(location.hostname), []);
  const browser = useMemo(() => browserLabel(navigator.userAgent), []);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [pinned, setPinned] = useState<PasskeyCredentialMetadata | null>(loadPinned);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ credentialId: string; epoch0: EpochPublic } | null>(null);
  const [derived, setDerived] = useState<Derived | null>(null);
  const [reference, setReference] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    probeCapabilities().then(setCaps, () => setCaps({ webauthn: false, platformAuthenticator: false, prfReported: false }));
  }, []);

  const canRun = rp.definitive || rp.local;

  async function onCreate() {
    if (pinned && !confirm("A passkey is already pinned on this device. Each creation ADDS a new passkey (different keys). Create another one anyway?"))
      return;
    setError(null);
    setBusy("Creating the passkey (1 or 2 prompts)…");
    try {
      const res = await createPasskeyWithPrfOutput({
        rp: { id: rp.rpId, name: "ANCRE" },
        user: { name: "ancre-anchor-p4", displayName: "ANCRE anchor key (P4 prototype)" },
        prfSalt: epochSalt(PROTO_LABEL, 0),
      });
      const cred: PasskeyCredentialMetadata = { credentialId: res.credentialId, transports: res.transports };
      // The creation ceremony already evaluated epoch 0: derive it to cross-check create-time vs get-time PRF.
      const epoch0 = deriveEpochPublic(res.prfOutput);
      savePinned(cred);
      setPinned(cred);
      setCreated({ credentialId: res.credentialId, epoch0 });
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(null);
    }
  }

  // One click per epoch: Safari (macOS) refuses a second WebAuthn call that is not started by its own user gesture
  // (NotAllowedError), so epoch 1 gets its own button instead of chaining two prompts from one click.
  async function onDerive() {
    setError(null);
    const n = derived && derived.epochs.length < EPOCHS.length ? derived.epochs.length : 0;
    if (n === 0) setDerived(null);
    setBusy(`Deriving epoch ${n} (one Touch ID / Face ID prompt)…`);
    try {
      const cred = n > 0 && derived ? { credentialId: derived.credentialId } : (pinned ?? undefined);
      const res = await getPasskeyPrfOutput({ rpId: rp.rpId, credential: cred, prfSalt: epochSalt(PROTO_LABEL, n) });
      if (n > 0 && derived && res.credentialId !== derived.credentialId) {
        res.prfOutput.fill(0);
        throw new Error("A different passkey answered for epoch 1: start again from epoch 0 and pick the same passkey.");
      }
      const epoch = deriveEpochPublic(res.prfOutput); // zeroes prfOutput
      const next: Derived = { credentialId: res.credentialId, epochs: n === 0 ? [epoch] : [...(derived?.epochs ?? []), epoch] };
      if (!pinned) {
        const c = { credentialId: res.credentialId };
        savePinned(c);
        setPinned(c);
      }
      setDerived(next);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(null);
    }
  }

  function onForget() {
    savePinned(null);
    setPinned(null);
    setCreated(null);
    setDerived(null);
  }

  async function onCopy() {
    if (!derived) return;
    try {
      await navigator.clipboard.writeText(formatReport(derived.epochs.map((e) => e.address)));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard unavailable: select the report text and copy it by hand.");
    }
  }

  const ref = useMemo(() => parseReport(reference), [reference]);
  const verdicts = EPOCHS.map((n) => {
    const mine = derived?.epochs[n]?.address;
    const theirs = ref[n];
    if (!mine || !theirs) return null;
    return sameAddress(mine, theirs);
  });
  const allMatch = verdicts.every((v) => v === true);
  const complete = !!derived && derived.epochs.length === EPOCHS.length;
  const distinct = complete ? derived.epochs[0].address.toLowerCase() !== derived.epochs[1].address.toLowerCase() : null;
  const createVsGet =
    created && derived && created.credentialId === derived.credentialId
      ? sameAddress(created.epoch0.address, derived.epochs[0].address)
      : null;

  return (
    <main className="mp">
      <h1>ANCRE · passkey PRF check</h1>
      <p className="muted">
        Prototype P4: does the same synced passkey re-derive the same anchor epoch keys on another device? Nothing is
        sent to any server; only the public passkey ID is kept in this browser.
      </p>

      <section className="card">
        <h2>Environment</h2>
        <dl>
          <dt>rpId</dt>
          <dd className="mono">
            {rp.rpId} {rp.definitive ? <span className="ok">✓ definitive</span> : rp.local ? <span className="warn">⚠ local only</span> : <span className="bad">✗ not the definitive rpId</span>}
          </dd>
          <dt>Browser</dt>
          <dd>{browser}</dd>
          <dt>WebAuthn</dt>
          <dd>{caps ? flag(caps.webauthn) : "…"}</dd>
          <dt>Platform authenticator</dt>
          <dd>{caps ? flag(caps.platformAuthenticator) : "…"}</dd>
          <dt>PRF (reported)</dt>
          <dd>
            {caps ? flag(caps.prfReported) : "…"} <span className="muted">— only a real ceremony proves it</span>
          </dd>
          <dt>Pinned passkey</dt>
          <dd className="mono">{pinned ? shortId(pinned.credentialId) : "none (the platform will let you pick)"}</dd>
        </dl>
        {!canRun && (
          <p className="bad">
            This host is not {DEFINITIVE_RP_ID}. Keys derived here would not be comparable: open https://{DEFINITIVE_RP_ID}/mera
          </p>
        )}
        {rp.local && <p className="warn">localhost is a separate passkey world: results will never match production.</p>}
        {caps && !caps.webauthn && <p className="bad">This browser has no WebAuthn: the test cannot run here.</p>}
      </section>

      {busy && <p className="busy" role="status">{busy}</p>}
      {error && (
        <p className="bad" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h2>1 · Create passkey</h2>
        <p className="muted">Once, on the Mac only. Then wait until it shows up on the iPhone (iCloud Keychain).</p>
        <button className="btn" disabled={!!busy || !canRun || caps?.webauthn === false} onClick={onCreate}>
          Create passkey
        </button>
        {created && (
          <p className="ok">
            Passkey created <span className="mono">{shortId(created.credentialId)}</span>. Epoch 0 at creation:{" "}
            <span className="mono addr">{created.epoch0.address}</span>
          </p>
        )}
      </section>

      <section className="card">
        <h2>2 · Derive epoch 0 and epoch 1</h2>
        <p className="muted">One click and one Face ID / Touch ID prompt per epoch (one PRF salt each).</p>
        <button className="btn" disabled={!!busy || !canRun || caps?.webauthn === false} onClick={onDerive}>
          {derived && !complete ? "Derive epoch 1" : complete ? "Start again: derive epoch 0" : "Derive epoch 0"}
        </button>
        {derived && (
          <>
            <p>
              Passkey that answered: <span className="mono">{shortId(derived.credentialId)}</span>
            </p>
            {derived.epochs.map((e, n) => (
              <div className="epoch" key={n}>
                <div className="muted mono small">salt = sha256("{epochSaltLabel(PROTO_LABEL, n)}")</div>
                <div>
                  Epoch {n} address: <span className="mono addr">{e.address}</span>
                </div>
                <div>
                  Fingerprint: <span className="mono fp">{e.fingerprint}</span>
                </div>
              </div>
            ))}
            {complete && <p className={distinct ? "ok" : "bad"}>{distinct ? "✓ The two epochs give two unrelated keys." : "✗ Both epochs gave the same key: salts are not isolated."}</p>}
            {createVsGet !== null && (
              <p className={createVsGet ? "ok" : "bad"}>
                {createVsGet ? "✓ Epoch 0 at creation = epoch 0 now." : "✗ Epoch 0 at creation differs from epoch 0 now."}
              </p>
            )}
            {complete && (
              <>
                <div className="report mono">{formatReport(derived.epochs.map((e) => e.address))}</div>
                <button className="btn secondary" onClick={onCopy}>
                  {copied ? "Copied" : "Copy report"}
                </button>
              </>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>3 · Compare with the other device</h2>
        <p className="muted">Paste the Mac's report (or its two addresses, epoch 0 first), then run step 2 here.</p>
        <textarea
          rows={3}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="ancre-p4 e0=0x… e1=0x…"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {EPOCHS.map((n) => (
          <div key={n} className="verdict">
            Epoch {n}:{" "}
            {verdicts[n] === null ? (
              <span className="muted">{ref[n] ? "run step 2 on this device" : "no reference address"}</span>
            ) : verdicts[n] ? (
              <span className="ok big">✓ MATCH</span>
            ) : (
              <span className="bad big">✗ MISMATCH</span>
            )}
          </div>
        ))}
        {allMatch && <p className="ok big">P4 passes: the passkey re-derives both epoch keys on this device.</p>}
      </section>

      <p className="muted small">
        <button className="link" onClick={onForget}>
          Forget pinned passkey
        </button>{" "}
        (only removes the public ID stored in this browser; the passkey itself stays in your keychain).
      </p>
    </main>
  );
}
