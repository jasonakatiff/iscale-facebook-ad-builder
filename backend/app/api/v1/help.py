"""Public, credential-free documentation generated from the running API contract."""

import io
import json
import os
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

router = APIRouter()
DOCS = Path(__file__).resolve().parents[2] / "docs"


def available_docs():
    return {path.stem: path for path in sorted(DOCS.glob("*.md"))}


@router.get("/docs")
def list_docs():
    return {
        "data": [
            {
                "slug": slug,
                "title": path.read_text().splitlines()[0].removeprefix("# "),
                "filename": path.name,
            }
            for slug, path in available_docs().items()
        ]
    }


@router.get("/docs/{slug}", response_class=Response)
def read_doc(slug: str, download: bool = False):
    path = available_docs().get(slug)
    if path is None:
        raise HTTPException(404, "Guide not found")
    headers = (
        {"Content-Disposition": f'attachment; filename="{path.name}"'}
        if download
        else {}
    )
    return Response(path.read_text(), media_type="text/markdown", headers=headers)


def endpoint_index(schema):
    lines = [
        "# theLeadRouter — Ad Studio API endpoint index",
        "",
        "Generated from this deployment’s OpenAPI contract. See openapi.json for schemas and permissions.",
        "",
        "| Method | Path | Operation |",
        "| --- | --- | --- |",
    ]
    for path, methods in schema["paths"].items():
        for method, operation in methods.items():
            if method in {"get", "post", "put", "patch", "delete", "head", "options"}:
                summary = (
                    operation.get("summary", "").replace("|", "\\|").replace("\n", " ")
                )
                lines.append(f"| {method.upper()} | `{path}` | {summary} |")
    return "\n".join(lines) + "\n"


@router.get("/download", response_class=Response)
def download_bundle(request: Request):
    schema = request.app.openapi()
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as bundle:
        for path in available_docs().values():
            bundle.writestr(path.name, path.read_text())
        bundle.writestr("openapi.json", json.dumps(schema, indent=2))
        bundle.writestr("endpoint-index.md", endpoint_index(schema))
        bundle.writestr(
            "release.json",
            json.dumps(
                {
                    "application": schema["info"]["title"],
                    "version": schema["info"]["version"],
                    "commit": os.environ.get("RAILWAY_GIT_COMMIT_SHA", None),
                }
            ),
        )
    return Response(
        output.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="theleadrouter-ad-studio-docs.zip"',
            "Cache-Control": "no-cache",
        },
    )
