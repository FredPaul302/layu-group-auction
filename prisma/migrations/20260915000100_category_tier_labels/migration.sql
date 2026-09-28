-- Repair only the original seeded labels. Keep category IDs, URLs, custom names,
-- deposit amounts, and the current verification policy intact.
UPDATE "categories" SET "name" = 'Collectibles'
WHERE "slug" = 'tier-5-collectibles' AND "name" = 'Tier 5 Collectibles';
UPDATE "categories" SET "name" = 'Vintage'
WHERE "slug" = 'tier-10-vintage' AND "name" = 'Tier 10 Vintage';
UPDATE "categories" SET "name" = 'Premium'
WHERE "slug" = 'tier-20-premium' AND "name" = 'Tier 20 Premium';
UPDATE "categories" SET "description" = 'Collectibles available under the current launch requirements.'
WHERE "slug" = 'tier-5-collectibles' AND "description" = 'Entry-tier items with a five-dollar deposit requirement.';
UPDATE "categories" SET "description" = 'Vintage inventory available under the current launch requirements.'
WHERE "slug" = 'tier-10-vintage' AND "description" = 'Mid-tier vintage inventory that requires the ten-dollar tier.';
UPDATE "categories" SET "description" = 'Premium inventory; the $20 auction tier is reserved for after launch.'
WHERE "slug" = 'tier-20-premium' AND "description" = 'Higher-value listings reserved for the twenty-dollar tier.';
