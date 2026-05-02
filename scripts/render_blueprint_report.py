#!/usr/bin/env python3
"""Summarize the repo's intended Render service settings for manual drift checks.

This is intentionally read-only. It gives us a stable report we can compare
against the live Render dashboard when a service was originally created outside
of Blueprint sync and has drifted from `render.yaml`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import yaml


REPO_ROOT = Path(__file__).resolve().parents[1]
BLUEPRINT_PATH = REPO_ROOT / "render.yaml"


def load_blueprint() -> dict[str, Any]:
    return yaml.safe_load(BLUEPRINT_PATH.read_text())


def normalize_service(service: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "name": service.get("name"),
        "type": service.get("type"),
        "runtime": service.get("runtime"),
        "rootDir": service.get("rootDir", ""),
        "autoDeployTrigger": service.get("autoDeployTrigger", "commit"),
        "healthCheckPath": service.get("healthCheckPath", ""),
    }

    build_filter = service.get("buildFilter") or {}
    summary["buildFilter"] = {
        "paths": build_filter.get("paths", []),
        "ignoredPaths": build_filter.get("ignoredPaths", []),
    }

    if service.get("runtime") == "docker":
        summary["dockerfilePath"] = service.get("dockerfilePath", "")
        summary["dockerContext"] = service.get("dockerContext", "")
    else:
        summary["buildCommand"] = service.get("buildCommand", "")
        summary["startCommand"] = service.get("startCommand", "")

    env_keys = []
    for env_var in service.get("envVars", []):
        key = env_var.get("key")
        if key:
            env_keys.append(key)
    summary["envVarKeys"] = env_keys

    return summary


def format_text(services: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append(f"Blueprint: {BLUEPRINT_PATH}")
    lines.append("")
    for service in services:
        lines.append(f"Service: {service['name']}")
        lines.append(f"  Type: {service['type']}")
        lines.append(f"  Runtime: {service['runtime']}")
        lines.append(f"  Root Directory: {service['rootDir'] or '(repo root)'}")
        lines.append(f"  Auto Deploy Trigger: {service['autoDeployTrigger']}")
        lines.append(f"  Health Check Path: {service['healthCheckPath'] or '(unset)'}")
        if service["buildFilter"]["paths"] or service["buildFilter"]["ignoredPaths"]:
            lines.append("  Build Filter:")
            lines.append(
                f"    paths: {service['buildFilter']['paths'] or '[]'}"
            )
            lines.append(
                f"    ignoredPaths: {service['buildFilter']['ignoredPaths'] or '[]'}"
            )
        if service["runtime"] == "docker":
            lines.append(f"  Dockerfile Path: {service['dockerfilePath']}")
            lines.append(f"  Docker Context: {service['dockerContext']}")
        else:
            lines.append(f"  Build Command: {service['buildCommand']}")
            lines.append(f"  Start Command: {service['startCommand']}")
        if service["envVarKeys"]:
            lines.append("  Env Vars:")
            for key in service["envVarKeys"]:
                lines.append(f"    - {key}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Print the Render service settings encoded in render.yaml."
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON instead of a text report.",
    )
    args = parser.parse_args()

    blueprint = load_blueprint()
    services = [
        normalize_service(service)
        for service in blueprint.get("services", [])
        if service.get("type") == "web"
    ]

    if args.json:
        print(json.dumps(services, indent=2))
    else:
        print(format_text(services), end="")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
