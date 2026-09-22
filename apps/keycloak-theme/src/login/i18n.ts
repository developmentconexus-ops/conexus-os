import { i18nBuilder } from "keycloakify/login";

/** pt-BR is Keycloak's default set already; the one override here matches
 * the approved design's exact copy ("Esqueci a senha", not the stock
 * "Esqueceu sua senha?"). */
const { useI18n, ofTypeI18n } = i18nBuilder
  .withThemeName<"conexus">()
  .withCustomTranslations({
    "pt-BR": {
      doForgotPassword: "Esqueci a senha",
    },
  })
  .build();

type I18n = typeof ofTypeI18n;

export { useI18n };
export type { I18n };
