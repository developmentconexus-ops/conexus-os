SET statement_timeout = 0;
SET transaction_timeout = 0;
CREATE TABLE IF NOT EXISTS fill (b text);
ALTER TABLE fill ALTER COLUMN b SET STORAGE EXTERNAL;
INSERT INTO fill SELECT (SELECT string_agg(md5(random()::text || (i + g)::text), '') FROM generate_series(1, 2048) i) FROM generate_series(1, 1500) g;
