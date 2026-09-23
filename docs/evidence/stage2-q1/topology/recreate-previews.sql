SELECT json_build_object('projectId', a.project_id, 'revision', r.artifact_revision_id, 'created', r.created_at,
  'files', (SELECT json_agg(json_build_object('path', f->>'path', 'sha256', f->>'sha256', 'content', f->>'base64') ORDER BY f->>'path')
            FROM jsonb_array_elements(r.payload->'files') f WHERE f->>'path' LIKE 'conexus-server/%'))
FROM reg.artifact a
JOIN LATERAL (SELECT * FROM reg.artifact_revision x WHERE x.artifact_id = a.artifact_id AND x.availability = 'AVAILABLE' ORDER BY x.created_at DESC LIMIT 1) r ON true
WHERE a.kind = 'application'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.payload->'files') f WHERE f->>'path' = 'conexus-server/manifest.json')
ORDER BY r.created_at;
