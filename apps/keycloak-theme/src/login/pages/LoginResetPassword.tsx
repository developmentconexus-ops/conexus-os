import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

export default function LoginResetPassword(
  props: PageProps<Extract<KcContext, { pageId: "login-reset-password.ftl" }>, I18n>,
) {
  const { kcContext, i18n, Template } = props;
  const { url, realm, auth, messagesPerField } = kcContext;
  const { msg, msgStr } = i18n;

  const usernameLabel = !realm.loginWithEmailAllowed
    ? msgStr("username")
    : !realm.registrationEmailAsUsername
      ? msgStr("usernameOrEmail")
      : msgStr("email");

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      displayMessage={!messagesPerField.existsError("username")}
      headerNode={msg("emailForgotTitle")}
    >
      <p className="kc-sub">
        {realm.duplicateEmailsAllowed ? msg("emailInstructionUsername") : msg("emailInstruction")}
      </p>

      <form id="kc-reset-password-form" className="kc-form" action={url.loginAction} method="post">
        <div className="kc-field">
          <label htmlFor="username">{usernameLabel}</label>
          <input
            id="username"
            name="username"
            type="text"
            autoFocus
            defaultValue={auth.attemptedUsername ?? ""}
            aria-invalid={messagesPerField.existsError("username")}
          />
          {messagesPerField.existsError("username") && (
            <span
              id="input-error-username"
              className="kc-field-error"
              aria-live="polite"
              dangerouslySetInnerHTML={{ __html: kcSanitize(messagesPerField.get("username")) }}
            />
          )}
        </div>

        <button className="kc-button" type="submit">
          {msgStr("doSubmit")}
        </button>

        <a className="kc-forgot" href={url.loginUrl}>
          {msg("backToLogin")}
        </a>
      </form>
    </Template>
  );
}
