from app.telemetry.runtime import capture_exception
from sqlalchemy.orm import Session
from app.models import SavedSearch
from app.services.research_service import ResearchService
from app.schemas.research import AdSearchRequest
from datetime import datetime, timedelta
from app.telemetry.runtime import observe
import logging

logger = logging.getLogger(__name__)


class SchedulerService:
    """Service for managing and executing scheduled searches"""

    def __init__(self, db: Session):
        self.db = db
        self.research_service = ResearchService(db)

    def get_due_searches(self) -> list[SavedSearch]:
        """Get all scheduled searches that are due to run"""
        now = datetime.now()

        # Get active scheduled searches
        searches = self.db.query(SavedSearch).filter(
            SavedSearch.search_type.in_(['scheduled_daily', 'scheduled_weekly']),
            SavedSearch.is_active == True
        ).all()

        due_searches = []
        for search in searches:
            if self._is_due(search, now):
                due_searches.append(search)

        return due_searches

    def _is_due(self, search: SavedSearch, now: datetime) -> bool:
        """Check if a scheduled search is due to run"""
        if not search.last_run:
            # Never run before - it's due
            return True

        if search.search_type == 'scheduled_daily':
            # Run if last run was more than 24 hours ago
            return now - search.last_run >= timedelta(hours=24)

        elif search.search_type == 'scheduled_weekly':
            # Run if last run was more than 7 days ago
            return now - search.last_run >= timedelta(days=7)

        return False

    @observe("research.scheduled_search", kind="job")
    async def execute_scheduled_search(self, search: SavedSearch):
        """Execute a scheduled search and update last_run timestamp"""
        try:
            logger.info(f"Executing scheduled search: {search.query} ({search.search_type})")

            # Create request from saved search
            request = AdSearchRequest(
                query=search.query,
                country=search.country or 'US',
                negative_keywords=search.negative_keywords or [],
                vertical_id=search.vertical_id,
                limit=100,  # Default limit for scheduled searches
                search_type=search.search_type
            )

            # Execute search (this will create a new SavedSearch entry with ads)
            await self.research_service.search_and_save(request)

            # Update last_run timestamp on the template search
            search.last_run = datetime.now()
            self.db.commit()

            logger.info(f"Successfully executed scheduled search: {search.query}")

        except Exception as e:
            capture_exception(e, "scheduler_service.execute_scheduled_search")
            logger.error(f"Failed to execute scheduled search {search.id}: {str(e)}")
            raise

    @observe("research.scheduler", kind="job")
    async def run_scheduled_searches(self):
        """Main method to run all due scheduled searches"""
        due_searches = self.get_due_searches()

        if not due_searches:
            logger.info("No scheduled searches due")
            return

        logger.info(f"Found {len(due_searches)} scheduled searches to run")

        for search in due_searches:
            try:
                await self.execute_scheduled_search(search)
            except Exception as e:
                capture_exception(e, "scheduler_service.run_scheduled_searches")
                logger.error(f"Error running scheduled search {search.id}: {str(e)}")
                continue
