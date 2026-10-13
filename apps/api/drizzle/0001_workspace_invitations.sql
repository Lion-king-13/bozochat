CREATE TABLE "workspace_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"role" "workspace_role" DEFAULT 'MEMBER' NOT NULL,
	"invited_by_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_ws_email_uq" UNIQUE("workspace_id","email"),
	CONSTRAINT "invitations_role_not_owner" CHECK ("workspace_invitations"."role" <> 'OWNER')
);
--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "workspace_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "wm_one_owner_uq" ON "workspace_members" USING btree ("workspace_id") WHERE "workspace_members"."role" = 'OWNER';