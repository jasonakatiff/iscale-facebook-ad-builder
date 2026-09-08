"""Built-in LeadRouter account, catalog, and private campaign associations."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.api.v1.campaign_settings import SettingsRoute
from app.core.deps import get_browser_user, get_current_active_user
from app.core.token_encryption import decrypt_token, encrypt_token
from app.database import get_db
from app.models import (
    Brand,
    FacebookCampaign,
    LeadRouterConnection,
    LeadRouterDefault,
    Product,
    User,
    generate_uuid,
)
from app.schemas.platform import Pagination, PlatformError
from app.services import leadrouter_service as provider


def private_response(response: Response):
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    route_class=SettingsRoute,
    dependencies=[Depends(private_response)],
    responses={
        code: {"model": PlatformError} for code in (401, 403, 404, 409, 422, 502, 503)
    },
)
ResourceType = Literal["brand", "product", "campaign"]


class ConnectionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accountType: Literal["partner", "organization"] = "partner"
    apiKey: SecretStr

    @field_validator("apiKey")
    @classmethod
    def portal_key(cls, value):
        raw = value.get_secret_value()
        if (
            not raw.startswith("lr_")
            or not 16 <= len(raw) <= 512
            or not raw.isascii()
            or any(char.isspace() or ord(char) < 33 or ord(char) > 126 for char in raw)
        ):
            raise ValueError(
                "Use a LeadRouter API key beginning lr_. Posting keys cannot list campaigns."
            )
        return value


class ConnectionMetadata(BaseModel):
    id: UUID
    accountType: Literal["partner", "organization"]
    accountName: str
    partnerId: UUID | None
    createdAt: datetime


class ConnectionResult(BaseModel):
    data: ConnectionMetadata | None


class CampaignResult(BaseModel):
    data: provider.Campaign


class DefaultInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    campaignId: UUID
    connectionId: UUID


class DefaultMetadata(BaseModel):
    connectionId: UUID
    resourceType: ResourceType
    resourceId: str
    campaign: provider.Campaign
    updatedAt: datetime


class DefaultResult(BaseModel):
    data: DefaultMetadata | None


class DefaultList(BaseModel):
    data: list[DefaultMetadata]
    pagination: Pagination


def connection(db, user, *, required=True, lock=False):
    query = db.query(LeadRouterConnection).filter(
        LeadRouterConnection.user_id == user.id
    )
    if lock:
        query = query.with_for_update()
    row = query.first()
    if required and row is None:
        raise HTTPException(
            409, "Connect LeadRouter in Connections to use this feature."
        )
    return row


def credential(row):
    try:
        return decrypt_token(row.encrypted_api_key)
    except ValueError:
        raise HTTPException(
            503,
            "The saved LeadRouter connection cannot be opened. Contact your ad workspace administrator.",
        ) from None


def connection_json(row):
    return (
        None
        if row is None
        else {
            "id": row.id,
            "accountType": row.account_type,
            "accountName": row.account_name,
            "partnerId": row.partner_id,
            "createdAt": row.created_at,
        }
    )


def default_json(row):
    return (
        None
        if row is None
        else {
            "connectionId": row.connection_id,
            "resourceType": row.resource_type,
            "resourceId": row.resource_id,
            "campaign": row.campaign,
            "updatedAt": row.updated_at,
        }
    )


def resource(db, resource_type, resource_id):
    # These v1 catalogs are shared by the installation. Only associations are private.
    model = {"brand": Brand, "product": Product, "campaign": FacebookCampaign}[
        resource_type
    ]
    row = db.query(model).filter(model.id == str(resource_id)).first()
    if row is None:
        raise HTTPException(404, "Catalog record not found")
    return row


def default_query(db, row, resource_type, resource_id):
    return db.query(LeadRouterDefault).filter(
        LeadRouterDefault.connection_id == row.id,
        LeadRouterDefault.resource_type == resource_type,
        LeadRouterDefault.resource_id == str(resource_id),
    )


@router.get("/connection", response_model=ConnectionResult)
def read_connection(
    db: Session = Depends(get_db), user: User = Depends(get_current_active_user)
):
    return {"data": connection_json(connection(db, user, required=False))}


@router.put("/connection", response_model=ConnectionResult)
def connect(
    body: ConnectionInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_browser_user),
):
    """Validate and save a private connection. Disconnect before switching accounts."""
    db.query(User).filter(User.id == user.id).with_for_update().one()
    if connection(db, user, required=False):
        raise HTTPException(
            409,
            "Disconnect the current account before connecting another. This clears its saved associations.",
        )
    raw = body.apiKey.get_secret_value()
    name, partner_id = provider.validate_connection(raw, body.accountType)
    row = LeadRouterConnection(
        user_id=user.id,
        account_type=body.accountType,
        account_name=name,
        partner_id=partner_id,
        encrypted_api_key=encrypt_token(raw),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"data": connection_json(row)}


@router.delete("/connection", response_model=ConnectionResult)
def disconnect(db: Session = Depends(get_db), user: User = Depends(get_browser_user)):
    """Remove this user's stored credential and associations; leave LeadRouter unchanged."""
    row = connection(db, user, required=False, lock=True)
    if row:
        db.delete(row)
        db.commit()
    return {"data": None}


