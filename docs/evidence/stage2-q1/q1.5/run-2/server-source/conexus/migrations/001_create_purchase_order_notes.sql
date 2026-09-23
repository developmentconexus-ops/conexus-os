CREATE TABLE purchase_order_note (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
