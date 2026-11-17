#!/bin/sh
set -eu

CANLITE_VCAN_MODE=kernel
if ! /usr/sbin/ip link show vcan0 >/dev/null 2>&1; then
    if ! /usr/sbin/ip link add dev vcan0 type vcan >/dev/null 2>&1; then
        CANLITE_VCAN_MODE=userspace
    fi
fi
if [ "$CANLITE_VCAN_MODE" = "kernel" ]; then
    /usr/sbin/ip link set dev vcan0 up
fi
export CANLITE_VCAN_MODE

setpriv --reuid=10001 --regid=10001 --init-groups \
    touch /tmp/canlite-vcan.log

LAB_PROFILES="can-basics can-frame-sender can-monitor attack-chain attack-spoofing attack-replay attack-dos attack-kuksa attack-swupdate ids-rule-based ids-period-based ids-counter-status ids-ips-blocking ids-unknown-id ids-frequency ids-payload-jump ids-gateway"
for profile in $LAB_PROFILES; do
    setpriv --reuid=10001 --regid=10001 --init-groups \
        mkdir -p "/workspace/$profile"
    setpriv --reuid=10001 --regid=10001 --init-groups \
        cp -R /opt/canlite-labs/common/. "/workspace/$profile/"
    if [ -d "/opt/canlite-labs/$profile" ]; then
        setpriv --reuid=10001 --regid=10001 --init-groups \
            cp -R "/opt/canlite-labs/$profile/." "/workspace/$profile/"
    fi
done

# vcan0 creation is the only privileged operation.  The WebSocket server and
# every learner shell run as the unprivileged canlab account without caps.
exec setpriv \
    --reuid=10001 \
    --regid=10001 \
    --init-groups \
    --bounding-set=-all \
    --inh-caps=-all \
    --ambient-caps=-all \
    python -m uvicorn server.lab_terminal_app:app \
    --host 0.0.0.0 \
    --port 8020 \
    --workers 1
