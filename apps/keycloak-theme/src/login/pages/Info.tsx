import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

export default function Info(props: PageProps<Extract<KcContext, { pageId: "info.ftl" }>, I18n>) {
  const { kcContext, i18n, Template } = props;
  const { advancedMsgStr, msg } = i18n;
  const { messageHeader, message, requiredActions, skipLink, pageRedirectUri, actionUri, client } = kcContext;

  const bodyHtml = (() => {
    let html = message.summary?.trim() ?? "";
    if (requiredActions) {
      html += " <b>" + requiredActions.map((a) => advancedMsgStr("requiredAction." + a)).join(", ") + "</b>";
    }
    return kcSanitize(html);
  })();

  const link = (() => {
    if (skipLink) return null;
    if (pageRedirectUri) return { href: pageRedirectUri, label: msg("backToApplication") };
    if (actionUri) return { href: actionUri, label: msg("proceedWithAction") };
    if (client.baseUrl) return { href: client.baseUrl, label: msg("backToApplication") };
    return null;
  })();

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      displayMessage={false}
      headerNode={
        <span
          dangerouslySetInnerHTML={{
            __html: kcSanitize(messageHeader ? advancedMsgStr(messageHeader) : message.summary),
          }}
        />
      }
    >
      <p className="kc-sub" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      {link && (
        <a className="kc-forgot" href={link.href}>
          {link.label}
        </a>
      )}
    </Template>
  );
}
