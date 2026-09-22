import { useState } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

export default function Login(props: PageProps<Extract<KcContext, { pageId: "login.ftl" }>, I18n>) {
  const { kcContext, i18n, Template } = props;
  const { social, realm, url, usernameHidden, login, auth, messagesPerField } = kcContext;
  const { msg, msgStr } = i18n;

  const [isSubmitting, setIsSubmitting] = useState(false);

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
      displayMessage={!messagesPerField.existsError("username", "password")}
      headerNode={`Entrar na ${realm.displayName || realm.name}`}
    >
      <p className="kc-sub">Use o seu e-mail de trabalho.</p>

      {realm.password && (
        <form
          id="kc-form-login"
          className="kc-form"
          onSubmit={() => {
            setIsSubmitting(true);
            return true;
          }}
          action={url.loginAction}
          method="post"
        >
          {!usernameHidden && (
            <div className="kc-field">
              <label htmlFor="username">{usernameLabel}</label>
              <input
                id="username"
                name="username"
                type={realm.loginWithEmailAllowed ? "email" : "text"}
                autoFocus
                autoComplete="username"
                defaultValue={login.username ?? ""}
                aria-invalid={messagesPerField.existsError("username", "password")}
              />
              {messagesPerField.existsError("username", "password") && (
                <span
                  id="input-error"
                  className="kc-field-error"
                  aria-live="polite"
                  dangerouslySetInnerHTML={{
                    __html: kcSanitize(messagesPerField.getFirstError("username", "password")),
                  }}
                />
              )}
            </div>
          )}

          <div className="kc-field">
            <label htmlFor="password">{msg("password")}</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={messagesPerField.existsError("username", "password")}
            />
          </div>

          <input type="hidden" id="id-hidden-input" name="credentialId" value={auth.selectedCredential} />

          <button className="kc-button" type="submit" disabled={isSubmitting} id="kc-login">
            {msgStr("doLogIn")}
          </button>

          {realm.resetPasswordAllowed && (
            <a className="kc-forgot" href={url.loginResetCredentialsUrl}>
              {msg("doForgotPassword")}
            </a>
          )}
        </form>
      )}

      {realm.password && social?.providers !== undefined && social.providers.length !== 0 && (
        <div className="kc-social">
          <hr />
          <p className="kc-social-label">{msg("identity-provider-login-label")}</p>
          <ul>
            {social.providers.map((p) => (
              <li key={p.alias}>
                <a className="kc-social-button" href={p.loginUrl}>
                  {p.displayName}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Template>
  );
}
