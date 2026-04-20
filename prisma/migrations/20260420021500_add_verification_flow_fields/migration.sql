ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'forfeited';

ALTER TABLE "deposits"
ADD COLUMN "reference_code" VARCHAR(40),
ADD COLUMN "payer_handle" VARCHAR(120);

UPDATE "deposits"
SET "reference_code" = CONCAT('LEGACY-', UPPER(SUBSTRING("id" FROM 1 FOR 12)))
WHERE "reference_code" IS NULL;

ALTER TABLE "deposits"
ALTER COLUMN "reference_code" SET NOT NULL;

CREATE UNIQUE INDEX "deposits_reference_code_key" ON "deposits"("reference_code");
