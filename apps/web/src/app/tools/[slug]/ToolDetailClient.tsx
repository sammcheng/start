"use client";

import { useState } from "react";
import type { Tool } from "@/types/tool";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";

type Lang = "curl" | "python" | "javascript";

function buildInputExample(tool: Tool): string {
  switch (tool.input_type) {
    case "text":
      return '{"input": "Hello, world!"}';
    case "json":
      return '{"input": {"key": "value"}}';
    case "url":
      return '{"input": "https://example.com"}';
    case "image":
      return '{"input": "<base64-encoded-image>"}';
    case "csv":
      return '{"input": "col1,col2\\nval1,val2"}';
    default:
      return '{"input": "<your-input>"}';
  }
}

function curlExample(tool: Tool): string {
  const body = buildInputExample(tool);
  return `curl -X POST ${API_BASE}/tools/${tool.slug}/run \\
  -H "X-Api-Key: hm_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
}

function pythonExample(tool: Tool): string {
  const body = buildInputExample(tool);
  return `import requests

response = requests.post(
    "${API_BASE}/tools/${tool.slug}/run",
    headers={
        "X-Api-Key": "hm_live_your_key_here",
        "Content-Type": "application/json",
    },
    json=${body},
)

data = response.json()
print(data)`;
}

function javascriptExample(tool: Tool): string {
  const body = buildInputExample(tool);
  return `const response = await fetch(
  "${API_BASE}/tools/${tool.slug}/run",
  {
    method: "POST",
    headers: {
      "X-Api-Key": "hm_live_your_key_here",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(${body}),
  }
);

const data = await response.json();
console.log(data);`;
}

// ── Syntax highlighting (hand-rolled, no deps) ─────────────────────────────

function highlight(code: string, lang: Lang): string {
  if (lang === "curl") {
    return code
      .replace(/(curl)/g, '<span class="token-keyword">$1</span>')
      .replace(/(-X|-H|-d)/g, '<span class="token-flag">$1</span>')
      .replace(/(POST|GET|PUT|DELETE)/g, '<span class="token-keyword">$1</span>')
      .replace(/(https?:\/\/[^\s'"\\]+)/g, '<span class="token-url">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="token-string">$1</span>');
  }

  if (lang === "python") {
    return code
      .replace(/(import|print|json)/g, '<span class="token-keyword">$1</span>')
      .replace(/(requests\.post|response\.json)/g, '<span class="token-url">$1</span>')
      .replace(/(#[^\n]*)/g, '<span class="token-comment">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="token-string">$1</span>');
  }

  // javascript
  return code
    .replace(/(const|await|async|function|return|import|export|from)/g, '<span class="token-keyword">$1</span>')
    .replace(/(\/\/[^\n]*)/g, '<span class="token-comment">$1</span>')
    .replace(/(fetch|console\.log|JSON\.stringify)/g, '<span class="token-url">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="token-string">$1</span>');
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ToolDetailClient({ tool }: { tool: Tool }) {
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);

  const examples: Record<Lang, string> = {
    curl: curlExample(tool),
    python: pythonExample(tool),
    javascript: javascriptExample(tool),
  };

  const langLabels: Record<Lang, string> = {
    curl: "cURL",
    python: "Python",
    javascript: "JavaScript",
  };

  async function handleCopy() {
    await navigator.clipboard.writeText(examples[lang]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const highlighted = highlight(examples[lang], lang);

  return (
    <section className="animate-fade-up delay-300">
      <h2
        className="text-xs font-mono uppercase tracking-widest mb-4"
        style={{ color: "var(--faint)" }}
      >
        Code Examples
      </h2>

      {/* Tab bar */}
      <div
        className="flex items-center justify-between mb-0 rounded-t-xl border border-b-0 px-4"
        style={{
          background: "var(--elevated)",
          borderColor: "var(--border)",
        }}
      >
        {/* Traffic-light dots */}
        <div className="flex items-center gap-1.5 py-3">
          <span className="w-3 h-3 rounded-full" style={{ background: "#ef4444" }} />
          <span className="w-3 h-3 rounded-full" style={{ background: "#eab308" }} />
          <span className="w-3 h-3 rounded-full" style={{ background: "#22c55e" }} />
        </div>

        {/* Lang tabs */}
        <div className="flex items-center gap-0.5">
          {(["curl", "python", "javascript"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="px-3.5 py-2.5 text-xs transition-all rounded-t-md"
              style={{
                fontFamily: "var(--font-mono)",
                color: lang === l ? "var(--text)" : "var(--faint)",
                borderBottom: lang === l ? "2px solid var(--blue)" : "2px solid transparent",
                background: "transparent",
              }}
            >
              {langLabels[l]}
            </button>
          ))}
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="py-2 text-xs transition-all rounded-md px-3"
          style={{
            fontFamily: "var(--font-mono)",
            color: copied ? "var(--green)" : "var(--faint)",
            background: copied ? "rgba(34,197,94,0.08)" : "transparent",
          }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      {/* Code block */}
      <div
        className="code-block rounded-b-xl p-6"
        style={{ minHeight: "160px" }}
      >
        <code
          className="block"
          dangerouslySetInnerHTML={{ __html: highlighted }}
          style={{ color: "var(--text)" }}
        />
      </div>

      {/* Response shape hint */}
      {tool.output_schema && (
        <p className="mt-3 text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}>
          Response shape is documented in the API Contract section above.
        </p>
      )}
    </section>
  );
}
