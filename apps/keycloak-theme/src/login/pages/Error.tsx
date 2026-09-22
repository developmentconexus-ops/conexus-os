import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

export default function Error(props: PageProps<Extract<KcContext, { pageId: "error.ftl" }>, I18n>) {
  const { kcContext, i18n, Template } = props;
  const { message, client, skipLink } = kcContext;
  const { msg } = i18n;

  return (
    <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={false} displayMessage={false} headerNode={msg("errorTitle")}>
      <p className="kc-sub" dangerouslySetInnerHTML={{ __html: kcSanitize(message.summary) }} />
      {!skipLink && !!client?.baseUrl && (
        <a className="kc-forgot" id="backToApplication" href={client.baseUrl}>
          {msg("backToApplication")}
        </a>
      )}
    </Template>
  );
}
