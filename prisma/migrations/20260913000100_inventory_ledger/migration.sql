CREATE TABLE "inventory_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seller_user_id" TEXT NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "location" VARCHAR(120),
  "quantity" INTEGER NOT NULL DEFAULT 0 CHECK ("quantity" BETWEEN 0 AND 1000000),
  "unit_cost_cents" INTEGER NOT NULL DEFAULT 0 CHECK ("unit_cost_cents" >= 0),
  "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at_utc" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "inventory_items_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inventory_items_seller_sku_key" ON "inventory_items"("seller_user_id", "sku");

CREATE TABLE "inventory_purchase_orders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seller_user_id" TEXT NOT NULL,
  "reference" VARCHAR(120) NOT NULL,
  "supplier" VARCHAR(200) NOT NULL,
  "notes" TEXT,
  "received_at_utc" TIMESTAMPTZ(3),
  "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_purchase_orders_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inventory_po_seller_reference_key" ON "inventory_purchase_orders"("seller_user_id", "reference");

CREATE TABLE "inventory_purchase_order_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchase_order_id" TEXT NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "location" VARCHAR(120),
  "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 1000000),
  "unit_cost_cents" INTEGER NOT NULL CHECK ("unit_cost_cents" >= 0),
  CONSTRAINT "inventory_purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "inventory_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inventory_po_lines_order_sku_key" ON "inventory_purchase_order_lines"("purchase_order_id", "sku");

CREATE TABLE "inventory_movements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "inventory_item_id" TEXT NOT NULL,
  "kind" VARCHAR(30) NOT NULL,
  "quantity_delta" INTEGER NOT NULL,
  "unit_cost_cents" INTEGER NOT NULL CHECK ("unit_cost_cents" >= 0),
  "reason" VARCHAR(500) NOT NULL,
  "reference" VARCHAR(200),
  "actor_user_id" TEXT NOT NULL,
  "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "inventory_movements_item_time_idx" ON "inventory_movements"("inventory_item_id", "created_at_utc");

CREATE TABLE "inventory_allocations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "inventory_item_id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "unit_cost_cents" INTEGER NOT NULL CHECK ("unit_cost_cents" >= 0),
  "selling_cost_cents" INTEGER NOT NULL DEFAULT 0 CHECK ("selling_cost_cents" >= 0),
  "created_at_utc" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_allocations_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_allocations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inventory_allocations_listing_id_key" ON "inventory_allocations"("listing_id");
CREATE INDEX "inventory_allocations_item_idx" ON "inventory_allocations"("inventory_item_id");
