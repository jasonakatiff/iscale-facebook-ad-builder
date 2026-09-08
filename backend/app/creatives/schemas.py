from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class CreativeMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    talent_type: Literal[
        "unknown",
        "none",
        "single_presenter",
        "multiple_presenters",
        "voiceover",
        "animated",
    ] = "unknown"
    talent_gender: Optional[Literal["male", "female", "mixed", "nonbinary"]] = None
    background: str = Field(default="unknown", min_length=1, max_length=300)
    camera_angle: str = Field(default="unknown", min_length=1, max_length=300)
    lighting: str = Field(default="unknown", min_length=1, max_length=300)
    composition: str = Field(default="unknown", min_length=1, max_length=300)
    color_scheme: str = Field(default="unknown", min_length=1, max_length=300)
    visual_style: str = Field(default="unknown", min_length=1, max_length=300)
    messaging_angle: str = Field(default="unknown", min_length=1, max_length=500)


class MetadataEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    metadata: CreativeMetadata
