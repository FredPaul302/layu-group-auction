-- Existing listings receive a SKU when next saved. New listings are numbered by
-- PostgreSQL, including inserts from a previous app revision during deployment.
CREATE SEQUENCE "listing_sku_number" AS integer START WITH 1 MAXVALUE 999999 NO CYCLE;

ALTER TABLE "listings" ADD COLUMN "sku" VARCHAR(80);
CREATE UNIQUE INDEX "listings_seller_sku_key" ON "listings" ("seller_user_id", "sku");

CREATE FUNCTION assign_listing_sku() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE candidate text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.sku IS NOT NULL THEN
    IF NULLIF(btrim(NEW.sku), '') IS NOT NULL AND NEW.sku IS DISTINCT FROM OLD.sku THEN
      RAISE EXCEPTION 'A saved SKU cannot be changed' USING ERRCODE = '23514', CONSTRAINT = 'listings_sku_stable';
    END IF;
    NEW.sku := OLD.sku;
    RETURN NEW;
  END IF;

  NEW.sku := NULLIF(upper(btrim(NEW.sku)), '');
  IF NEW.sku IS NOT NULL THEN
    IF NEW.sku ~ '^[0-9]{1,6}$' THEN NEW.sku := lpad(NEW.sku, 6, '0'); END IF;
    IF NEW.sku ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'SKU contains unsupported characters' USING ERRCODE = '23514', CONSTRAINT = 'listings_sku_valid';
    END IF;
    RETURN NEW;
  END IF;

  LOOP
    BEGIN
      candidate := lpad(nextval('listing_sku_number')::text, 6, '0');
    EXCEPTION WHEN SQLSTATE '2200H' THEN
      RAISE EXCEPTION 'Automatic SKU numbers have reached 999999' USING ERRCODE = '23514', CONSTRAINT = 'listings_sku_exhausted';
    END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM listings WHERE seller_user_id = NEW.seller_user_id AND sku = candidate)
      AND NOT EXISTS (SELECT 1 FROM inventory_items WHERE seller_user_id = NEW.seller_user_id
        AND (sku = candidate OR (sku ~ '^[0-9]{1,6}$' AND lpad(sku, 6, '0') = candidate)));
  END LOOP;
  NEW.sku := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "listings_assign_sku" BEFORE INSERT OR UPDATE OF "sku" ON "listings"
FOR EACH ROW EXECUTE FUNCTION assign_listing_sku();
