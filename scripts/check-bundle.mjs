#!/usr/bin/env node
/**
 * Verifies the bundled Action is self-contained.
 *
 * ncc silently emits webpackMissingModule stubs when a dependency cannot be
 * bundled (this happened with ESM-only @actions/* packages). A stub crashes
 * the Action at startup on the runner, so this gate fails the build when the
 * bundle contains one.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const bundlePath = resolve(process.argv[2] ?? 'dist/action/index.js');
const bundle = readFileSync(bundlePath, 'utf8');

if (bundle.includes('webpackMissingModule')) {
  console.error(`FAIL: ${bundlePath} contains webpackMissingModule stubs (unbundled dependency).`);
  process.exit(1);
}
if (!bundle.includes('Octokit')) {
  console.error(
    `FAIL: ${bundlePath} does not contain the @octokit/rest implementation (expected bundled).`,
  );
  process.exit(1);
}
console.log(`OK: ${bundlePath} is self-contained (${(bundle.length / 1024).toFixed(0)} KiB).`);
