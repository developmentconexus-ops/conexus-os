import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createGetKcContextMock } from "keycloakify/login/KcContext";
import KcPage from "./login/KcPage";
import type { KcContext } from "./login/KcContext";
import "../../../packages/brand/tokens.css";
import "../../../packages/brand/fonts.css";
import "./styles.css";

declare global {
  interface Window {
    kcContext?: KcContext;
  }
}

/** Local dev preview only (`npm run dev`). Production always renders from
 * `window.kcContext`, injected by the generated FTL templates once the
 * theme jar is installed in Keycloak. Switch pages with `?pageId=`, e.g.
 * `?pageId=login-reset-password.ftl`. */
const { getKcContextMock } = createGetKcContextMock({
  kcContextExtension: {},
  kcContextExtensionPerPage: {},
});

const previewPageId = (new URLSearchParams(window.location.search).get("pageId") ??
  "login.ftl") as Parameters<typeof getKcContextMock>[0]["pageId"];

const kcContext = window.kcContext ?? getKcContextMock({ pageId: previewPageId });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KcPage kcContext={kcContext} />
  </StrictMode>,
);
