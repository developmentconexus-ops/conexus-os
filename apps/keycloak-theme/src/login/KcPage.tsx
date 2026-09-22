import { Suspense, lazy } from "react";
import DefaultPage from "keycloakify/login/DefaultPage";
import UserProfileFormFields from "keycloakify/login/UserProfileFormFields";
import Template from "./Template";
import { useI18n } from "./i18n";
import type { KcContext } from "./KcContext";

const Login = lazy(() => import("./pages/Login"));
const LoginResetPassword = lazy(() => import("./pages/LoginResetPassword"));
const LoginUpdatePassword = lazy(() => import("./pages/LoginUpdatePassword"));
const Error = lazy(() => import("./pages/Error"));
const Info = lazy(() => import("./pages/Info"));
const LoginPageExpired = lazy(() => import("./pages/LoginPageExpired"));

/** The six pages the Conexus theme restyles (login, reset password, update
 * password, error, info, expired). Every other Keycloak login page id
 * (webauthn, OTP, identity-broker steps, ...) falls back to Keycloakify's
 * own default page so the realm keeps working end to end; those pages
 * still inherit the Conexus Template chrome, just not custom form layout. */
export default function KcPage(props: { kcContext: KcContext }) {
  const { kcContext } = props;
  const { i18n } = useI18n({ kcContext });

  return (
    <Suspense>
      {(() => {
        switch (kcContext.pageId) {
          case "login.ftl":
            return <Login kcContext={kcContext} i18n={i18n} Template={Template} doUseDefaultCss={false} />;
          case "login-reset-password.ftl":
            return <LoginResetPassword kcContext={kcContext} i18n={i18n} Template={Template} doUseDefaultCss={false} />;
          case "login-update-password.ftl":
            return <LoginUpdatePassword kcContext={kcContext} i18n={i18n} Template={Template} doUseDefaultCss={false} />;
          case "error.ftl":
            return <Error kcContext={kcContext} i18n={i18n} Template={Template} doUseDefaultCss={false} />;
          case "info.ftl":
            return <Info kcContext={kcContext} i18n={i18n} Template={Template} doUseDefaultCss={false} />;
          case "login-page-expired.ftl":
            return <LoginPageExpired kcContext={kcContext} i18n={i18n} Template={Template} doUseDefaultCss={false} />;
          default:
            return (
              <DefaultPage
                kcContext={kcContext}
                i18n={i18n}
                doUseDefaultCss={true}
                Template={Template}
                UserProfileFormFields={UserProfileFormFields}
                doMakeUserConfirmPassword={true}
              />
            );
        }
      })()}
    </Suspense>
  );
}
