"""Real app/auth/PostgreSQL fixture, restricted to local test databases."""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException

from tests import feedback_server as fixture
from app.core.deps import get_current_active_user
from app.core.security import get_password_hash
from app.core.token_encryption import encrypt_token
from app.database import SessionLocal, get_db
from app.models import MetaAdsConnection, User, Workspace, WorkspaceAccount

app = fixture.app
with SessionLocal() as db:
    owner = db.query(User).filter_by(email=fixture.os.environ["TEST_EMAIL"]).one()
    for account_id, name in [
        ("act_123", "test-Primary Meta"),
        ("act_456", "test-Second Meta"),
    ]:
        if (
            not db.query(MetaAdsConnection)
            .filter_by(user_id=owner.id, ad_account_id=account_id)
            .first()
        ):
            db.add(
                MetaAdsConnection(
                    user_id=owner.id,
                    ad_account_id=account_id,
                    account_name=name,
                    encrypted_access_token=encrypt_token(
                        "test-workspace-browser-token"
                    ),
                    access_token_expires_at=datetime.now(timezone.utc)
                    + timedelta(days=10),
                    is_active=account_id == "act_123",
                )
            )
    for email in [
        "test-workspace-viewer@example.com",
        "test-workspace-buyer@example.com",
    ]:
        if not db.query(User).filter_by(email=email).first():
            db.add(
                User(
                    email=email,
                    name=email.split("@")[0],
                    hashed_password=get_password_hash("test-workspace-password"),
                    is_active=True,
                )
            )
    db.commit()


@app.delete("/api/test-workspaces/{workspace_id}")
def cleanup_workspace(
    workspace_id: str, user=Depends(get_current_active_user), db=Depends(get_db)
):
    if not user.is_superuser or not user.email.startswith("test-"):
        raise HTTPException(403, "Test administrator required")
    row = db.get(Workspace, workspace_id)
    if row and not row.name.startswith("test-"):
        raise HTTPException(403, "Test workspace required")
    if row:
        db.delete(row)
        db.commit()
    return {"deleted": workspace_id}


@app.post("/api/test-workspaces/{workspace_id}/reissue/{account_id}")
def reissue_connection(
    workspace_id: str,
    account_id: str,
    user=Depends(get_current_active_user),
    db=Depends(get_db),
):
    workspace = db.get(Workspace, workspace_id)
    account = (
        db.query(WorkspaceAccount)
        .filter_by(id=account_id, workspace_id=workspace_id)
        .first()
    )
    if (
        not user.is_superuser
        or not user.email.startswith("test-")
        or not workspace
        or not workspace.name.startswith("test-")
        or not account
    ):
        raise HTTPException(403, "Test administrator and workspace required")
    connection = db.get(MetaAdsConnection, account.meta_connection_id)
    if not connection or connection.user_id != user.id:
        raise HTTPException(403, "Owned test connection required")
    account_id = connection.ad_account_id
    db.delete(connection)
    db.flush()
    db.add(
        MetaAdsConnection(
            user_id=user.id,
            ad_account_id=account_id,
            account_name="test-Reissued Meta",
            encrypted_access_token=encrypt_token("test-reissued-token"),
            access_token_expires_at=datetime.now(timezone.utc) + timedelta(days=10),
            is_active=False,
        )
    )
    db.commit()
    return {"reissued": account_id}
