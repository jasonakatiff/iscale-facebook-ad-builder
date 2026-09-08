"""Versioned declarative packages and bounded service input/output contracts."""

import json
import math
import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_validator,
    model_validator,
)

from app.core import plugin_config as limits
from app.schemas.platform import Pagination

PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z][A-Za-z0-9_]{0,39})\s*\}\}")
RESERVED = {"__proto__", "prototype", "constructor"}


def bounded_json(value, maximum=limits.MAX_VALUE_BYTES):
    def visit(item, depth):
        if depth > limits.MAX_DEPTH:
            raise ValueError("JSON nesting exceeds the plugin limit")
        if isinstance(item, float) and not math.isfinite(item):
            raise ValueError("JSON numbers must be finite")
        if isinstance(item, dict):
            for key, child in item.items():
                if not isinstance(key, str) or len(key) > 200 or key in RESERVED:
                    raise ValueError("Invalid JSON field name")
                visit(child, depth + 1)
        elif isinstance(item, list):
            for child in item:
                visit(child, depth + 1)

    visit(value, 0)
    if len(json.dumps(value, allow_nan=False, ensure_ascii=False).encode()) > maximum:
        raise ValueError("Plugin data exceeds the size limit")
    return value


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InputField(StrictModel):
    name: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,39}$")
    label: str = Field(min_length=1, max_length=80)
    kind: Literal["text", "multiline", "json"] = "text"
    required: bool = False
    default: JsonValue = None

    @model_validator(mode="after")
    def valid_default(self):
        if self.name in RESERVED:
            raise ValueError("Reserved input name")
        bounded_json(self.default)
        if (
            self.kind != "json"
            and self.default is not None
            and not isinstance(self.default, str)
        ):
            raise ValueError("Text fields require text defaults")
        return self


class PluginDocument(StrictModel):
    schemaVersion: Literal[1]
    slug: str = Field(pattern=r"^[a-z][a-z0-9-]{1,79}$")
    name: str = Field(min_length=1, max_length=100)
    version: str = Field(
        pattern=r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$", max_length=40
    )
    description: str = Field(min_length=1, max_length=1000)
    category: Literal["prompts", "images", "campaigns", "optimization", "other"]
    execution: Literal["template", "service"]
    inputs: list[InputField] = Field(default_factory=list, max_length=limits.MAX_FIELDS)
    configFields: list[InputField] = Field(
        default_factory=list, max_length=limits.MAX_FIELDS
    )
    template: JsonValue = None

    @field_validator("template", mode="before")
    @classmethod
    def bounded_template(cls, value):
        return bounded_json(value, limits.MAX_PACKAGE_BYTES)

    @model_validator(mode="after")
    def valid_package(self):
        fields = self.inputs + self.configFields
        names = {field.name for field in fields}
        if len(names) != len(fields):
            raise ValueError("Input and configuration field names must be unique")
        if self.execution == "template" and self.template is None:
            raise ValueError("A local plugin requires an output template")
        if self.execution == "service" and self.template is not None:
            raise ValueError("Service packages do not contain executable templates")

        def inspect(value):
            if isinstance(value, str):
                if any(name not in names for name in PLACEHOLDER.findall(value)):
                    raise ValueError("Template references an undeclared field")
                remainder = PLACEHOLDER.sub("", value)
                if "{{" in remainder or "}}" in remainder:
                    raise ValueError(
                        "Use only {{field}} placeholders; expressions are unsupported"
                    )
            elif isinstance(value, dict):
                for key, child in value.items():
                    if "{{" in key or "}}" in key:
                        raise ValueError("Template object keys must be literal")
                    inspect(child)
            elif isinstance(value, list):
                for child in value:
                    inspect(child)

        inspect(self.template)
        bounded_json(self.model_dump(mode="json"), limits.MAX_PACKAGE_BYTES)
        return self


class PluginPatch(StrictModel):
    enabled: bool | None = None
    configuration: dict[str, JsonValue] | None = None

    @model_validator(mode="after")
    def nonempty(self):
        if self.enabled is None and self.configuration is None:
            raise ValueError("Supply enabled or configuration")
        bounded_json(self.configuration)
        return self


class RunCreate(StrictModel):
    requestId: UUID
    inputs: dict[str, JsonValue] = Field(default_factory=dict)

    @field_validator("inputs", mode="before")
    @classmethod
    def bounded_inputs(cls, value):
        return bounded_json(value)


class LeaseRequest(StrictModel):
    leaseToken: str = Field(min_length=32, max_length=128)


class WorkerResult(LeaseRequest):
    output: JsonValue = None
    failed: bool = False

    @field_validator("output", mode="before")
    @classmethod
    def bounded_output(cls, value):
        return bounded_json(value)


class WorkerKeyCreate(StrictModel):
    expiresInDays: int = Field(default=90, ge=1, le=limits.MAX_KEY_DAYS, strict=True)


class PluginRecord(BaseModel):
    id: UUID
    document: PluginDocument
    packageDigest: str
    enabled: bool
    configuration: dict[str, JsonValue]
    workerKeyPrefix: str | None
    workerKeyExpiresAt: datetime | None
    workerLastSeenAt: datetime | None
    createdAt: datetime
    updatedAt: datetime


class PluginResult(BaseModel):
    data: PluginRecord


class PluginList(BaseModel):
    data: list[PluginRecord]
    pagination: Pagination


class RunRecord(BaseModel):
    id: UUID
    pluginId: UUID
    pluginName: str
    pluginVersion: str
    packageDigest: str
    status: Literal["queued", "running", "succeeded", "failed", "cancelled", "expired"]
    inputs: dict[str, JsonValue]
    configuration: dict[str, JsonValue]
    output: JsonValue
    error: str | None
    createdAt: datetime
    completedAt: datetime | None
    expiresAt: datetime


class RunResult(BaseModel):
    data: RunRecord


class RunList(BaseModel):
    data: list[RunRecord]
    pagination: Pagination


class WorkerKeyResult(PluginResult):
    workerKey: str


class ClaimResult(RunResult):
    leaseToken: str
    leaseExpiresAt: datetime


class WorkerJob(BaseModel):
    id: UUID
    pluginId: UUID
    createdAt: datetime
    expiresAt: datetime


class WorkerJobList(BaseModel):
    data: list[WorkerJob]
    pagination: Pagination


class HeartbeatResult(BaseModel):
    leaseExpiresAt: datetime
