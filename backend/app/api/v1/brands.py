from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Brand as BrandModel, Product as ProductModel, CustomerProfile as ProfileModel, User
from app.schemas.brand import Brand, BrandCreate, BrandUpdate
from app.core.deps import get_current_active_user, require_permission

router = APIRouter()

@router.get("", response_model=List[Brand])
def read_brands(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    brands = db.query(BrandModel).offset(skip).limit(limit).all()
    return brands

@router.post("", response_model=Brand)
def create_brand(
    brand: BrandCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("brands:write"))
):
    db_brand = BrandModel(
        id=brand.id,
        name=brand.name,
        logo=brand.logo,
        voice=brand.voice,
        primary_color=brand.colors.primary,
        secondary_color=brand.colors.secondary,
        highlight_color=brand.colors.highlight
    )
    db.add(db_brand)
    db.commit()
    db.refresh(db_brand)

    if brand.products:
        for p in brand.products:
            db_product = ProductModel(
                id=p.id,
                brand_id=db_brand.id,
                name=p.name,
                description=p.description,
                product_shots=p.product_shots
            )
            db.add(db_product)
    
    if brand.profileIds:
        for pid in brand.profileIds:
            profile = db.query(ProfileModel).filter(ProfileModel.id == pid).first()
            if profile:
                db_brand.profiles.append(profile)
    
    db.commit()
    db.refresh(db_brand)
    return db_brand

@router.delete("/{brand_id}")
def delete_brand(
    brand_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("brands:delete"))
):
    db_brand = db.query(BrandModel).filter(BrandModel.id == brand_id).first()
    if db_brand is None:
        raise HTTPException(status_code=404, detail="Brand not found")
    db.delete(db_brand)
    db.commit()
    return {"success": True}

@router.put("/{brand_id}", response_model=Brand)
def update_brand(
    brand_id: str,
    brand: BrandUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("brands:write"))
):
    db_brand = db.query(BrandModel).filter(BrandModel.id == brand_id).first()
    if not db_brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Update basic fields
    db_brand.name = brand.name
    db_brand.logo = brand.logo
    db_brand.voice = brand.voice
    db_brand.primary_color = brand.colors.primary
    db_brand.secondary_color = brand.colors.secondary
    db_brand.highlight_color = brand.colors.highlight

    # Update Products
    existing_products = {p.id: p for p in db_brand.products}
    incoming_product_ids = set()

    if brand.products:
        for p in brand.products:
            if p.id:
                incoming_product_ids.add(p.id)
            
            if p.id and p.id in existing_products:
                # Product already belongs to this brand - update it
                existing_product = existing_products[p.id]
                existing_product.name = p.name
                existing_product.description = p.description
                existing_product.product_shots = p.product_shots
            elif p.id:
                # Product exists but belongs to another brand - reassign it
                existing_product = db.query(ProductModel).filter(ProductModel.id == p.id).first()
                if existing_product:
                    # Reassign to this brand
                    existing_product.brand_id = brand_id
                    existing_product.name = p.name
                    existing_product.description = p.description
                    existing_product.product_shots = p.product_shots
                else:
                    # Product doesn't exist at all - create new
                    import uuid
                    new_product = ProductModel(
                        id=p.id,
                        brand_id=brand_id,
                        name=p.name,
                        description=p.description,
                        product_shots=p.product_shots
                    )
                    db.add(new_product)
            else: # p.id is None, so it's a new product without a pre-assigned ID
                # Create new product with a generated ID
                import uuid
                new_id = str(uuid.uuid4())
                new_product = ProductModel(
                    id=new_id,
                    brand_id=brand_id,
                    name=p.name,
                    description=p.description,
                    product_shots=p.product_shots
                )
                db.add(new_product)
                incoming_product_ids.add(new_id) # Add the newly generated ID to track it
    
    # Remove products that are no longer assigned to this brand
    for pid, p in existing_products.items():
        if pid not in incoming_product_ids:
            # Don't delete, just unassign (set brand_id to None or delete)
            # For now, we'll delete them as per original behavior
            db.delete(p)

    # Update Profiles
    if brand.profileIds is not None:
        # Clear existing associations
        db_brand.profiles = []
        # Add new associations
        for pid in brand.profileIds:
            profile = db.query(ProfileModel).filter(ProfileModel.id == pid).first()
            if profile:
                db_brand.profiles.append(profile)

    db.commit()
    db.refresh(db_brand)
    return db_brand
