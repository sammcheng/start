"use client";

import { useRef, useState } from "react";
import type { Tool } from "@/types/tool";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";

type RunState = "idle" | "running" | "success" | "error";

// ── Output renderer ────────────────────────────────────────────────────────

function OutputDisplay({
  output,
  outputType,
}: {
  output: unknown;
  outputType: string;
}) {
  if (outputType === "image" && typeof output === "string") {
    return (
      <img
        src={output}
        alt="Tool output"
        className="max-w-full rounded-lg border"
        style={{ borderColor: "var(--border)" }}
      />
    );
  }

  if (outputType === "text" && typeof output === "string") {
    return (
      <pre
        className="text-sm leading-relaxed whitespace-pre-wrap"
        style={{ color: "var(--text)", fontFamily: "var(--font-body)" }}
      >
        {output}
      </pre>
    );
  }

  if (outputType === "csv" && typeof output === "string") {
    const rows = output.trim().split("\n").map((r) => r.split(","));
    const headers = rows[0] ?? [];
    const body = rows.slice(1);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-2 border-b font-mono"
                  style={{ borderColor: "var(--border)", color: "var(--blue)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-2 border-b font-mono"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--muted)",
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Default: pretty JSON
  const jsonStr =
    typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return (
    <pre
      className="code-block rounded-xl p-4 text-xs overflow-x-auto"
      style={{ maxHeight: "400px" }}
    >
      <code style={{ color: "#a8ff78" }}>{jsonStr}</code>
    </pre>
  );
}

// ── Input renderer ─────────────────────────────────────────────────────────

function InputField({
  inputType,
  value,
  onChange,
  imagePreview,
  onImageChange,
}: {
  inputType: string;
  value: string;
  onChange: (v: string) => void;
  imagePreview: string | null;
  onImageChange: (preview: string, b64: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const baseStyle: React.CSSProperties = {
    background: "var(--elevated)",
    borderColor: "var(--border)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
  };

  if (inputType === "text") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your text input…"
        rows={5}
        className="w-full rounded-xl border p-4 outline-none resize-none transition-all"
        style={baseStyle}
        onFocus={(e) => (e.target.style.borderColor = "var(--blue)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
      />
    );
  }

  if (inputType === "json") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='{"key": "value"}'
        rows={8}
        className="w-full rounded-xl border p-4 outline-none resize-none transition-all"
        style={{ ...baseStyle, lineHeight: 1.6 }}
        onFocus={(e) => (e.target.style.borderColor = "var(--blue)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
      />
    );
  }

  if (inputType === "url") {
    return (
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com"
        className="w-full rounded-xl border px-4 py-3 outline-none transition-all"
        style={baseStyle}
        onFocus={(e) => (e.target.style.borderColor = "var(--blue)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
      />
    );
  }

  if (inputType === "image") {
    return (
      <div className="space-y-3">
        <div
          className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all"
          style={{ borderColor: "var(--border)" }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="max-h-48 mx-auto rounded-lg object-contain"
            />
          ) : (
            <div>
              <div className="text-3xl mb-2 opacity-30">↑</div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Drop an image or{" "}
                <span style={{ color: "var(--blue)" }}>click to browse</span>
              </p>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    );

    function handleFile(file: File) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        onImageChange(result, result.split(",")[1] ?? "");
      };
      reader.readAsDataURL(file);
    }
  }

  // csv / file — generic upload
  return (
    <div
      className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer"
      style={{ borderColor: "var(--border)" }}
      onClick={() => fileRef.current?.click()}
    >
      <div className="text-2xl mb-2 opacity-30">📄</div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {value
          ? <span style={{ color: "var(--green)" }}>File ready: {value}</span>
          : <span>Click to upload {inputType.toUpperCase()} file</span>
        }
      </p>
      <input
        ref={fileRef}
        type="file"
        accept={inputType === "csv" ? ".csv" : "*"}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function DemoSection({ tool }: { tool: Tool }) {
  const [inputValue, setInputValue] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>("idle");
  const [output, setOutput] = useState<unknown>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  async function handleRun() {
    if (runState === "running") return;

    setRunState("running");
    setOutput(null);
    setErrorMsg(null);
    setElapsed(null);

    const start = performance.now();

    try {
      let body: Record<string, unknown> = {};

      if (tool.input_type === "image" && imageB64) {
        body = { input: imageB64 };
      } else if (tool.input_type === "json") {
        try {
          body = { input: JSON.parse(inputValue) };
        } catch {
          setErrorMsg("Invalid JSON input.");
          setRunState("error");
          return;
        }
      } else {
        body = { input: inputValue };
      }

      const res = await fetch(`${API_BASE}/tools/${tool.slug}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const ms = Math.round(performance.now() - start);
      setElapsed(ms);

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(
          data?.error?.message ?? `Request failed with status ${res.status}`
        );
        setRunState("error");
        return;
      }

      setOutput(data);
      setRunState("success");
    } catch (err) {
      setElapsed(Math.round(performance.now() - start));
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setRunState("error");
    }
  }

  const isReady =
    tool.input_type === "image"
      ? imageB64 !== null
      : inputValue.trim().length > 0;

  return (
    <section
      className="border-t mt-0"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-8">
          <h2
            className="text-xs font-mono uppercase tracking-widest"
            style={{ color: "var(--faint)" }}
          >
            Interactive Demo
          </h2>
          <span
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{
              background: "rgba(59,130,246,0.12)",
              color: "var(--blue)",
              border: "1px solid rgba(59,130,246,0.2)",
            }}
          >
            {tool.input_type} → {tool.output_type}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input panel */}
          <div>
            <p
              className="text-xs font-mono mb-3"
              style={{ color: "var(--blue)" }}
            >
              → Input
            </p>
            <InputField
              inputType={tool.input_type}
              value={inputValue}
              onChange={setInputValue}
              imagePreview={imagePreview}
              onImageChange={(preview, b64) => {
                setImagePreview(preview);
                setImageB64(b64);
              }}
            />

            <button
              onClick={handleRun}
              disabled={!isReady || runState === "running"}
              className="mt-4 flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{
                background: runState === "running" ? "var(--elevated)" : "var(--blue)",
                color: "#fff",
                border: runState === "running" ? "1px solid var(--border)" : "none",
              }}
            >
              {runState === "running" ? (
                <>
                  <span
                    className="w-4 h-4 border-2 rounded-full animate-spin border-t-transparent"
                    style={{ borderColor: "var(--muted)" }}
                  />
                  Running…
                </>
              ) : (
                <>
                  Run
                  <span>▶</span>
                </>
              )}
            </button>
          </div>

          {/* Output panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p
                className="text-xs font-mono"
                style={{ color: "var(--green)" }}
              >
                ← Output
              </p>
              {elapsed !== null && (
                <span
                  className="text-xs font-mono"
                  style={{ color: "var(--faint)" }}
                >
                  {elapsed}ms
                </span>
              )}
            </div>

            <div
              className="rounded-xl border min-h-48 p-5"
              style={{
                background: "var(--card)",
                borderColor:
                  runState === "error"
                    ? "rgba(239,68,68,0.3)"
                    : runState === "success"
                    ? "rgba(34,197,94,0.2)"
                    : "var(--border)",
              }}
            >
              {runState === "idle" && (
                <p
                  className="text-sm text-center mt-12"
                  style={{ color: "var(--faint)" }}
                >
                  Output will appear here
                </p>
              )}

              {runState === "running" && (
                <div className="flex items-center justify-center h-32 gap-3">
                  <span
                    className="w-5 h-5 border-2 rounded-full border-t-transparent"
                    style={{
                      borderColor: "var(--blue)",
                      animation: "spin-slow 0.8s linear infinite",
                    }}
                  />
                  <span className="text-sm" style={{ color: "var(--muted)" }}>
                    Waiting for response…
                  </span>
                </div>
              )}

              {runState === "error" && (
                <div className="space-y-2">
                  <p
                    className="text-xs font-mono uppercase tracking-wider"
                    style={{ color: "var(--red)" }}
                  >
                    Error
                  </p>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {errorMsg}
                  </p>
                </div>
              )}

              {runState === "success" && output !== null && (
                <OutputDisplay output={output} outputType={tool.output_type} />
              )}
            </div>
          </div>
        </div>

        {/* Rate note */}
        <p
          className="mt-6 text-xs text-center"
          style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}
        >
          Demo requests are charged at the standard rate of{" "}
          {parseFloat(tool.price_per_request) === 0
            ? "free"
            : `$${parseFloat(tool.price_per_request).toFixed(4)}`}{" "}
          per call · Authentication required for production use
        </p>
      </div>
    </section>
  );
}
