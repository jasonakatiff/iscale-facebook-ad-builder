#!/usr/bin/env python3
"""
Cron job script to run scheduled searches

Add to crontab to run every hour:
0 * * * * cd /path/to/backend && /path/to/venv/bin/python run_scheduled_searches.py

Or use Railway's cron job feature with this command:
python run_scheduled_searches.py
"""

import asyncio
import sys
import os

# Add the parent directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine
from app.services.scheduler_service import SchedulerService
from app.telemetry.instrumentation import install_instrumentation
from app.telemetry.runtime import collector, capture_exception
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """Run scheduled searches"""
    install_instrumentation(engine)
    collector.start()
    db = SessionLocal()
    try:
        logger.info("Starting scheduled search job")
        scheduler = SchedulerService(db)
        await scheduler.run_scheduled_searches()
        logger.info("Scheduled search job completed")
    except Exception as e:
        capture_exception(e, "scheduler.main")
        logger.error(f"Error running scheduled searches: {str(e)}", exc_info=True)
        sys.exit(1)
    finally:
        db.close()
        collector.stop()


if __name__ == "__main__":
    asyncio.run(main())
