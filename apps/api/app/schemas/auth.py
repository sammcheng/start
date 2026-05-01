from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AuthSyncRequest(BaseModel):
    email: EmailStr
    username: str | None = Field(default=None, min_length=2, max_length=50)
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    avatar_url: str | None = Field(default=None, max_length=500)


class AuthSyncResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    clerk_id: str
    email: EmailStr
    username: str
    display_name: str
    avatar_url: str | None = None
    role: str
    is_active: bool
