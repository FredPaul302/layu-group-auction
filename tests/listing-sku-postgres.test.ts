import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const container = process.env.SKU_POSTGRES_CONTAINER;
const database = `layu_sku_test_${Date.now()}_${process.pid}`;
let created = false;

async function sql(statement: string, target = database) {
  const result = await execute("docker", ["exec", container!, "psql", "-X", "-U", "auction", "-d", target, "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], { windowsHide: true });
  return result.stdout.trim();
}

// Explicit opt-in targets only an isolated temporary database in local Docker.
describe.skipIf(!container)("PostgreSQL SKU assignment", () => {
  beforeAll(async () => {
    await sql(`CREATE DATABASE ${database}`, "postgres");
    created = true;
    await sql("CREATE TABLE listings (id serial PRIMARY KEY, seller_user_id text NOT NULL); CREATE TABLE inventory_items (seller_user_id text NOT NULL, sku text NOT NULL);");
    const migration = await readFile(new URL("../prisma/migrations/20260913000300_listing_skus/migration.sql", import.meta.url), "utf8");
    await sql(migration);
  }, 30_000);
  beforeEach(async () => {
    await sql("TRUNCATE listings, inventory_items RESTART IDENTITY; ALTER SEQUENCE listing_sku_number RESTART WITH 1;");
  });
  afterAll(async () => { if (created) await sql(`DROP DATABASE ${database}`, "postgres"); });

  it("starts at 000001 and keeps numbers after edits", async () => {
    expect(await sql("INSERT INTO listings (seller_user_id) VALUES ('seller') RETURNING sku;")).toContain("000001");
    expect(await sql("UPDATE listings SET sku=NULL WHERE id=1 RETURNING sku;")).toContain("000001");
    await expect(sql("UPDATE listings SET sku='000002' WHERE id=1;")).rejects.toThrow("saved SKU cannot be changed");
  });
  it("skips existing manual and inventory numbers", async () => {
    await sql("INSERT INTO listings (seller_user_id,sku) VALUES ('seller','2'); INSERT INTO inventory_items VALUES ('seller','1');");
    expect(await sql("INSERT INTO listings (seller_user_id) VALUES ('seller') RETURNING sku;")).toContain("000003");
    await expect(sql("INSERT INTO listings (seller_user_id,sku) VALUES ('seller','000002');")).rejects.toThrow("listings_seller_sku_key");
  });
  it("assigns distinct numbers to simultaneous uploads", async () => {
    const values = await Promise.all(Array.from({ length: 12 }, () => sql("INSERT INTO listings (seller_user_id) VALUES ('seller') RETURNING sku;")));
    const skus = values.map((value) => value.split(/\r?\n/u)[0]);
    expect(new Set(skus).size).toBe(12);
    expect([...skus].sort()).toEqual(Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(6, "0")));
  }, 30_000);
  it("never reuses a number after deletion or rollback", async () => {
    await sql("INSERT INTO listings (seller_user_id) VALUES ('seller'); DELETE FROM listings;");
    await sql("BEGIN; INSERT INTO listings (seller_user_id) VALUES ('seller'); ROLLBACK;");
    expect(await sql("INSERT INTO listings (seller_user_id) VALUES ('seller') RETURNING sku;")).toContain("000003");
  });
  it("stops at six digits without wrapping or truncating", async () => {
    await sql("SELECT setval('listing_sku_number',999999,false);");
    expect(await sql("INSERT INTO listings (seller_user_id) VALUES ('seller') RETURNING sku;")).toContain("999999");
    await expect(sql("INSERT INTO listings (seller_user_id) VALUES ('seller');")).rejects.toThrow("reached 999999");
    expect(await sql("SELECT count(*) FROM listings;")).toBe("1");
  });
});
