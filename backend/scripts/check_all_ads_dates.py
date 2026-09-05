"""
Check the ALL ads to see their active status
"""
import asyncio
import httpx
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

async def check_dates():
    access_token = os.getenv("VITE_FACEBOOK_ACCESS_TOKEN")

    print("=" * 80)
    print("Checking ad dates for Paraquat ads (ALL status)")
    print("=" * 80)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            "https://graph.facebook.com/v21.0/ads_archive",
            params={
                "access_token": access_token,
                "ad_reached_countries": "US",
                "search_terms": "Paraquat",
                "ad_active_status": "ALL",
                "limit": 20,
                "fields": "id,page_name,ad_delivery_start_time,ad_delivery_stop_time,ad_creation_time"
            }
        )
        data = response.json()

        if response.status_code != 200:
            print(f"Error: {data}")
            return

        ads = data.get('data', [])
        print(f"\nTotal ads: {len(ads)}")
        print("\nChecking which ads are currently active:\n")

        active_count = 0
        inactive_count = 0
        today = datetime.now()

        for i, ad in enumerate(ads, 1):
            page = ad.get('page_name', 'Unknown')
            start = ad.get('ad_delivery_start_time')
            stop = ad.get('ad_delivery_stop_time')

            is_active = stop is None or stop == ''
            if is_active:
                active_count += 1
                status = "✅ ACTIVE (no stop date)"
            else:
                inactive_count += 1
                status = f"❌ INACTIVE (stopped: {stop})"

            print(f"{i}. {page[:40]}")
            print(f"   Start: {start}")
            print(f"   Status: {status}")
            print()

        print("=" * 80)
        print(f"Summary: {active_count} active, {inactive_count} inactive")
        print("=" * 80)

        if active_count > 0:
            print("\n🤔 FINDING: The API returns ACTIVE ads when queried with ALL,")
            print("   but returns 0 when queried with ACTIVE status.")
            print("   This suggests the API might be filtering 'Paraquat' ads")
            print("   when ACTIVE filter is applied.")

if __name__ == "__main__":
    asyncio.run(check_dates())
