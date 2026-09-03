# syntax=docker/dockerfile:1.7
FROM node@sha256:be23f54a88d34e8824c741b19b91064094f92c1c97b194144bfc8b50d67258e2

ARG GIT_VERSION=2.55.0
ARG GIT_SOURCE_SHA256=457fdb04dc8728e007d4688695e6912e6f680727920f2a40bf11eacc17505357
ARG GIT_SIGNATURE_SHA256=8673501946204c38ebfed09603c1f3a041ed8d12b31f0aa06a474d41e359e254
ARG RELEASE_KEY_SHA256=fd2809d850e844b614ac60f13ded554c55d9052e5c799a5814abcba2a68a063c
ARG RELEASE_KEY_FINGERPRINT=E1F036B1FEE7221FC778ECEFB0B5E88696AFE6CB

ADD --checksum=sha256:${GIT_SOURCE_SHA256} \
  https://www.kernel.org/pub/software/scm/git/git-${GIT_VERSION}.tar.xz \
  /tmp/git.tar.xz
ADD --checksum=sha256:${GIT_SIGNATURE_SHA256} \
  https://www.kernel.org/pub/software/scm/git/git-${GIT_VERSION}.tar.sign \
  /tmp/git.tar.sign
ADD --checksum=sha256:${RELEASE_KEY_SHA256} \
  https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x${RELEASE_KEY_FINGERPRINT} \
  /tmp/release-key.asc

RUN test "$(dpkg-query -W -f='${Version}' gcc)" = "4:12.2.0-3" \
  && test "$(dpkg-query -W -f='${Version}' make)" = "4.3-4.1" \
  && test "$(dpkg-query -W -f='${Version}' gnupg)" = "2.2.40-1.1+deb12u2" \
  && test "$(dpkg-query -W -f='${Version}' libcurl4-openssl-dev)" = "7.88.1-10+deb12u15" \
  && test "$(dpkg-query -W -f='${Version}' libexpat1-dev)" = "2.5.0-1+deb12u2" \
  && test "$(dpkg-query -W -f='${Version}' libssl-dev)" = "3.0.20-1~deb12u2" \
  && test "$(dpkg-query -W -f='${Version}' xz-utils)" = "5.4.1-1+deb12u1" \
  && test "$(dpkg-query -W -f='${Version}' zlib1g-dev)" = "1:1.2.13.dfsg-1" \
  && test "$(sha256sum /tmp/git.tar.xz | cut -d' ' -f1)" = "${GIT_SOURCE_SHA256}" \
  && test "$(sha256sum /tmp/git.tar.sign | cut -d' ' -f1)" = "${GIT_SIGNATURE_SHA256}" \
  && test "$(sha256sum /tmp/release-key.asc | cut -d' ' -f1)" = "${RELEASE_KEY_SHA256}" \
  && mkdir -m 0700 /tmp/gnupg \
  && gpg --homedir /tmp/gnupg --import /tmp/release-key.asc \
  && gpg --homedir /tmp/gnupg --with-colons --fingerprint \
    | grep -Fqx "fpr:::::::::${RELEASE_KEY_FINGERPRINT}:" \
  && xz -dc /tmp/git.tar.xz > /tmp/git.tar \
  && gpg --homedir /tmp/gnupg --verify /tmp/git.tar.sign /tmp/git.tar \
  && mkdir /tmp/git-source \
  && tar -xf /tmp/git.tar --strip-components=1 -C /tmp/git-source \
  && cd /tmp/git-source \
  && test "$(./GIT-VERSION-GEN . --format=@GIT_VERSION@)" = "${GIT_VERSION}" \
  && grep -q 'NO_TCLTK' Makefile \
  && grep -q 'NO_GETTEXT' Makefile \
  && grep -q 'NO_RUST' Makefile \
  && make -j2 prefix=/opt/conexus/git-${GIT_VERSION} all NO_TCLTK=YesPlease NO_GETTEXT=YesPlease NO_RUST=YesPlease \
  && make prefix=/opt/conexus/git-${GIT_VERSION} install NO_TCLTK=YesPlease NO_GETTEXT=YesPlease NO_RUST=YesPlease \
  && mkdir -p /opt/conexus/git-${GIT_VERSION}/share/conexus \
  && printf 'NO_TCLTK=YesPlease\nNO_GETTEXT=YesPlease\nNO_RUST=YesPlease\n' > /opt/conexus/git-${GIT_VERSION}/share/conexus/build-flags \
  && test ! -e /opt/conexus/git-${GIT_VERSION}/bin/gitk \
  && test ! -e /opt/conexus/git-${GIT_VERSION}/bin/git-gui \
  && test ! -d /opt/conexus/git-${GIT_VERSION}/share/locale \
  && rm -rf /tmp/git-source /tmp/git.tar /tmp/gnupg

RUN ln -sf /opt/conexus/git-${GIT_VERSION}/bin/git /usr/local/bin/git \
  && /usr/local/bin/git version

LABEL org.opencontainers.image.title="Conexus R1C-14 Git custody qualification"
LABEL org.opencontainers.image.version="2.55.0"
LABEL org.opencontainers.image.source="https://github.com/git/git"
LABEL io.conexus.git.source-sha256="457fdb04dc8728e007d4688695e6912e6f680727920f2a40bf11eacc17505357"
LABEL io.conexus.git.release-key-fingerprint="E1F036B1FEE7221FC778ECEFB0B5E88696AFE6CB"
LABEL io.conexus.git.build-flags="NO_TCLTK=YesPlease NO_GETTEXT=YesPlease NO_RUST=YesPlease"

WORKDIR /qualification
ENTRYPOINT ["/usr/local/bin/git"]
