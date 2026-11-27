CREATE SCHEMA "content";
--> statement-breakpoint
CREATE TABLE "content"."component" (
	"slug" text PRIMARY KEY NOT NULL,
	"glyph" text NOT NULL,
	"kanjivg_id" text,
	"kanji_literal" text,
	"radical_number" smallint,
	"strokes" smallint,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."content_release" (
	"semver" text PRIMARY KEY NOT NULL,
	"source_manifest" jsonb NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."feature_tag" (
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"tag" text NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL,
	CONSTRAINT "feature_tag_item_type_item_id_tag_pk" PRIMARY KEY("item_type","item_id","tag")
);
--> statement-breakpoint
CREATE TABLE "content"."id_redirect" (
	"old_id" text PRIMARY KEY NOT NULL,
	"new_id" text NOT NULL,
	"release_semver" text NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."item_keyword" (
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"keyword" text NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL,
	CONSTRAINT "item_keyword_item_type_item_id_pk" PRIMARY KEY("item_type","item_id")
);
--> statement-breakpoint
CREATE TABLE "content"."kanji" (
	"literal" text PRIMARY KEY NOT NULL,
	"codepoint" integer NOT NULL,
	"strokes" smallint NOT NULL,
	"radical_number" smallint NOT NULL,
	"grade" smallint,
	"jlpt_approx" smallint,
	"freq_rank" integer,
	"is_joyo" boolean DEFAULT false NOT NULL,
	"meanings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."kanji_component" (
	"kanji_literal" text NOT NULL,
	"component_slug" text NOT NULL,
	"position" text NOT NULL,
	"role" text NOT NULL,
	"depth" smallint NOT NULL,
	"ord" smallint NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL,
	CONSTRAINT "kanji_component_kanji_literal_component_slug_depth_ord_pk" PRIMARY KEY("kanji_literal","component_slug","depth","ord")
);
--> statement-breakpoint
CREATE TABLE "content"."mnemonic" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kanji_literal" text NOT NULL,
	"text" text NOT NULL,
	"author" text NOT NULL,
	"visibility" text NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."radical" (
	"number" smallint PRIMARY KEY NOT NULL,
	"literal" text NOT NULL,
	"variant_forms" text[] DEFAULT '{}' NOT NULL,
	"strokes" smallint,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."reading" (
	"id" text PRIMARY KEY NOT NULL,
	"kanji_literal" text NOT NULL,
	"kind" text NOT NULL,
	"kana" text NOT NULL,
	"okurigana" text,
	"is_joyo" boolean DEFAULT false NOT NULL,
	"is_core" boolean DEFAULT false NOT NULL,
	"is_primary_of_kind" boolean DEFAULT false NOT NULL,
	"usage_weight" real DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."relation" (
	"from_type" text NOT NULL,
	"from_id" text NOT NULL,
	"to_type" text NOT NULL,
	"to_id" text NOT NULL,
	"kind" text NOT NULL,
	"weight" real NOT NULL,
	"directed" boolean DEFAULT false NOT NULL,
	"origin" text NOT NULL,
	"evidence" jsonb,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL,
	CONSTRAINT "relation_from_type_from_id_to_type_to_id_kind_pk" PRIMARY KEY("from_type","from_id","to_type","to_id","kind")
);
--> statement-breakpoint
CREATE TABLE "content"."sentence" (
	"id" text PRIMARY KEY NOT NULL,
	"japanese" text NOT NULL,
	"translations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"word_ids" integer[] DEFAULT '{}' NOT NULL,
	"quality" real,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."word" (
	"ent_seq" integer PRIMARY KEY NOT NULL,
	"headword" text NOT NULL,
	"kana" text NOT NULL,
	"alt_forms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"senses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"freq_rank" integer,
	"is_common" boolean DEFAULT false NOT NULL,
	"jlpt_approx" smallint,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."word_kanji" (
	"word_ent_seq" integer NOT NULL,
	"position" smallint NOT NULL,
	"kanji_literal" text NOT NULL,
	"reading_id" text,
	"surface_kana" text,
	"phenomenon" text NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"license" text NOT NULL,
	CONSTRAINT "word_kanji_word_ent_seq_position_pk" PRIMARY KEY("word_ent_seq","position")
);
--> statement-breakpoint
ALTER TABLE "content"."component" ADD CONSTRAINT "component_kanji_literal_kanji_literal_fk" FOREIGN KEY ("kanji_literal") REFERENCES "content"."kanji"("literal") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."component" ADD CONSTRAINT "component_radical_number_radical_number_fk" FOREIGN KEY ("radical_number") REFERENCES "content"."radical"("number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."kanji" ADD CONSTRAINT "kanji_radical_number_radical_number_fk" FOREIGN KEY ("radical_number") REFERENCES "content"."radical"("number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."kanji_component" ADD CONSTRAINT "kanji_component_kanji_literal_kanji_literal_fk" FOREIGN KEY ("kanji_literal") REFERENCES "content"."kanji"("literal") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."kanji_component" ADD CONSTRAINT "kanji_component_component_slug_component_slug_fk" FOREIGN KEY ("component_slug") REFERENCES "content"."component"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."mnemonic" ADD CONSTRAINT "mnemonic_kanji_literal_kanji_literal_fk" FOREIGN KEY ("kanji_literal") REFERENCES "content"."kanji"("literal") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."reading" ADD CONSTRAINT "reading_kanji_literal_kanji_literal_fk" FOREIGN KEY ("kanji_literal") REFERENCES "content"."kanji"("literal") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."word_kanji" ADD CONSTRAINT "word_kanji_word_ent_seq_word_ent_seq_fk" FOREIGN KEY ("word_ent_seq") REFERENCES "content"."word"("ent_seq") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."word_kanji" ADD CONSTRAINT "word_kanji_kanji_literal_kanji_literal_fk" FOREIGN KEY ("kanji_literal") REFERENCES "content"."kanji"("literal") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."word_kanji" ADD CONSTRAINT "word_kanji_reading_id_reading_id_fk" FOREIGN KEY ("reading_id") REFERENCES "content"."reading"("id") ON DELETE no action ON UPDATE no action;