"""Refuse to label modified tracked upstream code as a pinned commit build."""

import subprocess
from pathlib import Path


def require_clean_source(source: Path) -> None:
    status = subprocess.run(
        ["git", "-C", str(source), "diff", "--quiet", "HEAD", "--"],
        capture_output=True, text=True, timeout=5,
    )
    if status.returncode != 0:
        raise ValueError(f"Upstream tracked source differs from HEAD: {source}")
