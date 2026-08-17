"""FastAPI application for the CANLite local terminal."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.routers.terminal import ALLOWED_ORIGINS, router as terminal_router


app = FastAPI(title="CANLite Local Terminal", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(terminal_router)
