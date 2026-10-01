"""FastAPI application for the CANLite local terminal."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.routers.can import pump, router as can_router
from server.routers.can_attack_labs import router as can_attack_labs_router
from server.routers.cve_labs import router as cve_labs_router
from server.routers.kuksa_repro import router as kuksa_repro_router
from server.routers.kuksa_hands_on import (
    manager as kuksa_hands_on_manager,
    router as kuksa_hands_on_router,
)
from server.routers.labs import router as labs_router
from server.routers.ids_ips import router as ids_ips_router
from server.routers.swupdate_repro import router as swupdate_repro_router
from server.routers.terminal import ALLOWED_ORIGINS, router as terminal_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # candump 구독은 프로세스당 하나만 띄웁니다.
    task = asyncio.create_task(pump())
    try:
        yield
    finally:
        task.cancel()
        kuksa_hands_on_manager.shutdown()


app = FastAPI(title="CANLite Local Terminal", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(terminal_router)
app.include_router(can_router)
app.include_router(labs_router)
app.include_router(ids_ips_router)
app.include_router(can_attack_labs_router)
app.include_router(cve_labs_router)
app.include_router(kuksa_repro_router)
app.include_router(kuksa_hands_on_router)
app.include_router(swupdate_repro_router)
