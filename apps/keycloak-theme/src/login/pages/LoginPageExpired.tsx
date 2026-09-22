import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

export default function LoginPageExpired(
  props: PageProps<Extract<KcContext, { pageId: "login-page-expired.ftl" }>, I18n>,
) {
  const { kcContext, i18n, Template } = props;
  const { url } = kcContext;
  const { msg } = i18n;

  return (
    <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={false} headerNode={msg("pageExpiredTitle")}>
      <p className="kc-sub">
        {msg("pageExpiredMsg1")}{" "}
        <a id="loginRestartLink" href={url.loginRestartFlowUrl}>
          {msg("doClickHere")}
        </a>
        .
        <br />
        {msg("pageExpiredMsg2")}{" "}
        <a id="loginContinueLink" href={url.loginAction}>
          {msg("doClickHere")}
        </a>
        .
      </p>
    </Template>
  );
}
