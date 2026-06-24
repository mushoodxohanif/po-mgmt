ALTER TABLE "parts" ADD COLUMN "image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;