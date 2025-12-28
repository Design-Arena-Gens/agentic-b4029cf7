import { NextRequest, NextResponse } from "next/server";
import type { CheerioAPI } from "cheerio";
import { load } from "cheerio";
import { z } from "zod";

type EmailConfidence = "high" | "medium" | "low";
type EmailSource = {
  url: string;
  context: string | null;
  via: "mailto" | "text" | "pattern";
};

type AggregatedEmail = {
  email: string;
  sources: EmailSource[];
  viaMailto: number;
  viaText: number;
  viaPattern: number;
};

type CrawlSummary = {
  url: string;
  ok: boolean;
  status: number | null;
  error?: string;
};

const requestSchema = z.object({
  domain: z.string().min(3, "Domain is required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  keywords: z.array(z.string()).default([]),
});

const DEFAULT_PATHS = [
  "/",
  "/about",
  "/about-us",
  "/team",
  "/our-team",
  "/leadership",
  "/people",
  "/contact",
  "/contact-us",
  "/support",
  "/help",
  "/press",
  "/careers",
];

const GENERIC_PATTERN_PREFIXES = [
  "hello",
  "hi",
  "info",
  "contact",
  "support",
  "press",
  "partnerships",
  "careers",
  "sales",
];

const EMAIL_REGEX =
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}(?:\.[a-z]{2,})?/gi;

const MAX_PAGES = 12;
const FETCH_TIMEOUT_MS = 10_000;

const bannedHosts = new Set([
  "example.com",
  "email.com",
  "domain.com",
  "yourdomain.com",
  "test.com",
]);

export async function POST(request: NextRequest) {
  let body: z.infer<typeof requestSchema>;

  try {
    const json = await request.json();
    body = requestSchema.parse(json);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Invalid request payload",
      },
      { status: 400 },
    );
  }

  let normalized: { origin: string; host: string };

  try {
    normalized = normalizeDomain(body.domain);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Unable to process domain",
      },
      { status: 400 },
    );
  }

  const targets = buildTargets(normalized.origin, body.keywords);
  const emails = new Map<string, AggregatedEmail>();
  const crawled: CrawlSummary[] = [];

  for (const url of targets.slice(0, MAX_PAGES)) {
    const crawlResult = await fetchPage(url);
    crawled.push({
      url,
      ok: crawlResult.ok,
      status: crawlResult.status,
      error: crawlResult.error,
    });

    if (!crawlResult.ok || !crawlResult.body) {
      continue;
    }

    const harvested = extractEmailsFromHtml(
      crawlResult.body,
      url,
      normalized.host,
    );

    for (const hit of harvested) {
      registerEmail(emails, hit.email, {
        url: hit.url,
        context: hit.context,
        via: hit.via,
      });
    }
  }

  const patternSuggestions = buildPatternSuggestions(
    normalized.host,
    body.firstName,
    body.lastName,
  );

  for (const suggestion of patternSuggestions.results) {
    if (emails.has(suggestion.email)) {
      continue;
    }

    registerEmail(emails, suggestion.email, {
      url: suggestion.label,
      context: suggestion.description,
      via: "pattern",
    });
  }

  const responseResults = Array.from(emails.values()).map((entry) => {
    const confidence = resolveConfidence(entry);
    const reason = buildReason(entry);
    return {
      email: entry.email,
      confidence,
      reason,
      sources: entry.sources,
    };
  });

  responseResults.sort((a, b) => {
    const weight = (confidence: EmailConfidence) =>
      confidence === "high" ? 2 : confidence === "medium" ? 1 : 0;
    const diff = weight(b.confidence) - weight(a.confidence);
    if (diff !== 0) {
      return diff;
    }
    return a.email.localeCompare(b.email);
  });

  return NextResponse.json({
    success: true,
    domain: normalized.host,
    results: responseResults,
    patterns: patternSuggestions.labels,
    crawled,
  });
}

function normalizeDomain(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Domain cannot be empty");
  }

  const hasProtocol = /^https?:\/\//i.test(trimmed);
  const url = new URL(hasProtocol ? trimmed : `https://${trimmed}`);

  if (bannedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Please provide a real company domain.");
  }

  return {
    origin: `${url.protocol}//${url.host}`,
    host: url.host.toLowerCase(),
  };
}

function buildTargets(origin: string, keywords: string[]) {
  const targetSet = new Set<string>();

  for (const path of DEFAULT_PATHS) {
    targetSet.add(new URL(path, origin).toString());
  }

  for (const keyword of keywords) {
    const sanitized = keyword
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!sanitized) {
      continue;
    }

    const paths = [
      `/${sanitized}`,
      `/team/${sanitized}`,
      `/contact/${sanitized}`,
      `/departments/${sanitized}`,
      `/people/${sanitized}`,
    ];

    for (const path of paths) {
      targetSet.add(new URL(path, origin).toString());
    }
  }

  return Array.from(targetSet);
}

