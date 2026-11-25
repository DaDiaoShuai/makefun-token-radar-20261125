// Token radar model: snapshot in, ranked board out.
//
// Idea: a pre-token protocol is worth what the market already pays for the
// same kind of protocol that does have a token. So the sector multiple is
// not picked by hand: it is the median market-cap / TVL of the live-token
// protocols in the same category inside this very snapshot (at least five
// peers, otherwise the whole live set's median), winsorised to [0.05, 0.60]
// so one tiny-TVL outlier cannot set the price. Everything else follows
// from the protocol's own record: its TVL, its 7-day growth, how long it
// has run with no token, and how many chains it runs on. No protocol name
// is ever special-cased; the same function scores every row.
//
//   implied = TVL x sectorMultiple x growthMult x maturityMult x breadthMult
//
//   sectorMultiple  median live mcap/TVL of the category, clamped [0.05, 0.60]
//   growthMult      1 + 0.6 x clamp(change_7d, -50, +150) / 100   -> [0.70, 1.90]
//   maturityMult    0.75 + 0.25 x min(age_days, 730) / 730        -> [0.75, 1.00]
//                   unknown age -> 0.85 (the middle of the band)
//   breadthMult     1 + 0.04 x min(chains - 1, 5)                 -> [1.00, 1.20]
//
// The board ranks the watchlist (all 40) plus every other rankable
// pre-token protocol below the watchlist floor, by TVL order of discovery:
// protocols above the floor that the house's own screen left out (wrapped,
// staked, bridged, versioned or exchange products) are not re-ranked here,
// because the snapshot's screen already settled them. Live-token protocols
// are never ranked; they are shown apart, at the market's own value, as
// the peer set the multiples come from.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  sector_min: number;
  sector_max: number;
  min_peers: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_days: number;
  unknown_age_mult: number;
  breadth_step: number;
  breadth_max_extra: number;
}

export const MODEL: ModelConstants = {
  sector_min: 0.05,
  sector_max: 0.6,
  min_peers: 5,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.75,
  maturity_days: 730,
  unknown_age_mult: 0.85,
  breadth_step: 0.04,
  breadth_max_extra: 5,
};

export const MODEL_VERSION = 'radar-2-sector-median';

