-- SQL equivalent of the Q1 arena's legitimate Project A handler
-- (spike/q1-runner/projects/A/handlers/notes.mjs on origin/spike/q1-runner-arena). Run as
-- p_a_runtime against conexus_apps. The handler only ever issues ctx.db.query with these two
-- statement shapes; there is no JS runtime in this spike, so the handler's own SQL is exercised
-- directly instead of a re-hosted execution harness.
insert into follow_up_note(purchase_order_id, note) values ('PO-1', 'q2-sandbox-pg smoke') returning id, created_at;
select id, purchase_order_id, note, created_at from follow_up_note order by id;
