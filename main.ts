// Token Launch Radar (radar-2), Node 22, standard library only.
//
// Run it from the repository root, with the sealed snapshot beside it or at /input:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// What one run does, in order:
//   1. reads the snapshot and scores every rankable pre-token protocol (lib/model.ts),
//   2. refuses to write a board the gate would refuse,
//   3. writes board.json and data.js, copies dashboard/ and screenshots/ across,
//   4. writes dossier.json last, with the vendored make.fun library, so the scorer can
//      rebuild it byte for byte from the same /output.
//
// The run is deterministic: the same snapshot always writes the same bytes, so the grader's two
// runs agree. Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Stop with a message on stderr and a non-zero exit. */
function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

/** Print the usage and exit. */
function usage(): never {
  process.stdout.write(
    `token radar: build the ranked board from a sealed snapshot\n` +
      `  node main.ts --input <snapshot.json|directory> [--output <dir>]\n` +
      `  MAKEFUN_OUTPUT_DIR=<dir> node main.ts --input <snapshot.json>\n` +
      `Defaults: --input /input, --output $MAKEFUN_OUTPUT_DIR or /output.\n` +
      `Reads /input/snapshot.json, writes board.json, data.js, dashboard/, screenshots/ and dossier.json.\n`,
  );
  process.exit(0);
}

/** The value of `--name <value>` or `--name=<value>`, else the fallback. */
function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

/** Copy a directory's regular files into `to`, skipping dot-names, and return what was copied. */
function copyDirectory(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** One run of the radar, from the snapshot at `inputFile` to the directory `outDir`. */
function run(inputFile: string, outDir: string): void {
  if (!existsSync(inputFile)) {
    fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
  }
  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));

  const dashboardFiles = copyDirectory(join(here, 'dashboard'), join(outDir, 'dashboard'));
  if (!dashboardFiles.includes('index.html')) fail('dashboard/ holds no index.html');
  if (!dashboardFiles.some((f) => f.endsWith('.css'))) fail('dashboard/ holds no .css file');
  if (!dashboardFiles.some((f) => f.endsWith('.js'))) fail('dashboard/ holds no .js file');

  const shots = copyDirectory(join(here, 'screenshots'), join(outDir, 'screenshots'));
  if (shots.length < 3) {
    fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${dashboardFiles.length} files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
  );
}

if (process.argv.includes('--help') || process.argv.includes('-h')) usage();

const inputArg = option('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
const outDir = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
run(inputFile, outDir);
