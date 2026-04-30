import asyncio
import json
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.exceptions import UploadFailedError


def _get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )


async def upload_bytes(key: str, data: bytes, content_type: str) -> None:
    def _upload() -> None:
        client = _get_s3_client()
        client.put_object(
            Bucket=settings.s3_bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    for attempt in range(3):
        try:
            await asyncio.to_thread(_upload)
            return
        except (BotoCoreError, ClientError) as exc:
            if attempt == 2:
                raise UploadFailedError("Could not upload source to object storage.") from exc
            await asyncio.sleep(0.25 * (attempt + 1))


async def upload_json(key: str, payload: dict[str, Any]) -> None:
    await upload_bytes(
        key,
        json.dumps(payload, indent=2).encode("utf-8"),
        "application/json",
    )


async def download_bytes(key: str) -> bytes:
    def _download() -> bytes:
        client = _get_s3_client()
        response = client.get_object(Bucket=settings.s3_bucket_name, Key=key)
        return response["Body"].read()

    for attempt in range(3):
        try:
            return await asyncio.to_thread(_download)
        except (BotoCoreError, ClientError) as exc:
            if attempt == 2:
                raise UploadFailedError("Could not download source from object storage.") from exc
            await asyncio.sleep(0.25 * (attempt + 1))
    raise UploadFailedError("Could not download source from object storage.")