/** How many live-token protocols the comparison view carries, by market cap. */
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  implied_value_usd: number;
  sector_multiple: number;
  sector_peers: number;
  model: {
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  farm_plan: FarmStep[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  mcap_tvl: number;
}

export interface SectorRow {
  category: string;
  peers: number;
  multiple: number;
  from_category: boolean;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  sectors: SectorRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whole days from `listedAt` to `asOf`; null when the date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A protocol records no token at all in the snapshot. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A protocol the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

export interface SectorTable {
  globalMultiple: number;
  byCategory: Map<string, { peers: number; multiple: number; fromCategory: boolean }>;
}

/**
 * The sector multiples, derived from the live protocols that carry a market
 * cap: per-category median mcap/TVL where the category has at least
 * `min_peers` peers, else the global median; every multiple winsorised.
 */
export function sectorTable(snapshot: Snapshot, model: ModelConstants = MODEL): SectorTable {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const globalRatios = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalMultiple = clamp(median(globalRatios), model.sector_min, model.sector_max);
  const byCategory = new Map<string, { peers: number; multiple: number; fromCategory: boolean }>();
  const cats = new Set(snapshot.protocols.map((p) => p.category ?? 'Uncategorised'));
  for (const cat of cats) {
    const peers = live
      .filter((p) => (p.category ?? 'Uncategorised') === cat)
      .map((p) => p.mcap_usd! / p.tvl_usd)
      .sort((a, b) => a - b);
    if (peers.length >= model.min_peers) {
      byCategory.set(cat, { peers: peers.length, multiple: clamp(median(peers), model.sector_min, model.sector_max), fromCategory: true });
    } else {
      byCategory.set(cat, { peers: peers.length, multiple: globalMultiple, fromCategory: false });
    }
  }
  return { globalMultiple, byCategory };
}

/** The four multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  sectors: SectorTable,
  model: ModelConstants = MODEL,
): { implied: number; sector: number; peers: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const cat = protocol.category ?? 'Uncategorised';
  const entry = sectors.byCategory.get(cat);
  const sector = entry?.multiple ?? sectors.globalMultiple;
  const peers = entry?.peers ?? 0;
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = age === null ? model.unknown_age_mult : model.maturity_floor + (1 - model.maturity_floor) * (Math.min(age, model.maturity_days) / model.maturity_days);
  const breadthMult = 1 + model.breadth_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * sector * growthMult * maturityMult * breadthMult));
  return { implied, sector, peers, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; sectors: SectorTable } {
  const sectors = sectorTable(snapshot, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the floor, by TVL.
  // Above the floor, only the watchlist is ranked: the house's screen has
  // already settled the rest (wrapped, staked, bridged, versioned, CEX).
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const watch = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, sectors, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => {
    const plan = farmPlan(s.p, s.v.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      age_days: s.v.age,
      token_status: 'pre-token',
      watchlist: watch.has(s.p.slug),
      implied_value_usd: s.v.implied,
      sector_multiple: round4(s.v.sector),
      sector_peers: s.v.peers,
      model: {
        growth_pct: round4(s.v.growthPct),
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        breadth_multiplier: round4(s.v.breadthMult),
      },
      farm_steps: plan.map(stepText),
    };
  });
  return { board, sectors };
}

/** One farm step as a single string: action, then cost and time. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Farm capital, tiered by the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  return 100;
}

/** Minimum hold, from the protocol's age: younger needs a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The category's core farming action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as a lender and leave the deposit earning.`;
  }
  if (c.includes('dex')) {
    return `Add $${capital} of liquidity to ${name}'s largest pool on ${chain} in a balanced pair and keep the LP position open.`;
  }
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) {
    return `Deposit $${capital} of USDC into ${name}'s main yield vault on ${chain} and let it compound.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC into ${chain} through ${name}, then put the bridged funds to work in its app instead of bridging straight back.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the receipt token.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged trade, then close it the same week.`;
  }
  if (c.includes('prediction')) {
    return `Fund ${name} with $${capital} on ${chain} and take one small position in a market that settles within the month.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and keep it in the protocol.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full term.`;
  }
  if (c.includes('launchpad')) {
    return `Stake $${capital} in ${name}'s launch pool on ${chain} and join one sale with the allocation it gives.`;
  }
  if (c.includes('payment')) {
    return `Route $${capital} of real payments through ${name} on ${chain} over the month instead of a single test transfer.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the full hold.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time. Every step is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const gas = capital >= 250 ? 8 : 4;
  return [
    {
      text: 'Open a fresh wallet that holds only the funds you plan to farm, write its seed phrase on paper, and never reuse that wallet for anything else.',
      cost: 'nothing but the wallet setup',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second === null
        ? `Do one qualifying action every week on ${chain} — a deposit, a swap, a borrow or a vote — so the wallet shows steady use, not one burst.`
        : `Repeat the core action once on ${chain} and once on ${second}, so the wallet is active on two of the protocol's chains.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, through more than one weekly snapshot, before you touch a withdrawal.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a month, open the protocol's own points or rewards page from its official site and check what the wallet has earned so far.`,
      cost: 'no fee to check',
      time: '10 minutes a month',
    },
    {
      text: 'Never pay anyone to claim, never connect the wallet to a link from a direct message, and claim only from the link the protocol itself publishes.',
      cost: 'nothing; a paid claim is a scam',
      time: '2 minutes to verify the link',
    },
    {
      text: `Keep a farm log with the wallet address, the dates and every transaction hash, then unwind in small steps and revoke the approvals you no longer need.`,
      cost: 'about $3 of gas to unwind',
      time: '10 minutes to close out',
    },
  ];
}

/** The live-token protocols, by market cap, for the comparison view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      mcap_tvl: round4(p.mcap_usd! / Math.max(p.tvl_usd, 1)),
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, sectors } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const sectorRows: SectorRow[] = [...sectors.byCategory.entries()]
    .map(([category, e]) => ({ category, peers: e.peers, multiple: round4(e.multiple), from_category: e.fromCategory }))
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(sectors.globalMultiple),
    sectors: sectorRows,
    rows: board.map((r) => ({ ...r, farm_plan: farmPlan(
      { slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, mcap_usd: null, listed_at: null, gecko_id: null, symbol: null },
      r.age_days,
    ) })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
