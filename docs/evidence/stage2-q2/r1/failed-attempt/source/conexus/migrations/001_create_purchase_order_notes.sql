CREATE TABLE purchase_order_notes (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_order_notes_order_number ON purchase_order_notes (order_number);
