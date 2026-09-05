"""
Copy production brands, products, and customer profiles to dev database.

Usage:
    PROD_DATABASE_URL="postgresql://..." python copy_prod_to_dev.py
"""
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Brand, Product, CustomerProfile
from app.database import SessionLocal
from dotenv import load_dotenv

# Load from .env.local (where PROD_DATABASE_URL is stored)
load_dotenv('../.env.local')

def copy_prod_to_dev():
    # Get production DATABASE_URL from environment
    prod_db_url = os.getenv('PRD_DATABASE_URL')
    if not prod_db_url:
        print("❌ Error: PRD_DATABASE_URL environment variable not set")
        print("\nUsage:")
        print("  PRD_DATABASE_URL='postgresql://user:pass@host:port/db' python copy_prod_to_dev.py")
        print("\nGet the production DATABASE_URL from Railway dashboard:")
        print("  1. Go to Railway dashboard")
        print("  2. Select production environment")
        print("  3. Click on Postgres service")
        print("  4. Go to Variables tab")
        print("  5. Copy DATABASE_URL value")
        sys.exit(1)

    # Connect to production database
    print("Connecting to production database...")
    prod_engine = create_engine(prod_db_url)
    ProdSession = sessionmaker(bind=prod_engine)
    prod_db = ProdSession()

    # Connect to dev database (from .env.local)
    print("Connecting to dev database...")
    dev_db = SessionLocal()

    try:
        # Copy Brands
        print("\n" + "="*60)
        print("Copying Brands...")
        print("="*60)
        prod_brands = prod_db.query(Brand).all()
        print(f"Found {len(prod_brands)} brands in production")

        brand_id_map = {}  # Map old IDs to new IDs
        for brand in prod_brands:
            # Check if brand already exists in dev
            existing = dev_db.query(Brand).filter(Brand.name == brand.name).first()
            if existing:
                print(f"  ⚠️  Brand '{brand.name}' already exists in dev, skipping")
                brand_id_map[brand.id] = existing.id
                continue

            # Create new brand in dev
            new_brand = Brand(
                name=brand.name,
                logo=brand.logo,
                primary_color=brand.primary_color,
                secondary_color=brand.secondary_color,
                highlight_color=brand.highlight_color,
                voice=brand.voice
            )
            dev_db.add(new_brand)
            dev_db.flush()  # Get the new ID
            brand_id_map[brand.id] = new_brand.id
            print(f"  ✅ Copied brand '{brand.name}'")

        dev_db.commit()
        print(f"\n✅ Copied {len(brand_id_map)} brands")

        # Copy Products
        print("\n" + "="*60)
        print("Copying Products...")
        print("="*60)
        prod_products = prod_db.query(Product).all()
        print(f"Found {len(prod_products)} products in production")

        for product in prod_products:
            # Check if product already exists
            existing = dev_db.query(Product).filter(
                Product.name == product.name,
                Product.brand_id == brand_id_map.get(product.brand_id)
            ).first()
            if existing:
                print(f"  ⚠️  Product '{product.name}' already exists, skipping")
                continue

            # Create new product with mapped brand_id
            new_product = Product(
                name=product.name,
                description=product.description,
                default_url=product.default_url,
                product_shots=product.product_shots,
                brand_id=brand_id_map.get(product.brand_id)
            )
            dev_db.add(new_product)
            print(f"  ✅ Copied product '{product.name}'")

        dev_db.commit()
        print(f"\n✅ Copied products")

        # Copy Customer Profiles
        print("\n" + "="*60)
        print("Copying Customer Profiles...")
        print("="*60)
        prod_profiles = prod_db.query(CustomerProfile).all()
        print(f"Found {len(prod_profiles)} customer profiles in production")

        profile_id_map = {}
        for profile in prod_profiles:
            # Check if profile already exists
            existing = dev_db.query(CustomerProfile).filter(
                CustomerProfile.name == profile.name
            ).first()
            if existing:
                print(f"  ⚠️  Profile '{profile.name}' already exists, skipping")
                profile_id_map[profile.id] = existing.id
                continue

            # Create new profile
            new_profile = CustomerProfile(
                name=profile.name,
                demographics=profile.demographics,
                pain_points=profile.pain_points,
                goals=profile.goals
            )
            dev_db.add(new_profile)
            dev_db.flush()
            profile_id_map[profile.id] = new_profile.id
            print(f"  ✅ Copied profile '{profile.name}'")

        dev_db.commit()
        print(f"\n✅ Copied {len(profile_id_map)} customer profiles")

        # Copy brand-profile associations
        print("\n" + "="*60)
        print("Copying brand-profile associations...")
        print("="*60)
        from sqlalchemy import text

        # Get associations from production
        result = prod_db.execute(text("SELECT brand_id, profile_id FROM brand_profiles"))
        associations = result.fetchall()
        print(f"Found {len(associations)} associations")

        for brand_id, profile_id in associations:
            new_brand_id = brand_id_map.get(brand_id)
            new_profile_id = profile_id_map.get(profile_id)

            if new_brand_id and new_profile_id:
                # Check if association already exists
                existing = dev_db.execute(text(
                    "SELECT 1 FROM brand_profiles WHERE brand_id = :brand_id AND profile_id = :profile_id"
                ), {"brand_id": new_brand_id, "profile_id": new_profile_id}).fetchone()

                if not existing:
                    dev_db.execute(text(
                        "INSERT INTO brand_profiles (brand_id, profile_id) VALUES (:brand_id, :profile_id)"
                    ), {"brand_id": new_brand_id, "profile_id": new_profile_id})
                    print(f"  ✅ Linked brand-profile association")

        dev_db.commit()
        print("\n" + "="*60)
        print("✅ All data copied successfully!")
        print("="*60)

        # Summary
        dev_brand_count = dev_db.query(Brand).count()
        dev_product_count = dev_db.query(Product).count()
        dev_profile_count = dev_db.query(CustomerProfile).count()

        print(f"\nDev database now has:")
        print(f"  Brands: {dev_brand_count}")
        print(f"  Products: {dev_product_count}")
        print(f"  Customer Profiles: {dev_profile_count}")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        dev_db.rollback()
    finally:
        prod_db.close()
        dev_db.close()

if __name__ == "__main__":
    copy_prod_to_dev()
