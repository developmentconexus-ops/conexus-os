import type { ExtendKcContext } from "keycloakify/login";

/** No theme-specific context fields yet; every page uses the standard
 * Keycloak kcContext shape. */
// eslint-disable-next-line @typescript-eslint/ban-types
export type KcContext = ExtendKcContext<{}, {}>;
