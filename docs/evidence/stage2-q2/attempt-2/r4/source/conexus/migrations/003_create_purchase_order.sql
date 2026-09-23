CREATE TABLE purchase_order (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number text NOT NULL UNIQUE,
  assignee text NOT NULL DEFAULT '',
  expected_delivery_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_order_order_number ON purchase_order (order_number);

-- Popula os pedidos a partir das notas já existentes para preservar todas as informações cadastradas
INSERT INTO purchase_order (order_number, assignee)
SELECT DISTINCT order_number, ''
FROM purchase_order_note
WHERE order_number IS NOT NULL AND order_number <> ''
ON CONFLICT (order_number) DO NOTHING;
