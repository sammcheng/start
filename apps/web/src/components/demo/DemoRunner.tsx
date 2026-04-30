"use client";

import { useMemo, useState } from "react";

import FileInput from "./FileInput";
import DynamicForm from "./DynamicForm";
import ImageInput from "./ImageInput";
import JSONInput from "./JSONInput";
import JSONOutput from "./JSONOutput";
import TextInput from "./TextInput";
import URLInput from "./URLInput";
import FileOutput from "./FileOutput";
import ImageOutput from "./ImageOutput";
import TableOutput from "./TableOutput";
import TextOutput from "./TextOutput";
import type { DemoInputSchema, DemoRunnerProps, DemoSchemaField, DemoResult } from "./types";
import { getGatewayBaseUrl } from "@/lib/api";

const GATEWAY_BASE = getGatewayBaseUrl();
const DEMO_API_KEY = process.env.NEXT_PUBLIC_DEMO_API_KEY ?? "";
const SESSION_LIMIT = 10;
const STORAGE_KEY = "hackmarket-demo-calls";

type FileValue = { name: string; content: string; mimeType: string } | null;
type ImageValue = { base64: string; previewUrl: string; filename: string } | null;

export default function DemoRunner({
  toolSlug,
  inputType,
  inputSchema,
  outputType,
}: DemoRunnerProps) {
  const schema = (inputSchema ?? {}) as DemoInputSchema;
  const [textValue, setTextValue] = useState(defaultStringValue(schema));
  const [jsonValue, setJsonValue] = useState(defaultJsonValue(schema));
  const [urlValue, setUrlValue] = useState("");
  const [fileValue, setFileValue] = useState<FileValue>(null);
  const [imageValue, setImageValue] = useState<ImageValue>(null);
  const [dynamicValue, setDynamicValue] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [callsUsed, setCallsUsed] = useState(readSessionCount());

  const dynamicFields = Array.isArray(schema.fields) ? schema.fields : [];
  const sessionRemaining = Math.max(SESSION_LIMIT - callsUsed, 0);
  const sessionLimited = sessionRemaining <= 0;

  const validationError = useMemo(() => {
    if (dynamicFields.length) {
      return validateDynamicFields(dynamicFields, dynamicValue);
    }
    if (inputType === "json" && jsonValue.trim()) {
      try {
        JSON.parse(jsonValue);
      } catch {
        return "Fix the JSON before running the demo.";
      }
    }
    if (inputType === "url" && urlValue && !isValidUrl(urlValue)) {
      return "Enter a valid URL before running the demo.";
    }
    if (inputType === "image" && !imageValue) {
      return "Select an image before running the demo.";
    }
    if ((inputType === "file" || inputType === "csv") && !fileValue) {
      return "Upload a file before running the demo.";
    }
    if (inputType === "text" && !textValue.trim()) {
      return "Enter some text before running the demo.";
    }
    return null;
  }, [dynamicFields, dynamicValue, fileValue, imageValue, inputType, jsonValue, textValue, urlValue]);

  async function handleRun() {
    if (sessionLimited) {
      setError("You’ve used the 10 free demo calls for this session. Sign up to keep testing tools.");
      return;
    }
    if (!DEMO_API_KEY) {
      setError("Demo access is not configured yet. Add NEXT_PUBLIC_DEMO_API_KEY to enable guest runs.");
      return;
    }
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    const startedAt = performance.now();
    try {
      const payload = buildPayload({
        inputType,
        textValue,
        jsonValue,
        urlValue,
        fileValue,
        imageValue,
        dynamicValue,
        dynamicFields,
      });

      // Demo traffic should always go through the buyer gateway so auth, rate limits,
      // usage logging, and billing behavior match production API calls.
      const response = await fetch(`${GATEWAY_BASE}/tools/${toolSlug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": DEMO_API_KEY,
        },
        body: JSON.stringify(payload),
      });

      const requestId = response.headers.get("X-HackMarket-Request-Id");
      const responseTimeMs = Math.max(Math.round(performance.now() - startedAt), 1);
      const data = await parseResponse(response);

      if (!response.ok) {
        setError(extractErrorMessage(data, response.status));
        setResult({
          data,
          status: response.status,
          responseTimeMs,
          requestId,
        });
      } else {
        incrementSessionCount();
        setCallsUsed(readSessionCount());
        setResult({
          data,
          status: response.status,
          responseTimeMs,
          requestId,
        });
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "The demo request failed.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="rounded-[32px] border border-stone-800 bg-stone-950/80 p-6 shadow-2xl shadow-black/20">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">Interactive Demo</div>
          <h2 className="mt-2 text-2xl font-semibold text-stone-100">Try the live tool through the gateway</h2>
          <p className="mt-2 text-sm leading-6 text-stone-400">
            Demo runs use a guest key and count against a 10-call session limit.
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
          {sessionRemaining} free calls left this session
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[28px] border border-stone-800 bg-black/20 p-5">
          <div className="mb-4 text-xs uppercase tracking-[0.2em] text-stone-400">Input</div>
          {renderInput({
            inputType,
            schema,
            textValue,
            setTextValue,
            jsonValue,
            setJsonValue,
            urlValue,
            setUrlValue,
            fileValue,
            setFileValue,
            imageValue,
            setImageValue,
            dynamicValue,
            setDynamicValue,
            disabled: isRunning || sessionLimited,
            validationError,
          })}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning || sessionLimited}
              className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRunning ? "Running..." : "Run"}
            </button>
            {result ? (
              <span className="text-sm text-stone-400">
                Completed in {result.responseTimeMs}ms
                {result.requestId ? ` · Request ${result.requestId}` : ""}
              </span>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {!error && !result ? (
            <div className="mt-4 rounded-2xl border border-stone-800 bg-stone-900/60 p-4 text-sm text-stone-500">
              Configure the input and run the tool to see live output here.
            </div>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-stone-800 bg-black/20 p-5">
          <div className="mb-4 text-xs uppercase tracking-[0.2em] text-stone-400">Output</div>
          {renderOutput(outputType, result?.data ?? null)}
        </div>
      </div>
    </section>
  );
}

function renderInput(props: {
  inputType: DemoRunnerProps["inputType"];
  schema: DemoInputSchema;
  textValue: string;
  setTextValue: (value: string) => void;
  jsonValue: string;
  setJsonValue: (value: string) => void;
  urlValue: string;
  setUrlValue: (value: string) => void;
  fileValue: FileValue;
  setFileValue: (value: FileValue) => void;
  imageValue: ImageValue;
  setImageValue: (value: ImageValue) => void;
  dynamicValue: Record<string, unknown>;
  setDynamicValue: (value: Record<string, unknown>) => void;
  disabled: boolean;
  validationError: string | null;
}) {
  if (props.schema.fields?.length) {
    return (
      <DynamicForm
        schema={props.schema}
        value={props.dynamicValue as Record<string, string | number | boolean | null | { name: string; content: string; mimeType: string }>}
        onChange={props.setDynamicValue as (value: Record<string, string | number | boolean | null | { name: string; content: string; mimeType: string }>) => void}
        disabled={props.disabled}
      />
    );
  }

  if (props.inputType === "json") {
    return (
      <JSONInput
        value={props.jsonValue}
        onChange={props.setJsonValue}
        disabled={props.disabled}
        error={props.validationError?.includes("JSON") ? props.validationError : null}
        placeholder={props.schema.placeholder}
      />
    );
  }
  if (props.inputType === "image") {
    return (
      <ImageInput
        value={props.imageValue}
        onChange={props.setImageValue}
        disabled={props.disabled}
        error={props.validationError?.includes("image") ? props.validationError : null}
      />
    );
  }
  if (props.inputType === "url") {
    return (
      <URLInput
        value={props.urlValue}
        onChange={props.setUrlValue}
        disabled={props.disabled}
        error={props.validationError?.includes("URL") ? props.validationError : null}
        placeholder={props.schema.placeholder}
      />
    );
  }
  if (props.inputType === "file" || props.inputType === "csv") {
    return (
      <FileInput
        label={props.inputType === "csv" ? "CSV file" : "File"}
        value={props.fileValue}
        onChange={props.setFileValue}
        disabled={props.disabled}
        error={props.validationError?.includes("file") ? props.validationError : null}
        accept={props.inputType === "csv" ? ".csv,text/csv" : undefined}
      />
    );
  }
  return (
    <TextInput
      value={props.textValue}
      onChange={props.setTextValue}
      disabled={props.disabled}
      error={props.validationError?.includes("text") ? props.validationError : null}
      placeholder={props.schema.placeholder}
    />
  );
}

function renderOutput(outputType: DemoRunnerProps["outputType"], data: unknown) {
  if (outputType === "text") {
    return <TextOutput value={typeof data === "string" ? data : data ? JSON.stringify(data, null, 2) : null} />;
  }
  if (outputType === "image") {
    return <ImageOutput value={extractImageValue(data)} />;
  }
  if (outputType === "csv") {
    return <TableOutput value={typeof data === "string" ? data : null} />;
  }
  if (outputType === "file") {
    return <FileOutput value={extractFileValue(data)} />;
  }
  return <JSONOutput value={data} />;
}

function buildPayload(args: {
  inputType: DemoRunnerProps["inputType"];
  textValue: string;
  jsonValue: string;
  urlValue: string;
  fileValue: FileValue;
  imageValue: ImageValue;
  dynamicValue: Record<string, unknown>;
  dynamicFields: DemoSchemaField[];
}) {
  if (args.dynamicFields.length) {
    const payload: Record<string, unknown> = {};
    for (const field of args.dynamicFields) {
      payload[field.name] = normalizeFieldValue(field, args.dynamicValue[field.name]);
    }
    return payload;
  }
  if (args.inputType === "json") {
    return JSON.parse(args.jsonValue);
  }
  if (args.inputType === "image") {
    return { input: args.imageValue?.base64 ?? "" };
  }
  if (args.inputType === "file" || args.inputType === "csv") {
    return {
      input: args.fileValue?.content ?? "",
      filename: args.fileValue?.name ?? "",
      mime_type: args.fileValue?.mimeType ?? "",
    };
  }
  if (args.inputType === "url") {
    return { input: args.urlValue };
  }
  return { input: args.textValue };
}

function normalizeFieldValue(field: DemoSchemaField, value: unknown) {
  if (field.type === "number") {
    return Number(value ?? 0);
  }
  if (field.type === "file") {
    const file = value as FileValue;
    return file
      ? {
          filename: file.name,
          content: file.content,
          mime_type: file.mimeType,
        }
      : null;
  }
  return value;
}

function validateDynamicFields(fields: DemoSchemaField[], value: Record<string, unknown>) {
  for (const field of fields) {
    const fieldValue = value[field.name];
    if (field.required) {
      if (field.type === "file" && !fieldValue) {
        return `${humanize(field.name)} is required.`;
      }
      if (field.type !== "file" && !String(fieldValue ?? "").trim()) {
        return `${humanize(field.name)} is required.`;
      }
    }
    if (field.type === "url" && fieldValue && !isValidUrl(String(fieldValue))) {
      return `${humanize(field.name)} must be a valid URL.`;
    }
  }
  return null;
}

function extractErrorMessage(data: unknown, status: number) {
  const message =
    typeof data === "object" && data && "error" in data && typeof data.error === "object" && data.error && "message" in data.error
      ? String((data.error as { message?: unknown }).message ?? "")
      : null;
  return message || `The demo request failed with status ${status}.`;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }
  return await response.text();
}

function extractImageValue(data: unknown) {
  if (typeof data === "string") {
    return data;
  }
  if (typeof data === "object" && data && "image_url" in data) {
    return String((data as { image_url?: unknown }).image_url ?? "");
  }
  return null;
}

function extractFileValue(data: unknown) {
  if (typeof data === "string") {
    return data;
  }
  if (typeof data === "object" && data && "file_url" in data) {
    return String((data as { file_url?: unknown }).file_url ?? "");
  }
  return null;
}

function readSessionCount() {
  if (typeof window === "undefined") {
    return 0;
  }
  return Number(window.sessionStorage.getItem(STORAGE_KEY) ?? "0");
}

function incrementSessionCount() {
  if (typeof window === "undefined") {
    return;
  }
  const next = readSessionCount() + 1;
  window.sessionStorage.setItem(STORAGE_KEY, String(next));
}

function defaultStringValue(schema: DemoInputSchema) {
  const example = schema.example ?? schema.example_input;
  return typeof example === "string" ? example : "";
}

function defaultJsonValue(schema: DemoInputSchema) {
  const example = schema.example ?? schema.example_input;
  if (typeof example === "string") {
    return example;
  }
  if (example !== undefined) {
    return JSON.stringify(example, null, 2);
  }
  return "";
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
