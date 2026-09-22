// Exceed the execution time bound with a busy loop. Must be TERMINATED by the platform.
export default async function () {
  const end = Date.now() + 60000;
  while (Date.now() < end) { /* spin */ }
  return { BREACH: true, reason: 'busy loop completed without being killed' };
}
