/**
 * Defence in depth for the human override: an interactive terminal and no machine output. This is NOT what makes
 * the override human-only (a program can allocate a pseudo-terminal); the binding requirement is a signature by
 * the payer's owner or treasury, whose key only the human holds.
 *
 * The host decides the renderer from --json/--toon, --format X, --format=X, -f X, -f=X, -fX and the persistent
 * `mm config set format json`: `hostInteractive` is the host's own answer (io.isInteractive, false whenever mm
 * chose the headless renderer), the argv test only a second net (A4e).
 */
const MACHINE_OUTPUT = /^(--(json|toon|format)(=|$)|-f($|=|\S))/;

export function isInteractive(
  stdinTTY: boolean | undefined,
  stdoutTTY: boolean | undefined,
  argv: readonly string[],
  hostInteractive: boolean | undefined,
): boolean {
  return hostInteractive === true && Boolean(stdinTTY && stdoutTTY) && !argv.some((a) => MACHINE_OUTPUT.test(a));
}
