import { describe, expect, it, vi } from "vitest";

import {
  createMarketBackgroundSession,
  isQuietMarketBackgroundRoute,
  marketBackgroundMaxPathEntries,
  marketBackgroundScenes,
  marketBackgroundStorageKey,
  normalizeMarketBackgroundPath,
  type MarketBackgroundStorage
} from "../src/lib/ui/market-backgrounds";

function memoryStorage(initial: string | null = null): MarketBackgroundStorage {
  let value = initial;
  return { getItem: () => value, setItem: (_key, next) => { value = next; } };
}

function storedState(storage: MarketBackgroundStorage) {
  return JSON.parse(storage.getItem(marketBackgroundStorageKey)!);
}

describe("market background route scenes", () => {
  it("defines six distinct primary sprites and alternates two and three object groups", () => {
    expect(marketBackgroundScenes.map((scene) => scene.primaryCell)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(marketBackgroundScenes.filter((scene) => scene.thirdCell !== undefined)).toHaveLength(3);
    for (const scene of marketBackgroundScenes) {
      expect(scene.primaryCell).not.toBe(scene.secondaryCell);
      for (const cell of [scene.primaryCell, scene.secondaryCell, scene.thirdCell].filter((cell) => cell !== undefined)) {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThan(6);
      }
    }
  });

  it("does not access storage or draw randomness before the first client route assignment", () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    const random = vi.fn(() => 0.5);
    createMarketBackgroundSession({ storage, random });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it("uses all six scenes before another cycle and avoids the same scene at the cycle boundary", () => {
    const randomValues = [...Array(5).fill(0.999), 0, ...Array(4).fill(0.999)];
    const session = createMarketBackgroundSession({ random: () => randomValues.shift() ?? 0.999 });
    const ids = Array.from({ length: 12 }, (_, index) => session.getSceneForPath(`/listing/${index}`).id);
    expect(ids.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(ids.slice(6))).toHaveProperty("size", 6);
    expect(ids[6]).not.toBe(ids[5]);
  });

  it("preserves Back and refresh assignments without spending another shuffled scene", () => {
    const storage = memoryStorage();
    const random = vi.fn(() => 0.999);
    const session = createMarketBackgroundSession({ storage, random });
    const home = session.getSceneForPath("/");
    const catalog = session.getSceneForPath("/listings");
    expect(session.getSceneForPath("/")).toBe(home);
    expect(session.getSceneForPath("/listings?sort=price#top")).toBe(catalog);
    const refreshed = createMarketBackgroundSession({ storage, random });
    expect(refreshed.getSceneForPath("/listings")).toBe(catalog);
    expect(refreshed.getSceneForPath("/")).toBe(home);
    expect(refreshed.getSceneForPath("/categories/games").id).toBe(2);
    expect(random).toHaveBeenCalledTimes(5);
  });

  it("normalizes queries, hashes and trailing slashes to the same pathname", () => {
    const session = createMarketBackgroundSession({ random: () => 0.999 });
    const listing = session.getSceneForPath("/listings/item-1");
    expect(session.getSceneForPath("/listings/item-1?ref=email")).toBe(listing);
    expect(session.getSceneForPath("/listings/item-1/#photos")).toBe(listing);
    expect(session.getSceneForPath("//listings//item-1/")).toBe(listing);
    expect(normalizeMarketBackgroundPath("?search=controller")).toBe("/");
    expect(normalizeMarketBackgroundPath("/#top")).toBe("/");
  });

  it("keeps independent tab storage and independent in-memory sessions", () => {
    const first = createMarketBackgroundSession({ storage: memoryStorage(), random: () => 0.999 });
    const second = createMarketBackgroundSession({ storage: memoryStorage(), random: () => 0 });
    expect(first.getSceneForPath("/").id).toBe(0);
    expect(second.getSceneForPath("/").id).toBe(1);
    first.getSceneForPath("/listings");
    expect(second.getSceneForPath("/categories").id).toBe(2);
    expect(createMarketBackgroundSession({ random: () => 0.999 }).getSceneForPath("/").id).toBe(0);
  });

  it("uses memory when session storage reads or writes are blocked", () => {
    for (const failure of ["get", "set"]) {
      const storage = {
        getItem: vi.fn(() => { if (failure === "get") throw new Error("SecurityError"); return null; }),
        setItem: vi.fn(() => { throw new Error("QuotaExceededError"); })
      };
      const session = createMarketBackgroundSession({ storage, random: () => 0.999 });
      const first = session.getSceneForPath("/");
      expect(session.getSceneForPath("/listings").id).toBe(1);
      expect(session.getSceneForPath("/")).toBe(first);
      expect(storage.getItem).toHaveBeenCalledTimes(1);
      expect(storage.setItem).toHaveBeenCalledTimes(failure === "get" ? 0 : 1);
    }
  });

  it.each([
    "not JSON", "null", "[]", JSON.stringify({ version: 9 }),
    JSON.stringify({ version: 1, deck: [0, 1, 2, 3, 4, 4], cursor: 2, lastScene: 1, paths: [] }),
    JSON.stringify({ version: 1, deck: [0, 1, 2, 3, 4, 5], cursor: 7, lastScene: 1, paths: [] }),
    JSON.stringify({ version: 1, deck: [0, 1, 2, 3, 4, 5], cursor: 2, lastScene: null, paths: [] }),
    JSON.stringify({ version: 1, deck: [0, 1, 2, 3, 4, 5], cursor: 2, lastScene: 1, paths: [["/", 8]] }),
    JSON.stringify({ version: 1, deck: [0, 1, 2, 3, 4, 5], cursor: 2, lastScene: 1, paths: [["/", 0], ["/", 1]] }),
    JSON.stringify({ version: 1, deck: [0, 1, 2, 3, 4, 5], cursor: 2, lastScene: 1, paths: [["/listings?sort=price", 1]] })
  ])("recovers safely from a corrupt stored session: %s", (raw) => {
    const storage = memoryStorage(raw);
    const session = createMarketBackgroundSession({ storage, random: () => 0.999 });
    expect(session.getSceneForPath("/").id).toBe(0);
    expect(session.getSceneForPath("/listings").id).toBe(1);
    expect(storedState(storage).paths).toEqual([["/", 0], ["/listings", 1]]);
  });

  it("bounds persisted history and retains recently revisited pages when evicting old entries", () => {
    const storage = memoryStorage();
    const session = createMarketBackgroundSession({ storage, random: () => 0.999, maxPathEntries: 3 });
    const home = session.getSceneForPath("/");
    session.getSceneForPath("/listings");
    session.getSceneForPath("/categories");
    session.getSceneForPath("/");
    session.getSceneForPath("/help");
    expect(storedState(storage).paths.map(([path]: [string, number]) => path)).toEqual(["/categories", "/", "/help"]);
    expect(createMarketBackgroundSession({ storage }).getSceneForPath("/")).toBe(home);
    const fullStorage = memoryStorage();
    const fullSession = createMarketBackgroundSession({ storage: fullStorage, maxPathEntries: 1000 });
    for (let index = 0; index < 150; index += 1) fullSession.getSceneForPath(`/item/${index}`);
    expect(storedState(fullStorage).paths).toHaveLength(marketBackgroundMaxPathEntries);
  });

  it("accepts special pathname keys without treating them as object properties", () => {
    const session = createMarketBackgroundSession({ storage: memoryStorage(), random: () => 0.999 });
    expect(session.getSceneForPath("/__proto__").id).toBe(0);
    expect(session.getSceneForPath("/constructor").id).toBe(1);
    expect(session.getSceneForPath("/__proto__").id).toBe(0);
  });
});

describe("quiet market routes", () => {
  it.each([
    "/admin", "/admin/listings", "/account", "/account/orders/1/payment", "/auth/sign-in",
    "/payment", "/payments/1", "/help/payments", "/verification", "/help/verification",
    "/checkout", "/listings/1/claim?source=catalog", "/login", "/reset-password#form"
  ])("suppresses edge objects on %s", (path) => {
    expect(isQuietMarketBackgroundRoute(path)).toBe(true);
  });

  it.each(["/", "/listings", "/listings/item-1", "/categories/games", "/help/pickup-shipping", "/administration", "/accounting", "/categories/payment-tools", "/listings?next=/account"]) (
    "keeps ordinary browsing decorative on %s", (path) => {
      expect(isQuietMarketBackgroundRoute(path)).toBe(false);
    }
  );
});
