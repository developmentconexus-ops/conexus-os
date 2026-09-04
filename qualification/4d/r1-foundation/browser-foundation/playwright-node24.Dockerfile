FROM mcr.microsoft.com/playwright@sha256:c091b21d9fae78c76e85cd4356431e9b018402f172a214fc7d7a5e9a7e29d8ac
USER root
RUN curl --fail --silent --show-error --location \
      https://nodejs.org/dist/v24.20.0/node-v24.20.0-linux-x64.tar.gz \
      --output /tmp/node.tar.gz \
    && printf '855d581f8a4eb1a8117e3426de25fe02770592febcfb31369aee1ffbfee9e8ec  /tmp/node.tar.gz\n' | sha256sum --check \
    && tar -xzf /tmp/node.tar.gz -C /opt \
    && rm /tmp/node.tar.gz
ENV PATH=/opt/node-v24.20.0-linux-x64/bin:$PATH
RUN node --version | grep '^v24\.20\.0$'
RUN curl --fail --silent --show-error --location \
      https://registry.npmjs.org/npm/-/npm-12.0.2.tgz \
      --output /tmp/npm.tgz \
    && printf 'b885e890b9418fa1693544d05f53e64f9a73ec194837d4258b15fecdd692347b1dd2a517b1b0cbaf9d31cd8e92c3b70956bd2ecc72833a57b4b3098f5bfa7943  /tmp/npm.tgz\n' | sha512sum --check \
    && mkdir /opt/npm-12 \
    && tar -xzf /tmp/npm.tgz --strip-components=1 -C /opt/npm-12 \
    && rm /tmp/npm.tgz \
    && node /opt/npm-12/bin/npm-cli.js --version | grep '^12\.0\.2$'
USER pwuser
WORKDIR /work
