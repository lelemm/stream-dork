FROM electronuserland/builder:wine

WORKDIR /project

ARG USER_ID=1000
ARG GROUP_ID=1000

COPY package.json package-lock.json* ./
COPY electron-builder.yml ./
COPY dist/ ./
COPY src/ ./src/

RUN npm install

RUN groupadd -g $GROUP_ID -o appuser || true && \
    useradd -m -u $USER_ID -g $GROUP_ID appuser || true

RUN mkdir -p /tmp/.cache/electron /tmp/.cache/electron-builder && \
    chown -R appuser:appuser /project /tmp/.cache

USER appuser

CMD ["npm", "run", "build-electron"]

