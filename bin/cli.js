#!/usr/bin/env node
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const { Watcher, CLAUDE_DIR, CODEX_DIR } = require('../src/watcher');
const { createServer, snapshot } = require('../src/server');
const pkg = require('../package.json');

const HELP = `whatsmyagentdoing ${pkg.version}
See what every Claude Code and Codex agent on this machine is doing, live.

Usage: npx whatsmyagentdoing [options]

Options:
  -p, --port <n>    Port to serve on (default 4545)
  --hours <n>       Show sessions active in the last n hours (default 24)
  --no-open         Don't open the browser
  --private         Hide prompts, replies and titles; show status only
  --json            Print one snapshot as JSON and exit
  -h, --help        Show this help

Reads (never writes):
  ${CLAUDE_DIR}
  ${CODEX_DIR}
Override with CLAUDE_CONFIG_DIR / CODEX_HOME.`;

function parseArgs(argv) {
  const o = { port: 4545, hours: 24, open: true, privacy: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a === '-v' || a === '--version') { console.log(pkg.version); process.exit(0); }
    else if (a === '-p' || a === '--port') o.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) o.port = Number(a.slice(7));
    else if (a === '--hours') o.hours = Number(argv[++i]);
    else if (a.startsWith('--hours=')) o.hours = Number(a.slice(8));
    else if (a === '--no-open') o.open = false;
    else if (a === '--private') o.privacy = true;
    else if (a === '--json') o.json = true;
    else { console.error(`Unknown option: ${a}\n\n${HELP}`); process.exit(1); }
  }
  if (!Number.isFinite(o.port) || !Number.isFinite(o.hours)) { console.error(HELP); process.exit(1); }
  return o;
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {}
}

function alreadyRunning(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 800 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body.includes('whatsmyagentdoing')));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  const o = parseArgs(process.argv.slice(2));

  if (o.json) {
    const w = new Watcher({ hours: o.hours });
    w.tick();
    w.lastScan = 0;
    w.tick();
    console.log(JSON.stringify(snapshot(w, o).sessions, null, 2));
    return;
  }

  if (await alreadyRunning(o.port)) {
    const url = `http://localhost:${o.port}`;
    console.log(`Already running at ${url}`);
    if (o.open) openBrowser(url);
    return;
  }

  const watcher = new Watcher({ hours: o.hours }).start();
  const server = createServer(watcher, o);

  const listen = (port, tries) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && tries > 0) listen(port + 1, tries - 1);
      else { console.error(err.message); process.exit(1); }
    });
    server.listen(port, '127.0.0.1', () => {
      const url = `http://localhost:${port}`;
      const n = watcher.sessions().length;
      console.log(`whatsmyagentdoing → ${url}  (${n} session${n === 1 ? '' : 's'} in the last ${o.hours}h, Ctrl+C to stop)`);
      if (o.open) openBrowser(url);
    });
  };
  listen(o.port, 10);
}

main();
