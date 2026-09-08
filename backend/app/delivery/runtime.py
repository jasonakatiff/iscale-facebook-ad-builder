import logging
import threading

from app.delivery import config
from app.delivery.queue import posting_tick
from app.delivery.sync import sync_tick
from app.analytics.sync import analytics_tick

logger = logging.getLogger(__name__)


class DeliveryWorkers:
    def __init__(self):
        self.stop_event = threading.Event()
        self.threads = []

    def start(self, engine):
        if not config.WORKER_ENABLED or self.threads:
            return
        self.stop_event.clear()
        for name, tick in [("posting", posting_tick), ("sync", sync_tick), ("analytics", analytics_tick)]:
            thread = threading.Thread(
                target=self.run,
                args=(engine, tick),
                name="delivery-" + name,
                daemon=True,
            )
            self.threads.append(thread)
            thread.start()

    def run(self, engine, tick):
        while not self.stop_event.is_set():
            try:
                tick(engine)
            except Exception as error:
                logger.error("Delivery worker tick failed: %s", type(error).__name__)
            self.stop_event.wait(config.WORKER_INTERVAL)

    def stop(self):
        self.stop_event.set()
        for thread in self.threads:
            thread.join(timeout=35)
            if thread.is_alive():
                logger.error(
                    "Delivery worker is still finishing a provider request: %s",
                    thread.name,
                )
        self.threads = [thread for thread in self.threads if thread.is_alive()]


workers = DeliveryWorkers()
