BEGIN;

-- A grant's tenure ends only when an Owner revokes it. Before 0024 a repeat grant to a person who
-- already held one opened a fresh invitation, revoking the grant left that invitation open, and the
-- person's next sign-in claimed it: the revoke did not hold. Now a repeat grant answers the open
-- grant and opens nothing, and revoking a grant withdraws every invitation to the grantee's email
-- on that application.
DROP FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone);

CREATE FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) RETURNS TABLE(kind text, entry_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  normalized_email text := lower(btrim(p_email));
  base_slug text;
  candidate_slug text;
  attempt integer := 1;
  held_grant_id uuid;
  settled_invitation_id uuid;
BEGIN
  PERFORM iam.admit_application_owner(p_actor, p_project_id);
  IF NOT EXISTS (SELECT 1 FROM iam.application AS existing WHERE existing.project_id = p_project_id) THEN
    SELECT iam.application_slug_base(stored_project.name) INTO base_slug
    FROM project.project AS stored_project
    WHERE stored_project.project_id = p_project_id;
    candidate_slug := base_slug;
    LOOP
      INSERT INTO iam.application (project_id, slug, created_by)
      VALUES (p_project_id, candidate_slug, p_actor)
      ON CONFLICT DO NOTHING;
      EXIT WHEN EXISTS (SELECT 1 FROM iam.application AS settled WHERE settled.project_id = p_project_id);
      attempt := attempt + 1;
      candidate_slug := rtrim(left(base_slug, 40 - length('-' || attempt)), '-') || '-' || attempt;
    END LOOP;
  END IF;
  SELECT access_grant.grant_id INTO held_grant_id
  FROM iam.application_grant AS access_grant
  JOIN iam.account AS grantee ON grantee.account_id = access_grant.account_id
  WHERE access_grant.project_id = p_project_id AND access_grant.revoked_at IS NULL
    AND lower(btrim(grantee.email)) = normalized_email;
  IF FOUND THEN
    RETURN QUERY SELECT 'grant'::text, held_grant_id;
    RETURN;
  END IF;
  INSERT INTO iam.application_invitation (invitation_id, project_id, email, invited_by, expires_at)
  VALUES (p_invitation_id, p_project_id, normalized_email, p_actor, p_expires_at)
  ON CONFLICT (project_id, email) DO UPDATE
    SET invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at
  RETURNING iam.application_invitation.invitation_id INTO settled_invitation_id;
  RETURN QUERY SELECT 'invitation'::text, settled_invitation_id;
END;
$$;

ALTER FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) TO hub_iam_runtime;

CREATE OR REPLACE FUNCTION iam.revoke_application_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  grantee uuid;
BEGIN
  PERFORM iam.admit_application_owner(p_actor, p_project_id);
  UPDATE iam.application_grant AS access_grant
  SET revoked_at = clock_timestamp(), revoked_by = p_actor
  WHERE access_grant.grant_id = p_grant_id AND access_grant.project_id = p_project_id
    AND access_grant.revoked_at IS NULL
  RETURNING access_grant.account_id INTO grantee;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  DELETE FROM iam.application_invitation AS invitation
  USING iam.account AS person
  WHERE person.account_id = grantee AND invitation.project_id = p_project_id
    AND invitation.email = lower(btrim(person.email));
  IF NOT iam.has_application_access(grantee, p_project_id) THEN
    UPDATE iam.application_session AS session
    SET ended_at = clock_timestamp(), ended_reason = 'ACCESS_ENDED', provider_refresh_token = NULL
    WHERE session.account_id = grantee AND session.project_id = p_project_id AND session.ended_at IS NULL;
    DELETE FROM iam.application_handoff AS handoff WHERE handoff.account_id = grantee AND handoff.project_id = p_project_id;
  END IF;
  RETURN true;
END;
$$;

COMMIT;
