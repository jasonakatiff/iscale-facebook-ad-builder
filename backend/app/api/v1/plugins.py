"""Private local packages and a shared API for all installed plugins."""

from datetime import timedelta
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.v1.campaign_settings import SettingsRoute, failure
from app.core import plugin_config as limits
from app.core.deps import get_browser_user, get_current_active_user
from app.database import get_db
from app.models import PluginInstallation, PluginRun, User
from app.schemas.platform import PlatformError
from app.schemas.plugins import (
    ClaimResult,
    HeartbeatResult,
    LeaseRequest,
    PluginDocument,
    PluginList,
    PluginPatch,
    PluginResult,
    RunCreate,
    RunList,
    RunResult,
    WorkerJobList,
    WorkerKeyCreate,
    WorkerKeyResult,
    WorkerResult,
)
from app.services import plugin_service as service


class PluginRoute(SettingsRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def route(request):
            data = bytearray()
            async for chunk in request.stream():
                data.extend(chunk)
                if len(data) > limits.MAX_REQUEST_BYTES:
                    return failure(
                        413,
                        "PAYLOAD_TOO_LARGE",
                        "Plugin requests must be 256 KB or smaller",
                    )
            request._body = bytes(data)
            try:
                response = await handler(request)
            except RecursionError:
                response = failure(
                    422, "VALIDATION_ERROR", "Plugin data is nested too deeply"
                )
            response.headers["Cache-Control"] = "no-store"
            return response

        return route


responses = {code: {"model": PlatformError} for code in (401, 403, 404, 409, 413, 422)}
router = APIRouter(route_class=PluginRoute, responses=responses)
worker_router = APIRouter(route_class=PluginRoute, responses=responses)
worker_bearer = HTTPBearer(
    auto_error=False,
    scheme_name="PluginWorkerBearer",
    description="Installation-scoped bwp_worker_ credential. No general platform or advertising permissions.",
)


def worker_credential(
    credentials: HTTPAuthorizationCredentials | None = Depends(worker_bearer),
):
    if credentials is None:
        raise HTTPException(401, "Service credential required")
    return credentials.credentials


@router.post("/validate", response_model=PluginDocument)
def validate_package(
    body: PluginDocument, user: User = Depends(get_current_active_user)
):
    return body


@router.get("/examples", response_model=list[PluginDocument])
def examples(user: User = Depends(get_current_active_user)):
    folder = Path(__file__).resolve().parents[2] / "plugin_examples"
    return [
        PluginDocument.model_validate_json(path.read_text())
        for path in sorted(folder.glob("*.json"))
    ]


@router.get("/example-worker", response_class=Response)
def example_worker(user: User = Depends(get_current_active_user)):
    path = Path(__file__).resolve().parents[2] / "plugin_examples/plugin-worker.py"
    return Response(
        path.read_text(),
        media_type="text/x-python",
        headers={"Content-Disposition": 'attachment; filename="plugin-worker.py"'},
    )


@router.get("", response_model=PluginList)
def list_plugins(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    query = db.query(PluginInstallation).filter_by(user_id=user.id, archived_at=None)
    total = query.count()
    rows = (
        query.order_by(PluginInstallation.created_at.desc(), PluginInstallation.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "data": [service.plugin_payload(row) for row in rows],
        "pagination": service.pagination(total, limit, offset, len(rows)),
    }


@router.post("", response_model=PluginResult, status_code=201)
def install_plugin(
    body: PluginDocument,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row, created = service.install(db, user, body)
    response.status_code = 201 if created else 200
    return {"data": service.plugin_payload(row)}


@router.get("/runs", response_model=RunList)
def list_runs(
    pluginId: UUID | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    query = (
        db.query(PluginRun, PluginInstallation)
        .join(PluginInstallation)
        .filter(PluginInstallation.user_id == user.id)
    )
    if pluginId:
        query = query.filter(PluginRun.installation_id == str(pluginId))
    total = query.count()
    rows = (
        query.order_by(PluginRun.created_at.desc(), PluginRun.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    for installation_id in sorted({installation.id for _, installation in rows}):
        service.expire_runs(db, installation_id)
    db.commit()
    return {
        "data": [service.run_payload(row, installation) for row, installation in rows],
        "pagination": service.pagination(total, limit, offset, len(rows)),
    }


@router.get("/runs/{run_id}", response_model=RunResult)
def read_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    installation, row = service.owned_run(db, user.id, run_id)
    result = service.run_payload(row, installation)
    db.commit()
    return {"data": result}


@router.post("/runs/{run_id}/cancel", response_model=RunResult)
def cancel_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    installation, row = service.owned_run(db, user.id, run_id)
    if row.status in service.PENDING:
        row.status = "cancelled"
        row.completed_at = service.now()
    result = service.run_payload(row, installation)
    db.commit()
    return {"data": result}


@router.get("/{plugin_id}", response_model=PluginResult)
def get_plugin(
    plugin_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    return {"data": service.plugin_payload(service.owned(db, user.id, plugin_id))}


@router.get("/{plugin_id}/package", response_model=PluginDocument)
def export_package(
    plugin_id: UUID,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = service.owned(db, user.id, plugin_id)
    response.headers["Content-Disposition"] = (
        f'attachment; filename="{row.slug}-{row.version}.json"'
    )
    return row.document


@router.patch("/{plugin_id}", response_model=PluginResult)
def update_plugin(
    plugin_id: UUID,
    body: PluginPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = service.owned(db, user.id, plugin_id)
    if body.configuration is not None:
        document = PluginDocument.model_validate(row.document)
        row.configuration = service.bound_values(
            document.configFields, body.configuration, require=False
        )
    if body.enabled is not None:
        row.enabled = body.enabled
        if not row.enabled:
            service.revoke_worker(db, row)
    row.updated_at = service.now()
    db.commit()
    return {"data": service.plugin_payload(row)}


@router.delete("/{plugin_id}", response_model=PluginResult)
def uninstall_plugin(
    plugin_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = service.owned(db, user.id, plugin_id)
    service.revoke_worker(db, row)
    row.archived_at = service.now()
    row.enabled = False
    db.commit()
    return {"data": service.plugin_payload(row)}


@router.post(
    "/{plugin_id}/runs",
    response_model=RunResult,
    status_code=202,
    responses={200: {"model": RunResult}, 201: {"model": RunResult}},
)
def start_run(
    plugin_id: UUID,
    body: RunCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    result, code = service.create_run(db, user, plugin_id, body)
    response.status_code = code
    return {"data": result}


@router.post("/{plugin_id}/worker-key", response_model=WorkerKeyResult, status_code=201)
def connect_worker(
    plugin_id: UUID,
    body: WorkerKeyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_browser_user),
):
    row = service.owned(db, user.id, plugin_id)
    raw = service.mint_worker(db, row, body.expiresInDays)
    return {"data": service.plugin_payload(row), "workerKey": raw}


@router.delete("/{plugin_id}/worker-key", response_model=PluginResult)
def disconnect_worker(
    plugin_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_browser_user),
):
    row = service.owned(db, user.id, plugin_id)
    service.revoke_worker(db, row)
    db.commit()
    return {"data": service.plugin_payload(row)}


@worker_router.get("/jobs", response_model=WorkerJobList)
def worker_jobs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    credential: str = Depends(worker_credential),
    db: Session = Depends(get_db),
):
    installation = service.worker_installation(db, credential)
    query = db.query(PluginRun).filter_by(
        installation_id=installation.id, status="queued"
    )
    total = query.count()
    rows = (
        query.order_by(PluginRun.created_at, PluginRun.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    result = {
        "data": [
            {
                "id": row.id,
                "pluginId": row.installation_id,
                "createdAt": row.created_at,
                "expiresAt": row.expires_at,
            }
            for row in rows
        ],
        "pagination": service.pagination(total, limit, offset, len(rows)),
    }
    db.commit()
    return result


@worker_router.post("/jobs/{run_id}/claim", response_model=ClaimResult)
def claim_job(
    run_id: UUID,
    credential: str = Depends(worker_credential),
    db: Session = Depends(get_db),
):
    import secrets

    installation = service.worker_installation(db, credential)
    row = service.worker_run(db, installation, run_id)
    if row.status != "queued":
        raise HTTPException(409, "This job is no longer queued")
    lease = secrets.token_urlsafe(32)
    row.status = "running"
    row.lease_hash = service.token_hash(lease)
    row.worker_generation = installation.worker_generation
    row.lease_expires_at = min(
        row.expires_at, service.now() + timedelta(seconds=limits.LEASE_SECONDS)
    )
    result = {
        "data": service.run_payload(row, installation),
        "leaseToken": lease,
        "leaseExpiresAt": row.lease_expires_at,
    }
    db.commit()
    return result


@worker_router.post("/jobs/{run_id}/heartbeat", response_model=HeartbeatResult)
def heartbeat(
    run_id: UUID,
    body: LeaseRequest,
    credential: str = Depends(worker_credential),
    db: Session = Depends(get_db),
):
    installation = service.worker_installation(db, credential)
    row = service.worker_run(db, installation, run_id)
    service.check_lease(row, installation, body.leaseToken)
    row.lease_expires_at = min(
        row.expires_at, service.now() + timedelta(seconds=limits.LEASE_SECONDS)
    )
    result = {"leaseExpiresAt": row.lease_expires_at}
    db.commit()
    return result


@worker_router.post("/jobs/{run_id}/result", response_model=RunResult)
def complete_job(
    run_id: UUID,
    body: WorkerResult,
    credential: str = Depends(worker_credential),
    db: Session = Depends(get_db),
):
    installation = service.worker_installation(db, credential)
    row = service.worker_run(db, installation, run_id)
    service.check_lease(row, installation, body.leaseToken, terminal=True)
    state = "failed" if body.failed else "succeeded"
    output = None if body.failed else body.output
    if row.status in ("succeeded", "failed"):
        if row.status != state or service.digest(row.output) != service.digest(output):
            raise HTTPException(409, "This run already has a different result")
    else:
        row.status = state
        row.output = output
        row.error = "The service could not complete this run." if body.failed else None
        row.completed_at = service.now()
    result = service.run_payload(row, installation)
    db.commit()
    return {"data": result}
