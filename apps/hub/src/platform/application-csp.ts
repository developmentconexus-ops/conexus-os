// What an application's page may load, on a Preview host, on its own host and while the Builder's
// check boots it. form-action 'none' refuses any submission that would navigate or post somewhere;
// connect-src 'self' admits only the app's own same-origin API under /__conexus/api/.
const APPLICATION_SOURCES = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'none'; form-action 'none'; base-uri 'none'"

// A Preview is framed by the Hub, and its sandbox keeps the frame from the Hub's own capabilities.
// allow-forms lets a submit event reach the app's own handler.
export const previewContentSecurityPolicy = (exactHubOrigin: string): string =>
  `${APPLICATION_SOURCES}; frame-ancestors ${exactHubOrigin}; sandbox allow-scripts allow-same-origin allow-forms`

// An application host is a top-level site: never framed, and without the Preview's sandbox, so its
// page opens popups and downloads like any other site.
export const applicationHostContentSecurityPolicy = `${APPLICATION_SOURCES}; frame-ancestors 'none'`
