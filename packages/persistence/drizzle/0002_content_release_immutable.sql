-- content_release rows are immutable once written (arch §7.5).
CREATE FUNCTION "content"."content_release_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'content_release rows are immutable' USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "content_release_no_update"
BEFORE UPDATE OR DELETE ON "content"."content_release"
FOR EACH ROW EXECUTE FUNCTION "content"."content_release_immutable"();
--> statement-breakpoint
CREATE TRIGGER "content_release_no_truncate"
BEFORE TRUNCATE ON "content"."content_release"
FOR EACH STATEMENT EXECUTE FUNCTION "content"."content_release_immutable"();
