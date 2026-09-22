import { useEffect } from "react";
import type { TemplateProps } from "keycloakify/login/TemplateProps";
import { useInitialize } from "keycloakify/login/Template.useInitialize";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { ConexusWordmark } from "../../../../packages/brand/src/index";
import type { KcContext } from "./KcContext";
import type { I18n } from "./i18n";

/** Conexus sign-in chrome: one centered column, the Encaixe mark fitting
 * together once on load, the wordmark, a heading built from the realm's
 * display name, an optional message banner, and the page body. No
 * marketing panel and no Keycloak default styling (doUseDefaultCss is
 * always false; every page in this theme brings its own classes). */
export default function Template(props: TemplateProps<KcContext, I18n>) {
  const { kcContext, i18n, children, displayMessage = true, headerNode, documentTitle } = props;

  const { msgStr } = i18n;
  const { realm, message } = kcContext;

  useEffect(() => {
    document.title = documentTitle ?? msgStr("loginTitle", realm.displayName || realm.name);
  }, []);

  const { isReadyToRender } = useInitialize({ kcContext, doUseDefaultCss: false });

  if (!isReadyToRender) {
    return null;
  }

  return (
    <div className="kc-stage">
      <div className="kc-column">
        <div className="kc-lockup">
          <ConexusWordmark size="lg" arrive />
        </div>

        {headerNode && <h1 className="kc-heading">{headerNode}</h1>}

        {displayMessage && message !== undefined && (
          <div className={`kc-alert kc-alert-${message.type}`} role="alert">
            <span dangerouslySetInnerHTML={{ __html: kcSanitize(message.summary) }} />
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
