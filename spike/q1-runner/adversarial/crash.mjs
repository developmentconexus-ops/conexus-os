// Crash the worker hard. The supervisor must survive and serve the next request.
export default async function () {
  process.kill(process.pid, 'SIGKILL');
  return { BREACH: true, reason: 'survived self-kill' };
}
