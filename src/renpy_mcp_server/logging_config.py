"""Configure application logging for human-readable output."""

from __future__ import annotations

import logging

import structlog
import structlog.contextvars


def configure_logging(level: int = logging.INFO) -> None:
    """Configure structlog for console-friendly output."""
    timestamper = structlog.processors.TimeStamper(fmt="ISO", utc=True)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            timestamper,
            structlog.processors.add_log_level,
            structlog.processors.EventRenamer("message"),
            structlog.dev.ConsoleRenderer(),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(level=level)
