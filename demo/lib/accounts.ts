// Demo accounts, all derived from ONE seed: key(label) = keccak256(seed || utf8(label)).
//  - fork: a PUBLIC seed (the keys are test keys, worthless; never fund them on a real network);
//  - testnet: the seed is the private key of an encrypted Foundry keystore (`cast wallet import`), decrypted in
//    memory here (scrypt/pbkdf2 + aes-128-ctr, Web3 Secret Storage v3). The password comes from the env var
//    ANCRE_DEMO_PASSWORD or an interactive prompt; no key or password ever reaches a file, a log or a command line.
import { createDecipheriv, pbkdf2Sync, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { bytesToHex, concat, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { FARM_SIZE } from "./config.ts";

export const FORK_SEED = keccak256(toHex("ANCRE demo fork seed: public test keys, never fund them on a real network"));

export type Role = "operator" | "anchor" | "payer-operator" | "provider" | "farm-owner" | "farm" | "farm-target" | "rater";
export type Actor = { label: string; role: Role; account: PrivateKeyAccount };

export function derive(seed: Hex, label: string): PrivateKeyAccount {
  return privateKeyToAccount(keccak256(concat([seed, toHex(label)])));
}

/** Every account of the act. `operator` is the seed account itself on the testnet (the keystore key). */
export function demoAccounts(seed: Hex, operatorIsSeed: boolean) {
  const a = (label: string, role: Role): Actor => ({ label, role, account: derive(seed, label) });
  const operator: Actor = { label: "ANCRE operator (deployer, certifier, payer owner)", role: "operator",
    account: operatorIsSeed ? privateKeyToAccount(seed) : derive(seed, "operator") };
  const anchors = [a("anchor-A (demo)", "anchor"), a("anchor-B (demo)", "anchor"), a("anchor-C (demo)", "anchor")];
  const farm = Array.from({ length: FARM_SIZE }, (_, i) => a(`farm-${String(i + 1).padStart(2, "0")} wallet (demo)`, "farm"));
  return {
    operator,
    anchors,
    payerOperator: a("payer operator key (demo agent wallet)", "payer-operator"),
    providers: [a("provider-1 wallet (demo)", "provider"), a("provider-2 wallet (demo)", "provider")],
    farmOwner: a("farm owner (demo)", "farm-owner"),
    farmTarget: a("farm target wallet (demo)", "farm-target"),
    farm,
    rater: a("third-party rater (demo)", "rater"),
  };
}
export type DemoAccounts = ReturnType<typeof demoAccounts>;

/** Accounts that send transactions themselves (they need MON for gas). Wallet keys of agents only sign. */
export function emitters(d: DemoAccounts): Actor[] {
  return [d.operator, ...d.anchors, d.farmOwner, ...d.farm, d.rater];
}

// ---------------------------------------------------------------- keystore (testnet only)

type Keystore = {
  address?: string;
  crypto: {
    cipher: string;
    ciphertext: string;
    cipherparams: { iv: string };
    kdf: "scrypt" | "pbkdf2";
    kdfparams: { dklen: number; salt: string; n?: number; r?: number; p?: number; c?: number; prf?: string };
    mac: string;
  };
};

export function decryptKeystore(path: string, password: string): Hex {
  const ks = JSON.parse(readFileSync(path, "utf8")) as Keystore;
  const c = ks.crypto;
  if (c.cipher !== "aes-128-ctr") throw new Error(`unsupported cipher ${c.cipher}`);
  const salt = Buffer.from(c.kdfparams.salt, "hex");
  const pw = Buffer.from(password.normalize("NFKD"), "utf8");
  let dk: Buffer;
  if (c.kdf === "scrypt") {
    const { n = 0, r = 0, p = 0, dklen } = c.kdfparams;
    dk = scryptSync(pw, salt, dklen, { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 });
  } else {
    if (c.kdfparams.prf !== "hmac-sha256") throw new Error("unsupported pbkdf2 prf");
    dk = pbkdf2Sync(pw, salt, c.kdfparams.c ?? 0, c.kdfparams.dklen, "sha256");
  }
  const ct = Buffer.from(c.ciphertext, "hex");
  const mac = keccak256(concat([dk.subarray(16, 32), ct]));
  if (mac.slice(2) !== c.mac.toLowerCase()) throw new Error("keystore: wrong password (MAC mismatch)");
  const d = createDecipheriv("aes-128-ctr", dk.subarray(0, 16), Buffer.from(c.cipherparams.iv, "hex"));
  const key = Buffer.concat([d.update(ct), d.final()]);
  if (key.length !== 32) throw new Error("keystore: unexpected key length");
  return bytesToHex(new Uint8Array(key));
}

/** Password from ANCRE_DEMO_PASSWORD, or typed at the terminal (not echoed). */
export async function askPassword(prompt: string): Promise<string> {
  const env = process.env.ANCRE_DEMO_PASSWORD;
  if (env) return env;
  if (!process.stdin.isTTY) throw new Error("ANCRE_DEMO_PASSWORD is not set and stdin is not a terminal");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => { if (s.includes(prompt)) out.output.write(s); };
  const pw = await new Promise<string>((res) => rl.question(prompt, res));
  rl.close();
  process.stdout.write("\n");
  return pw;
}
