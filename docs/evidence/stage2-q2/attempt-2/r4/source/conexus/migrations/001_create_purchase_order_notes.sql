CREATE TABLE purchase_order_note (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number text NOT NULL,
  note text NOT NULL,
  author text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_order_note_order_number ON purchase_order_note (order_number);
