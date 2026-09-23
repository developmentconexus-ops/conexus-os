// p50/p95 over N sequential calls, against a given URL and headers.
// node bench.mjs <url> <headers-json> <n>
const url = process.argv[2];
const headers = JSON.parse(process.argv[3] ?? '{}');
const n = Number(process.argv[4] ?? 200);

const times = [];
let failures = 0;
for (let i = 0; i < n; i++) {
  const start = performance.now();
  try {
    const res = await fetch(url, { headers });
    await res.arrayBuffer();
    if (res.status >= 400) failures++;
  } catch {
    failures++;
  }
  times.push(performance.now() - start);
}

times.sort((a, b) => a - b);
const p50 = times[Math.floor(n * 0.5)];
const p95 = times[Math.floor(n * 0.95)];
const p99 = times[Math.floor(n * 0.99)];
console.log(JSON.stringify({ url, n, failures, p50_ms: +p50.toFixed(1), p95_ms: +p95.toFixed(1), p99_ms: +p99.toFixed(1), min_ms: +times[0].toFixed(1), max_ms: +times[n - 1].toFixed(1) }));
