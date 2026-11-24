/**
 * Development: rebuilds dist/ on every change (pages + worker, and content script).
 * Load dist/ as an unpacked extension once, then hit the reload button in
 * chrome://extensions (or Cmd+R on the popup) to pick up changes.
 */
import { spawn } from 'node:child_process';

const run = (args) =>
  spawn('npx', ['vite', 'build', '--watch', '--mode', 'development', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

const pages = run([]);
// Give the first build a head start: it empties dist/ before the content build writes into it.
setTimeout(() => {
  const content = run(['--config', 'vite.content.config.ts']);
  const stop = () => {
    pages.kill();
    content.kill();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}, 4000);
