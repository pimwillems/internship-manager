--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "name" text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE "students" SET "name" = TRIM(CONCAT("first_name", ' ', "last_name"));
--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "name" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "first_name";
--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "last_name";