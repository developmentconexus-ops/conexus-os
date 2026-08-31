FROM quay.io/keycloak/keycloak@sha256:c2a17fe407e892196d0b7cf9cef54e60952d6c372a9205f661a9efa0911463b0
RUN /opt/keycloak/bin/kc.sh build
