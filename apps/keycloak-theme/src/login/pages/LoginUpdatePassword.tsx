import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

export default function LoginUpdatePassword(
  props: PageProps<Extract<KcContext, { pageId: "login-update-password.ftl" }>, I18n>,
) {
  const { kcContext, i18n, Template } = props;
  const { url, messagesPerField, isAppInitiatedAction } = kcContext;
  const { msg, msgStr } = i18n;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      displayMessage={!messagesPerField.existsError("password", "password-confirm")}
      headerNode={msg("updatePasswordTitle")}
    >
      <form id="kc-passwd-update-form" className="kc-form" action={url.loginAction} method="post">
        <div className="kc-field">
          <label htmlFor="password-new">{msg("passwordNew")}</label>
          <input
            id="password-new"
            name="password-new"
            type="password"
            autoFocus
            autoComplete="new-password"
            aria-invalid={messagesPerField.existsError("password", "password-confirm")}
          />
          {messagesPerField.existsError("password") && (
            <span
              id="input-error-password"
              className="kc-field-error"
              aria-live="polite"
              dangerouslySetInnerHTML={{ __html: kcSanitize(messagesPerField.get("password")) }}
            />
          )}
        </div>

        <div className="kc-field">
          <label htmlFor="password-confirm">{msg("passwordConfirm")}</label>
          <input
            id="password-confirm"
            name="password-confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={messagesPerField.existsError("password", "password-confirm")}
          />
          {messagesPerField.existsError("password-confirm") && (
            <span
              id="input-error-password-confirm"
              className="kc-field-error"
              aria-live="polite"
              dangerouslySetInnerHTML={{ __html: kcSanitize(messagesPerField.get("password-confirm")) }}
            />
          )}
        </div>

        <button className="kc-button" type="submit">
          {msgStr("doSubmit")}
        </button>

        {isAppInitiatedAction && (
          <button className="kc-button kc-button-secondary" type="submit" name="cancel-aia" value="true">
            {msg("doCancel")}
          </button>
        )}
      </form>
    </Template>
  );
}
