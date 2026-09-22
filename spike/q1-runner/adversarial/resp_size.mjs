// Return an oversized response. The platform must reject it at the response-size bound.
export default async function () {
  return { BREACH: true, blob: 'x'.repeat(50 * 1024 * 1024) };
}
