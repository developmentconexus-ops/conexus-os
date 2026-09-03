import { isIP } from "node:net";
import { posix } from "node:path";

export const ADMITTED_DESTINATION = Object.freeze({
  scheme: "https:",
  hostname: "git.allowed.test",
  port: "443",
  pathPrefix: "/admitted/",
});

export function admitProviderNeutralLocator(rawLocator) {
  let locator;
  try {
    locator = new URL(rawLocator);
  } catch {
    return { admitted: false, reason: "MALFORMED_LOCATOR" };
  }

  if (locator.protocol !== ADMITTED_DESTINATION.scheme) {
    return { admitted: false, reason: "PROTOCOL_DENIED" };
  }
  if (locator.username || locator.password) {
    return { admitted: false, reason: "CALLER_CREDENTIAL_DENIED" };
  }
  if (locator.hash) {
    return { admitted: false, reason: "FRAGMENT_DENIED" };
  }
  if (locator.search) {
    return { admitted: false, reason: "DESTINATION_DENIED" };
  }
  if (isIP(locator.hostname)) {
    return { admitted: false, reason: "IP_LITERAL_DENIED" };
  }
  let decodedPath = locator.pathname;
  try {
    for (let round = 0; round < 4; round += 1) {
      const next = decodeURIComponent(decodedPath);
      if (next === decodedPath) break;
      decodedPath = next;
    }
  } catch {
    return { admitted: false, reason: "MALFORMED_LOCATOR" };
  }
  const decodedSegments = decodedPath.split("/");
  if (
    decodedPath.includes("%") ||
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    decodedPath.includes("//") ||
    decodedSegments.includes(".") ||
    decodedSegments.includes("..")
  ) {
    return { admitted: false, reason: "DESTINATION_DENIED" };
  }
  if (
    locator.hostname !== ADMITTED_DESTINATION.hostname ||
    (locator.port || "443") !== ADMITTED_DESTINATION.port ||
    !decodedPath.startsWith(ADMITTED_DESTINATION.pathPrefix)
  ) {
    return { admitted: false, reason: "DESTINATION_DENIED" };
  }

  return {
    admitted: true,
    canonicalLocator: locator.href,
  };
}

export function resolveCanonicalRepositoryPath(ownerRoot, projectId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(projectId)) {
    throw new Error("PROJECT_ID_PATH_DENIED");
  }
  return { admitted: true, path: posix.join(ownerRoot, `${projectId}.git`) };
}
