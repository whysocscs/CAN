FROM python:3.12.14-slim-bookworm@sha256:a116514e19457bcb7af7efe9c3dd0b9b71e85b317694e7882a1c52aa15a78134

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/workspace \
    CANLITE_LAB_WORKSPACE=/workspace \
    CANLITE_LAB_SHELL=/bin/bash

WORKDIR /app

RUN groupadd --system --gid 10001 canlab \
    && useradd --system --uid 10001 --gid 10001 --home-dir /workspace --shell /bin/bash canlab \
    && apt-get update \
    && apt-get install --yes --no-install-recommends can-utils iproute2 \
    && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt /tmp/requirements.txt
RUN python -m pip install --no-cache-dir --requirement /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY server ./server
COPY docker/lab-terminal-entrypoint.sh /usr/local/bin/canlite-lab-terminal
COPY lab-terminal-tools/canlite_can_command.py /usr/local/lib/canlite-can-command
COPY lab-workspaces /opt/canlite-labs
RUN chmod 0755 /usr/local/bin/canlite-lab-terminal /usr/local/lib/canlite-can-command \
    && ln -s /usr/local/lib/canlite-can-command /usr/local/bin/cansend \
    && ln -s /usr/local/lib/canlite-can-command /usr/local/bin/candump \
    && ln -s /usr/local/lib/canlite-can-command /usr/local/bin/canplayer \
    && ln -s /usr/local/lib/canlite-can-command /usr/local/bin/ip

EXPOSE 8020

ENTRYPOINT ["/usr/local/bin/canlite-lab-terminal"]