async function fetchPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "EmailFindAgent/1.0 (+https://agentic-b4029cf7.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Request failed with status ${response.status}`,
      };
    }

    const body = await response.text();
    return {
      ok: true,
      status: response.status,
      body,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "Request timed out"
          : error.message
        : "Unknown fetch error";

    return {
      ok: false,
      status: null,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractEmailsFromHtml(html: string, url: string, host: string) {
  const $ = load(html);
  const results: {
    email: string;
    url: string;
    context: string | null;
    via: "mailto" | "text";
  }[] = [];
  const localSeen = new Set<string>();

  $("a[href^='mailto:']").each((_, element) => {
    const rawHref = $(element).attr("href") ?? "";
    const email = sanitizeEmail(rawHref.replace(/^mailto:/i, "").split("?")[0]);
    if (!email || localSeen.has(email)) {
      return;
    }

    localSeen.add(email);
    results.push({
      email,
      url,
      context: cleanSnippet($(element).text()) || deriveNearbyText($, element),
      via: "mailto",
    });
  });

  const bodyText = $("body").text();
  const matches = bodyText.matchAll(EMAIL_REGEX);

  for (const match of matches) {
    const email = sanitizeEmail(match[0]);
    if (!email || localSeen.has(email)) {
      continue;
    }

    localSeen.add(email);
    const index = match.index ?? 0;
    const context = extractSnippet(bodyText, index, match[0].length);

    results.push({
      email,
      url,
      context,
      via: "text",
    });
  }

  return results.filter((result) => {
    if (bannedHosts.has(result.email.split("@")[1] ?? "")) {
      return false;
    }

    const emailHost = result.email.split("@")[1] ?? "";
    if (!emailHost.includes(host)) {
      // Always keep relevant catch-all mailboxes, but discard obvious spam.
      return GENERIC_PATTERN_PREFIXES.some((prefix) =>
        result.email.startsWith(`${prefix}@`),
      );
    }

    return true;
  });
}

function sanitizeEmail(email: string) {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (trimmed.endsWith(".png") || trimmed.endsWith(".jpg")) {
    return null;
  }

  if (trimmed.includes("example.com")) {
    return null;
  }

  return trimmed;
}

function cleanSnippet(text: string) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

function deriveNearbyText($: CheerioAPI, element: unknown) {
  const scoped = $(element as any);

  const parentText = cleanSnippet(scoped.parent().text());
  if (parentText) {
    return parentText;
  }
  const grandParentText = cleanSnippet(
    scoped.parent().parent().text(),
  );
  return grandParentText;
}

function extractSnippet(text: string, index: number, length: number) {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 60);
  const snippet = cleanSnippet(text.slice(start, end));
  return snippet;
}

function registerEmail(
  map: Map<string, AggregatedEmail>,
  email: string,
  source: EmailSource,
) {
  const entry =
    map.get(email) ??
    ({
      email,
      sources: [],
      viaMailto: 0,
      viaText: 0,
      viaPattern: 0,
    } as AggregatedEmail);

  entry.sources.push(source);

  if (source.via === "mailto") {
    entry.viaMailto += 1;
  } else if (source.via === "text") {
    entry.viaText += 1;
  } else {
    entry.viaPattern += 1;
  }

  map.set(email, entry);
}

function resolveConfidence(entry: AggregatedEmail): EmailConfidence {
  if (entry.viaMailto > 0) {
    return "high";
  }
  if (entry.viaText > 0) {
    return "medium";
  }
  return "low";
}

function buildReason(entry: AggregatedEmail) {
  const parts: string[] = [];

  if (entry.viaMailto > 0) {
    parts.push(
      `${entry.viaMailto} mailto link${entry.viaMailto > 1 ? "s" : ""}`,
    );
  }

  if (entry.viaText > 0) {
    parts.push("page text extraction");
  }

  if (entry.viaPattern > 0 && parts.length === 0) {
    parts.push("naming convention pattern");
  }

  if (parts.length === 0) {
    return "Pattern generated from company naming conventions.";
  }

  return `Based on ${parts.join(" and ")}.`;
}

function buildPatternSuggestions(
  host: string,
  rawFirstName?: string,
  rawLastName?: string,
) {
  const labels: string[] = [];
  const results: {
    email: string;
    label: string;
    description: string;
  }[] = [];

  const domain = host.toLowerCase();

  for (const prefix of GENERIC_PATTERN_PREFIXES) {
    labels.push(`${prefix}@${domain}`);
  }

  const firstName = rawFirstName?.toLowerCase().replace(/[^a-z]/g, "");
  const lastName = rawLastName?.toLowerCase().replace(/[^a-z]/g, "");

  if (firstName && lastName) {
    const firstInitial = firstName.charAt(0);
    const lastInitial = lastName.charAt(0);

    const namedPatterns: Array<[string, string]> = [
      ["first.last", `${firstName}.${lastName}@${domain}`],
      ["firstlast", `${firstName}${lastName}@${domain}`],
      ["f.last", `${firstInitial}.${lastName}@${domain}`],
      ["first", `${firstName}@${domain}`],
      ["last", `${lastName}@${domain}`],
      ["firstl", `${firstName}${lastInitial}@${domain}`],
      ["flast", `${firstInitial}${lastName}@${domain}`],
    ];

    for (const [label, email] of namedPatterns) {
      labels.push(email);
      results.push({
        email,
        label: `Pattern: ${label}`,
        description: `Guessed using ${label} naming convention.`,
      });
    }
  }

  return {
    labels: Array.from(new Set(labels)),
    results,
  };
}
