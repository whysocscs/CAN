"""FastAPI application for the CANLite local terminal."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.routers.can import pump, router as can_router
from server.routers.can_attack_labs import router as can_attack_labs_router
from server.routers.labs import router as labs_router
from server.routers.terminal import ALLOWED_ORIGINS, router as terminal_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # candump 구독은 프로세스당 하나만 띄웁니다.
    task = asyncio.create_task(pump())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="CANLite Local Terminal", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(terminal_router)
app.include_router(can_router)
app.include_router(labs_router)
app.include_router(can_attack_labs_router)
