export type MarketBackgroundSceneId = 0 | 1 | 2 | 3 | 4 | 5;

export type MarketBackgroundScene = {
  readonly id: MarketBackgroundSceneId;
  readonly primaryCell: MarketBackgroundSceneId;
  readonly secondaryCell: MarketBackgroundSceneId;
  readonly thirdCell?: MarketBackgroundSceneId;
};

export const marketBackgroundScenes: readonly MarketBackgroundScene[] = [
  { id: 0, primaryCell: 0, secondaryCell: 3 },
  { id: 1, primaryCell: 1, secondaryCell: 4, thirdCell: 2 },
  { id: 2, primaryCell: 2, secondaryCell: 5 },
  { id: 3, primaryCell: 3, secondaryCell: 0, thirdCell: 4 },
  { id: 4, primaryCell: 4, secondaryCell: 1 },
  { id: 5, primaryCell: 5, secondaryCell: 2, thirdCell: 0 }
];

export const marketBackgroundStorageKey = "layu-market-backgrounds-v1";
export const marketBackgroundMaxPathEntries = 100;

export interface MarketBackgroundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type StoredBackgroundSession = {
  version: 1;
  deck: MarketBackgroundSceneId[];
  cursor: number;
  lastScene: MarketBackgroundSceneId | null;
  paths: [string, MarketBackgroundSceneId][];
};

const maximumPathLength = 2048;
const maximumStoredLength = 256 * 1024;

export function normalizeMarketBackgroundPath(pathname: string) {
  const path = pathname.split(/[?#]/u, 1)[0].replace(/\/{2,}/gu, "/").replace(/\/+$/u, "");
  return path.startsWith("/") && path.length <= maximumPathLength ? path : "/";
}

export function isQuietMarketBackgroundRoute(pathname: string) {
  const segments = normalizeMarketBackgroundPath(pathname).split("/").filter(Boolean);
  if (["admin", "account", "auth"].includes(segments[0] ?? "")) {
    return true;
  }
  return segments.some((segment) => [
    "payment", "payments", "verification", "verify-email", "checkout", "claim",
    "login", "register", "sign-in", "sign-up", "forgot-password", "reset-password"
  ].includes(segment));
}

function isSceneId(value: unknown): value is MarketBackgroundSceneId {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value < marketBackgroundScenes.length;
}

function readStoredSession(raw: string | null, maxPathEntries: number): StoredBackgroundSession | null {
  if (!raw || raw.length > maximumStoredLength) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || value.version !== 1 || !Array.isArray(value.deck) ||
      value.deck.length !== marketBackgroundScenes.length || !value.deck.every(isSceneId) ||
      new Set(value.deck).size !== marketBackgroundScenes.length ||
      typeof value.cursor !== "number" || !Number.isInteger(value.cursor) || value.cursor < 0 || value.cursor > value.deck.length ||
      !(value.lastScene === null || isSceneId(value.lastScene)) ||
      (value.cursor > 0 && value.lastScene === null) ||
      !Array.isArray(value.paths) || value.paths.length > marketBackgroundMaxPathEntries) {
      return null;
    }
    const paths: [string, MarketBackgroundSceneId][] = [];
    const seen = new Set<string>();
    for (const entry of value.paths) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" ||
        normalizeMarketBackgroundPath(entry[0]) !== entry[0] || !isSceneId(entry[1]) || seen.has(entry[0])) {
        return null;
      }
      seen.add(entry[0]);
      paths.push([entry[0], entry[1]]);
    }
    return {
      version: 1, deck: value.deck, cursor: value.cursor, lastScene: value.lastScene,
      paths: paths.slice(-maxPathEntries)
    };
  } catch {
    return null;
  }
}

function shuffleSceneIds(random: () => number, lastScene: MarketBackgroundSceneId | null) {
  const deck = marketBackgroundScenes.map((scene) => scene.id);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const value = random();
    const fraction = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1 - Number.EPSILON) : 0;
    const other = Math.floor(fraction * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  if (deck[0] === lastScene) {
    [deck[0], deck[1]] = [deck[1], deck[0]];
  }
  return deck;
}

/**
 * Create one controller after hydration and retain it for the life of the client shell.
 * Pass sessionStorage explicitly (or null if access is blocked). No browser access,
 * random draw, or shared session state occurs at module load or construction.
 */
export function createMarketBackgroundSession({
  storage = null,
  random = Math.random,
  maxPathEntries = marketBackgroundMaxPathEntries
}: {
  storage?: MarketBackgroundStorage | null;
  random?: () => number;
  maxPathEntries?: number;
} = {}) {
  const pathLimit = Number.isFinite(maxPathEntries)
    ? Math.min(marketBackgroundMaxPathEntries, Math.max(1, Math.floor(maxPathEntries)))
    : marketBackgroundMaxPathEntries;
  let activeStorage = storage;
  let state: StoredBackgroundSession | null = null;
  let loaded = false;

  function persist() {
    if (!activeStorage) {
      return;
    }
    try {
      activeStorage.setItem(marketBackgroundStorageKey, JSON.stringify(state));
    } catch {
      // Keep the complete controller state when quota or browser privacy settings block writes.
      activeStorage = null;
    }
  }

  return {
    getSceneForPath(pathname: string): MarketBackgroundScene {
      if (!loaded) {
        loaded = true;
        try {
          state = readStoredSession(activeStorage?.getItem(marketBackgroundStorageKey) ?? null, pathLimit);
        } catch {
          activeStorage = null;
        }
        state ??= { version: 1, deck: [], cursor: 0, lastScene: null, paths: [] };
      }
      const current = state!;
      const path = normalizeMarketBackgroundPath(pathname);
      const existingIndex = current.paths.findIndex(([storedPath]) => storedPath === path);
      if (existingIndex >= 0) {
        const [entry] = current.paths.splice(existingIndex, 1);
        current.paths.push(entry);
        current.lastScene = entry[1];
        persist();
        return marketBackgroundScenes[entry[1]];
      }
      if (current.cursor >= current.deck.length) {
        current.deck = shuffleSceneIds(random, current.lastScene);
        current.cursor = 0;
      }
      const sceneId = current.deck[current.cursor];
      current.cursor += 1;
      current.lastScene = sceneId;
      current.paths.push([path, sceneId]);
      if (current.paths.length > pathLimit) {
        current.paths.shift();
      }
      persist();
      return marketBackgroundScenes[sceneId];
    }
  };
}
