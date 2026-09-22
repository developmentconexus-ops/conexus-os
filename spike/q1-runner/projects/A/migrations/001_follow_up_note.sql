-- Runs as the Project A migration role (schema owner). search_path is p_a_preview.
create table if not exists follow_up_note (
  id             bigint generated always as identity primary key,
  purchase_order_id text not null,
  note           text not null,
  created_at     timestamptz not null default now()
);
