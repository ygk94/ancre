import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import semver from "semver";
import { PluginManifestSchema } from "@metamask/agent-wallet/plugin";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("mm manifest passes the official schema", () => {
  const r = PluginManifestSchema.safeParse(pkg.mm);
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test("minCliVersion accepts 6.2.0 and 7.0.0 (\"^6.2.0\" would reject 7.0.0), not 8", () => {
  const range = pkg.mm.minCliVersion;
  for (const v of ["6.2.0", "6.2.1", "7.0.0"]) assert.ok(semver.satisfies(v, range, { includePrerelease: true }), v);
  assert.ok(!semver.satisfies("8.0.0", range, { includePrerelease: true }));
  assert.ok(!semver.satisfies("7.0.0", "^6.2.0", { includePrerelease: true }), "the template's range really excludes 7.0.0");
  assert.equal(pkg.peerDependencies["@metamask/agent-wallet"], range);
});

test("every manifest command has a compiled class with the same pluginCommandId, and capabilities are minimal", () => {
  assert.deepEqual(pkg.mm.capabilities, [], "global capabilities would merge into every command");
  for (const c of pkg.mm.commands) {
    const file = new URL(`../dist/commands/${c.id.replaceAll(":", "/")}.js`, import.meta.url);
    assert.ok(existsSync(file), `missing ${file.pathname}`);
    assert.match(readFileSync(file, "utf8"), new RegExp(`pluginCommandId = "${c.id}"`));
    const writes = c.capabilities.includes("wallet-submit");
    assert.equal(writes, ["ancre:pay", "ancre:payer:fund"].includes(c.id), `${c.id}: wallet-submit only where we sign`);
  }
  const manifest = JSON.parse(readFileSync(new URL("../oclif.manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.commands).sort(), pkg.mm.commands.map((c) => c.id).sort());
  assert.equal(pkg.oclif.hooks, undefined, "PLUGIN_HOOKS_FORBIDDEN");
  assert.equal(pkg.oclif.plugins, undefined, "PLUGIN_HOOKS_FORBIDDEN");
});
