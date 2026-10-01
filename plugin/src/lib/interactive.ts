/**
 * Defence in depth for the human override: an interactive terminal and no machine output. This is NOT what makes
 * the override human-only (a program can allocate a pseudo-terminal); the binding requirement is a signature by
 * the payer's owner or treasury, whose key only the human holds.
 */
const MACHINE_OUTPUT = /^--(json|toon|format)(=|$)/;

export function isInteractive(stdinTTY: boolean | undefined, stdoutTTY: boolean | undefined, argv: readonly string[]): boolean {
  return Boolean(stdinTTY && stdoutTTY) && !argv.some((a) => MACHINE_OUTPUT.test(a));
}
