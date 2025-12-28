"use client";

import { useMemo, useState } from "react";

type EmailConfidence = "high" | "medium" | "low";

type EmailSource = {
  url: string;
  context: string | null;
  via: "mailto" | "text" | "pattern";
};

type EmailResult = {
  email: string;
  confidence: EmailConfidence;
  reason: string;
  sources: EmailSource[];
};

type LookupSummary = {
  url: string;
  status: number | null;
  ok: boolean;
  error?: string;
};

type LookupPayload = {
  domain: string;
  firstName?: string;
  lastName?: string;
  keywords?: string[];
};

type LookupResponse = {
  success: boolean;
  results: EmailResult[];
  crawled: LookupSummary[];
  message?: string;
  patterns?: string[];
  domain?: string;
};

const confidenceStyles: Record<EmailConfidence, string> = {
  high: "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-sky-100 text-sky-700 border-sky-200",
};

const defaultCrawlTargets = ["contact", "about", "team", "press", "support"];

export default function Home() {
  const [form, setForm] = useState({
    domain: "",
    firstName: "",
    lastName: "",
    keywords: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LookupResponse | null>(null);
  const [copyState, setCopyState] = useState<Record<string, boolean>>({});

  const parsedKeywords = useMemo(() => {
    return form.keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
  }, [form.keywords]);

  const handleChange = (
    key: keyof typeof form,
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setData(null);
    setCopyState({});

    const payload: LookupPayload = {
      domain: form.domain,
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      keywords: parsedKeywords.length ? parsedKeywords : defaultCrawlTargets,
    };

    setIsLoading(true);

    try {
      const response = await fetch("/api/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json: LookupResponse = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message ?? "Lookup failed");
      }

      setData(json);
    } catch (lookupError) {
      const message =
        lookupError instanceof Error
          ? lookupError.message
          : "Unexpected lookup error";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopyState((prev) => ({ ...prev, [email]: true }));
      setTimeout(() => {
        setCopyState((prev) => ({ ...prev, [email]: false }));
      }, 2000);
    } catch (copyError) {
      console.error(copyError);
      setError("Copy failed. Please copy the address manually.");
    }
  };

  const hasResults = (data?.results?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-white/10 bg-slate-950/80 text-white backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-300/80">
              Agentic Toolkit
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Email Find Agent
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
              Crawl company pages, extract verified addresses, and auto-generate
              smart email patterns for outreach and lead qualification.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300 shadow-[0_0_40px_-15px_rgba(59,130,246,0.5)]">
            <p className="font-medium text-blue-300">Best inputs</p>
            <ul className="mt-1 list-disc pl-4 text-slate-400">
              <li>Company domain (no protocol needed)</li>
              <li>Decision maker name (optional)</li>
              <li>Keywords like “sales”, “partnerships”</li>
            </ul>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12 text-white">
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-6 rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-xl shadow-blue-900/20 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="flex items-center justify-between text-sm font-semibold text-slate-200">
              Target domain
              <span className="text-xs font-normal text-slate-400">
                Example: acme.com
              </span>
            </label>
            <input
              required
              value={form.domain}
              onChange={(event) => handleChange("domain", event.target.value)}
              placeholder="acme.com"
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-200">
              First name
            </label>
            <input
              value={form.firstName}
              onChange={(event) =>
                handleChange("firstName", event.target.value)
              }
              placeholder="Jane"
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-200">
              Last name
            </label>
            <input
              value={form.lastName}
              onChange={(event) =>
                handleChange("lastName", event.target.value)
              }
              placeholder="Doe"
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center justify-between text-sm font-semibold text-slate-200">
              Priority keywords or departments
              <span className="text-xs font-normal text-slate-400">
                Comma separated
              </span>
            </label>
            <textarea
              value={form.keywords}
              onChange={(event) => handleChange("keywords", event.target.value)}
              rows={3}
              placeholder="sales, partnerships, hiring"
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
            />
            <p className="mt-2 text-xs text-slate-400">
              We automatically scan contact, team, press, and support pages. Add
              niche keywords to probe specific departments.
            </p>
          </div>

          <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-400">
              <p>
                We crawl a curated list of lightweight pages. Requests time out
                after 10 seconds.
              </p>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Scanning
                </>
              ) : (
                <>
                  Launch scan
                  <span aria-hidden className="text-base">
                    ↗
                  </span>
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-6 py-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-8 text-sm text-slate-300">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-ping rounded-full bg-blue-400" />
              <p>Reaching out to priority pages...</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-ping rounded-full bg-blue-400" />
              <p>Extracting mailto links and unstructured emails...</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-ping rounded-full bg-blue-400" />
              <p>Scoring results for confidence and relevance.</p>
            </div>
          </div>
        )}

        {data && (
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-blue-300/80">
                    Result summary
                  </p>
                  <h2 className="text-2xl font-semibold text-white">
                    {data.domain ?? form.domain}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                  {data.crawled.map((crawl) => (
                    <span
                      key={crawl.url}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
                        crawl.ok
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                          : "border-rose-400/40 bg-rose-500/10 text-rose-200"
                      }`}
                    >
                      <span className="max-w-[16ch] truncate">{crawl.url}</span>
                      <span className="font-semibold">
                        {crawl.ok ? "✓" : "!"}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {data.patterns && data.patterns.length > 0 && (
                <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                  <p className="font-medium uppercase tracking-wide text-blue-200">
                    Pattern ideas
                  </p>
                  <p className="mt-1 text-blue-100/80">
                    Use these when contacting additional people at the same
                    company.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.patterns.map((pattern) => (
                      <span
                        key={pattern}
                        className="rounded-full border border-blue-300/50 bg-blue-500/10 px-3 py-1 text-xs"
                      >
                        {pattern}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {hasResults ? (
                data.results.map((result) => (
                  <article
                    key={result.email}
                    className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-blue-900/15"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-col gap-3">
                        <h3 className="text-xl font-semibold text-white">
                          {result.email}
                        </h3>
                        <p className="text-sm text-slate-300">
                          {result.reason}
                        </p>
                        <span
                          className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${confidenceStyles[result.confidence]}`}
                        >
                          {result.confidence === "high"
                            ? "High certainty"
                            : result.confidence === "medium"
                              ? "Medium certainty"
                              : "Pattern suggestion"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(result.email)}
                        className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-white/10 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-200 transition hover:border-blue-400 hover:text-white"
                      >
                        {copyState[result.email] ? "Copied" : "Copy"}
                      </button>
                    </div>

                    <div className="mt-5 space-y-3 text-xs text-slate-300">
                      {result.sources.map((source) => (
                        <div
                          key={`${result.email}-${source.url}-${source.via}`}
                          className="flex flex-col gap-1 rounded-lg border border-white/5 bg-slate-950/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-100">
                              {source.url}
                            </span>
                            {source.context && (
                              <span className="text-slate-400">
                                {source.context}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                            {source.via}
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-8 text-slate-300">
                  <p className="text-lg font-semibold text-white">
                    No email address surfaced yet.
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    Add department keywords or include a specific person&apos;s
                    name. We will still provide pattern suggestions even if the
                    site hides direct mailboxes.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-white/10 bg-slate-950/80 px-6 py-6 text-center text-xs text-slate-500">
        Built for responsible prospecting. Always follow regional outreach and
        privacy guidelines.
      </footer>
    </div>
  );
}