@router.get("/campaigns", response_model=provider.CampaignList)
def list_campaigns(
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0, le=100000),
    connectionId: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """Fetch one live page. No polling, ad-spend import, or lead delivery is scheduled."""
    row = connection(db, user)
    if connectionId and row.id != str(connectionId):
        raise HTTPException(
            409, "The LeadRouter connection changed. Reload the picker."
        )
    return provider.campaigns(credential(row), row.account_type, limit, offset)


@router.get("/campaigns/{campaign_id}", response_model=CampaignResult)
def read_campaign(
    campaign_id: UUID,
    connectionId: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = connection(db, user)
    if row.id != str(connectionId):
        raise HTTPException(
            409, "The LeadRouter connection changed. Select a campaign again."
        )
    return {
        "data": provider.find_campaign(credential(row), row.account_type, campaign_id)
    }


@router.get("/defaults", response_model=DefaultList)
def list_defaults(
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = connection(db, user, required=False)
    query = db.query(LeadRouterDefault).filter(
        LeadRouterDefault.connection_id == (row.id if row else "")
    )
    total = query.count()
    rows = (
        query.order_by(LeadRouterDefault.updated_at.desc(), LeadRouterDefault.id)
        .limit(limit)
        .offset(offset)
        .all()
    )
    return {
        "data": [default_json(item) for item in rows],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + len(rows) < total,
        },
    }


@router.get("/defaults/resolve", response_model=DefaultResult)
def resolve_default(
    productId: UUID | None = None,
    brandId: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = connection(db, user, required=False)
    if row is None:
        return {"data": None}
    if productId:
        product = resource(db, "product", productId)
        brandId = product.brand_id
        saved = default_query(db, row, "product", productId).first()
        if saved:
            return {"data": default_json(saved)}
    if brandId:
        resource(db, "brand", brandId)
        return {"data": default_json(default_query(db, row, "brand", brandId).first())}
    return {"data": None}


@router.get("/defaults/{resource_type}/{resource_id}", response_model=DefaultResult)
def read_default(
    resource_type: ResourceType,
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    resource(db, resource_type, resource_id)
    row = connection(db, user, required=False)
    return {
        "data": (
            default_json(default_query(db, row, resource_type, resource_id).first())
            if row
            else None
        )
    }


@router.put("/defaults/{resource_type}/{resource_id}", response_model=DefaultResult)
def save_default(
    resource_type: ResourceType,
    resource_id: str,
    body: DefaultInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    resource(db, resource_type, resource_id)
    row = connection(db, user, lock=True)
    if row.id != str(body.connectionId):
        raise HTTPException(
            409, "The LeadRouter connection changed. Select a campaign again."
        )
    campaign = provider.find_campaign(
        credential(row), row.account_type, body.campaignId
    )
    if campaign.status != "active":
        raise HTTPException(422, "Choose an active LeadRouter campaign.")
    from sqlalchemy.sql import func

    values = {
        "campaign_id": str(campaign.id),
        "campaign": campaign.model_dump(mode="json"),
        "updated_at": func.now(),
    }
    db.execute(
        insert(LeadRouterDefault)
        .values(
            id=generate_uuid(),
            connection_id=row.id,
            resource_type=resource_type,
            resource_id=str(resource_id),
            **values
        )
        .on_conflict_do_update(constraint="uq_leadrouter_default", set_=values)
    )
    db.commit()
    return {
        "data": default_json(default_query(db, row, resource_type, resource_id).first())
    }


@router.delete("/defaults/{resource_type}/{resource_id}", response_model=DefaultResult)
def remove_default(
    resource_type: ResourceType,
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = connection(db, user, required=False, lock=True)
    if row:
        default_query(db, row, resource_type, resource_id).delete()
        db.commit()
    return {"data": None}
