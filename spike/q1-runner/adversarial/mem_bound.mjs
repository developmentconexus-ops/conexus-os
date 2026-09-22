// Exceed the memory bound with on-heap growth. V8's heap cap (--max-old-space-size) must abort it.
export default async function () {
  const a = [];
  for (;;) { a.push(new Array(1_000_000).fill(7)); }
  // unreachable
}
