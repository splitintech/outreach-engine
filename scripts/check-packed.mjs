// Verify the actual npm artifacts in a new consumer, without workspace links.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const outreach = manifest.name === 'outreach-engine';
const directories = outreach
  ? readdirSync(join(root, 'packages')).map(name => join(root, 'packages', name)).filter(path => !JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).private)
  : [root];
const temp = mkdtempSync(join(tmpdir(), 'standalone-packed-'));
try {
  const packages = directories.map(path => JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')));
  const tarballs = directories.map(path => {
    const result = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temp], { cwd: path, encoding: 'utf8' }))[0];
    for (const required of ['README.md', 'LICENSE']) assert(result.files.some(file => file.path === required), `Missing ${required}`);
    assert(!result.files.some(file => /(^|\/)(\.env|.*\.db(?:-wal|-shm)?$)/.test(file.path)), 'Unexpected private state in package');
    return join(temp, result.filename);
  });
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ name: 'standalone-consumer', private: true, type: 'module' }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], { cwd: temp, stdio: 'pipe' });
  const specifiers = packages.flatMap(pkg => Object.entries(pkg.exports ?? {}).filter(([key]) => !key.endsWith('.css')).map(([key]) => key === '.' ? pkg.name : pkg.name + key.slice(1)));
  writeFileSync(join(temp, 'imports.mjs'), `import assert from 'node:assert/strict';\nimport {createRequire} from 'node:module';\nconst require=createRequire(import.meta.url);\nfor(const name of ${JSON.stringify(specifiers)}) { assert(Object.keys(await import(name)).length > 0, name); assert(Object.keys(require(name)).length > 0, name); }\n`);
  execFileSync(process.execPath, ['imports.mjs'], { cwd: temp, stdio: 'inherit' });
  for (const pkg of packages) for (const target of Object.values(pkg.bin ?? {})) assert(existsSync(join(temp, 'node_modules', pkg.name, target)));
  if (manifest.name === '@splitin/group-share') {
    const cli = join(temp, 'node_modules/@splitin/group-share/dist/cli.js');
    const help = spawnSync(process.execPath, [cli], { cwd: temp, encoding: 'utf8', env: { ...process.env, GROUP_SHARE_DATA_DIR: temp } });
    assert.equal(help.status, 0);
    assert.match(help.stdout + help.stderr, /Usage:/);
  }
  if (manifest.name === '@splitin/jpmc-zelle-quick-pay') assert(readFileSync(join(temp, 'node_modules/@splitin/jpmc-zelle-quick-pay/dist/styles.css'), 'utf8').length > 0);
  if (outreach) {
    const db = join(temp, 'synthetic.db');
    execFileSync(process.execPath, [join(temp, 'node_modules/@splitin/outreach-cli/dist/bin.js'), 'init', '--db', db], { cwd: temp, stdio: 'pipe' });
    writeFileSync(join(temp, 'mcp.mjs'), `import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const transport=new StdioClientTransport({command:process.execPath,args:[${JSON.stringify(join(temp,'node_modules/@splitin/outreach-mcp/dist/bin.js'))},'--db',${JSON.stringify(db)}],stderr:'pipe'});
const client=new Client({name:'packed-consumer',version:'1'});
try { await client.connect(transport); assert.equal((await client.listTools()).tools.length,10); const result=await client.callTool({name:'outreach_status',arguments:{}}); assert(!result.isError); } finally { await client.close(); await transport.close(); }
`);
    execFileSync(process.execPath, ['mcp.mjs'], { cwd: temp, stdio: 'inherit' });
  }
  console.log(`Installed ${packages.length} tarballs; ${specifiers.length} entry points passed ESM/CommonJS checks${outreach ? '; installed CLI initialization and MCP handshake passed' : ''}.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
