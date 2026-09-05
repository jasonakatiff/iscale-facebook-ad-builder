"""
Cleanup script to delete all saved searches and scraped ads.
Keeps: verticals, page_blacklist, keyword_blacklist, facebook_pages
"""
from app.database import SessionLocal
from app.models import SavedSearch, ScrapedAd, FacebookPage
from sqlalchemy import text

def cleanup():
    db = SessionLocal()
    try:
        # Delete all scraped ads (cascades from saved_searches)
        print("Deleting scraped ads...")
        deleted_ads = db.query(ScrapedAd).delete()
        print(f"Deleted {deleted_ads} scraped ads")

        # Delete all saved searches
        print("Deleting saved searches...")
        deleted_searches = db.query(SavedSearch).delete()
        print(f"Deleted {deleted_searches} saved searches")

        # Reset facebook_pages total_ads to 0
        print("Resetting Facebook pages total_ads...")
        db.query(FacebookPage).update({FacebookPage.total_ads: 0})

        # Delete API usage logs (optional - uncomment if you want clean slate)
        # print("Deleting API usage logs...")
        # db.execute(text("DELETE FROM api_usage_logs"))

        db.commit()
        print("\n✅ Cleanup complete!")
        print("✅ Kept: verticals, page_blacklist, keyword_blacklist")
        print("✅ Deleted: all saved_searches, scraped_ads")
        print("✅ Reset: facebook_pages.total_ads to 0")

    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("Starting cleanup...")
    print("This will delete ALL saved searches and scraped ads.")
    print("Verticals and blacklists will be kept.\n")
    cleanup()
