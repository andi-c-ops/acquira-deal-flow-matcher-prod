import nodemailer from "nodemailer";

import { getEnv } from "@/lib/dfm/config/env";
import { getGoogleGmailAccessToken } from "@/lib/dfm/providers/google-oauth";
import { fetchWithTimeout } from "@/lib/dfm/utils/fetch";

interface DailyMatchEmail {
  aeName: string;
  aeEmail?: string | null;
  clickupListId?: string | null;
  strongMatches: number;
  moderateMatches: number;
  totalMatched: number;
  matches: Array<{
    dealName: string;
    matchQuality: string;
    scorePct: number;
    location?: string | null;
    state?: string | null;
    price?: number | null;
    ebitda?: number | null;
    multiple?: number | null;
    listingUrl?: string | null;
    criteriaDetails?: Array<{
      criterion: string;
      match: boolean;
      score: number;
      dealValue: string;
      thesisValue: string;
    }>;
  }>;
}

interface DisplayMatchEmail extends DailyMatchEmail {}

export interface SendSummaryNotificationInput {
  subject?: string;
  summary: Record<string, unknown>;
}

export interface SendErrorNotificationInput {
  workflow: string;
  runId: string;
  message: string;
  context?: Record<string, unknown>;
}

function getTransporter() {
  const env = getEnv();
  if (env.NOTIFICATION_PROVIDER !== "gmail") {
    throw new Error(`Unsupported notification provider: ${env.NOTIFICATION_PROVIDER}`);
  }
  if (!env.GMAIL_SENDER || !env.GMAIL_APP_PASSWORD || !env.NOTIFICATION_TO) {
    throw new Error("Missing Gmail notification configuration");
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: env.GMAIL_SENDER,
      pass: env.GMAIL_APP_PASSWORD,
    },
  });
}

function base64UrlEncode(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sendViaGmailApi(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const boundary = `dfm-${Date.now().toString(36)}`;
  const message = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    input.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const accessToken = await getGoogleGmailAccessToken();
  const response = await fetchWithTimeout(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: base64UrlEncode(message),
    }),
    },
    25_000,
  );

  if (!response.ok) {
    throw new Error(`Gmail API send failed with status ${response.status}`);
  }
}

function formatCompactCurrency(value?: number | null) {
  if (value == null || Number.isNaN(value) || value <= 0) return "";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

function formatReportDate(dateString?: string) {
  const date = dateString ? new Date(dateString) : new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatReportDateTime(dateString?: string) {
  const date = dateString ? new Date(dateString) : new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatReportMetaDateTime(dateString?: string) {
  const date = dateString ? new Date(dateString) : new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatWindowDateTime(dateString?: string) {
  if (!dateString) return "n/a";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatMultiple(value?: number | null) {
  if (value == null || Number.isNaN(value) || value <= 0) return "";
  return `${value.toFixed(1).replace(/\.0$/, "")}x`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeAeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeMatches(matches: DailyMatchEmail["matches"]) {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = [
      match.listingUrl?.trim().toLowerCase(),
      match.dealName.trim().toLowerCase(),
      match.location?.trim().toLowerCase(),
      match.state?.trim().toLowerCase(),
    ]
      .filter(Boolean)
      .join("|");

    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getDisplayReports(summary: Record<string, unknown>) {
  const aeReports = Array.isArray(summary.aeReports)
    ? (summary.aeReports as DailyMatchEmail[])
    : [];
  const merged = new Map<string, DisplayMatchEmail>();

  for (const ae of aeReports) {
    const key = normalizeAeDisplayName(ae.aeName);
    const existing = merged.get(key) ?? {
      aeName: ae.aeName.trim(),
      aeEmail: ae.aeEmail ?? null,
      clickupListId: ae.clickupListId ?? null,
      strongMatches: 0,
      moderateMatches: 0,
      totalMatched: 0,
      matches: [],
    };

    existing.strongMatches += ae.strongMatches;
    existing.moderateMatches += ae.moderateMatches;
    existing.totalMatched += ae.totalMatched;
    existing.matches.push(...ae.matches);

    if (!existing.aeEmail && ae.aeEmail) {
      existing.aeEmail = ae.aeEmail;
    }
    if (!existing.clickupListId && ae.clickupListId) {
      existing.clickupListId = ae.clickupListId;
    }

    if (ae.aeName.trim().length > existing.aeName.length) {
      existing.aeName = ae.aeName.trim();
    }

    merged.set(key, existing);
  }

  return Array.from(merged.values())
    .map((ae) => ({
      ...ae,
      matches: dedupeMatches(ae.matches).sort((a, b) => {
        if (b.scorePct !== a.scorePct) return b.scorePct - a.scorePct;
        if (a.matchQuality !== b.matchQuality) return a.matchQuality === "Strong" ? -1 : 1;
        return a.dealName.localeCompare(b.dealName);
      }),
    }))
    .sort((a, b) => {
      if (b.strongMatches !== a.strongMatches) return b.strongMatches - a.strongMatches;
      if (b.totalMatched !== a.totalMatched) return b.totalMatched - a.totalMatched;
      return a.aeName.localeCompare(b.aeName);
    });
}

function formatDealStats(match: DailyMatchEmail["matches"][number]) {
  const priceLabel = formatCompactCurrency(match.price);
  const ebitdaLabel = formatCompactCurrency(match.ebitda);
  const multipleLabel = formatMultiple(match.multiple);
  return [
    [match.location, match.state].filter(Boolean).join(", ") || null,
    priceLabel ? `Ask ${priceLabel}` : null,
    ebitdaLabel ? `CF ${ebitdaLabel}` : null,
    multipleLabel || null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function getModerateScoreBreakdown(ae: DisplayMatchEmail) {
  const moderateMatches = ae.matches.filter((match) => match.matchQuality === "Moderate");
  const nearStrong = moderateMatches.filter((match) => match.scorePct >= 75).length;
  const broad = moderateMatches.filter((match) => match.scorePct <= 50).length;
  const mixed = Math.max(moderateMatches.length - nearStrong - broad, 0);

  let queueLabel = "Mixed queue";
  if (nearStrong >= Math.max(8, broad * 2)) {
    queueLabel = "Near-strong queue";
  } else if (broad >= Math.max(12, nearStrong * 2)) {
    queueLabel = "Broad queue";
  }

  return {
    moderateTotal: moderateMatches.length,
    nearStrong,
    broad,
    mixed,
    queueLabel,
  };
}

function getAeDriftExplanation(ae: DisplayMatchEmail) {
  const criterionCounts = new Map<string, number>();

  for (const match of ae.matches) {
    if (match.matchQuality !== "Moderate") continue;
    for (const detail of match.criteriaDetails ?? []) {
      if (detail.match) continue;
      criterionCounts.set(detail.criterion, (criterionCounts.get(detail.criterion) ?? 0) + 1);
    }
  }

  const ranked = Array.from(criterionCounts.entries()).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return "No clear drift pattern detected from current moderate matches.";
  }

  const [topCriterion, topCount] = ranked[0];
  const second = ranked[1];
  if (!second) {
    return `Most moderate misses come from ${topCriterion.toLowerCase()} (${topCount}).`;
  }

  return `Most moderate misses come from ${topCriterion.toLowerCase()} (${topCount}), then ${second[0].toLowerCase()} (${second[1]}).`;
}

function criterionToRecommendation(criterion: string) {
  switch (criterion) {
    case "Industry":
      return "Tighten industry keywords or remove adjacent categories.";
    case "Geography":
      return "Narrow geography targets to the states or metros you actually want.";
    case "Asking Price":
      return "Tighten the asking-price range to reduce off-band listings.";
    case "EBITDA":
      return "Raise the minimum cash flow or tighten the EBITDA band.";
    default:
      return "Review thesis criteria and narrow the broadest filter.";
  }
}

function getAeDriftRecommendation(ae: DisplayMatchEmail) {
  const criterionCounts = new Map<string, number>();

  for (const match of ae.matches) {
    if (match.matchQuality !== "Moderate") continue;
    for (const detail of match.criteriaDetails ?? []) {
      if (detail.match) continue;
      criterionCounts.set(detail.criterion, (criterionCounts.get(detail.criterion) ?? 0) + 1);
    }
  }

  const ranked = Array.from(criterionCounts.entries()).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return "No immediate thesis adjustment recommended from this run.";
  }

  const topCriterion = ranked[0][0];
  const secondCriterion = ranked[1]?.[0];
  if (!secondCriterion) {
    return criterionToRecommendation(topCriterion);
  }

  if (topCriterion === secondCriterion) {
    return criterionToRecommendation(topCriterion);
  }

  return `${criterionToRecommendation(topCriterion)} Then review ${secondCriterion.toLowerCase()}.`;
}

function getActionabilityScore(ae: DisplayMatchEmail) {
  const breakdown = getModerateScoreBreakdown(ae);
  return {
    strong: ae.strongMatches,
    nearStrong: breakdown.nearStrong,
    total: ae.totalMatched,
  };
}

function buildDailySubject(summary: Record<string, unknown>) {
  const dateLabel = formatReportDate(
    typeof summary.generatedAt === "string" ? summary.generatedAt : undefined,
  );
  const strong = Number(summary.totalStrongMatches ?? 0);
  const moderate = Number(summary.totalModerateMatches ?? 0);
  return `Deal Flow Daily | ${dateLabel} | ${strong} Strong, ${moderate} Moderate`;
}

const CONTROL_ROOM_URL = "https://acquira-deal-flow-control-room.andicunanan2024.chatgpt.site";

function buildCompactDailyHtml(summary: Record<string, unknown>) {
  const generatedAt =
    typeof summary.generatedAt === "string" ? summary.generatedAt : new Date().toISOString();
  const dealsProcessed = Number(summary.fetchedDeals ?? 0);
  const strong = Number(summary.totalStrongMatches ?? 0);
  const moderate = Number(summary.totalModerateMatches ?? 0);
  const aesWithMatches = Number(summary.aesWithMatches ?? 0);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#f8fafc;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;line-height:1.5;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <div style="background:#020617;padding:22px 24px;border-bottom:3px solid #4ea4d3;">
      <div style="color:#ffffff;font-size:20px;font-weight:700;">Deal Flow Daily</div>
      <div style="color:#7fdcf3;font-size:13px;margin-top:4px;">${escapeHtml(formatReportMetaDateTime(generatedAt))}</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 18px;color:#475569;">The daily matching run completed. Use the Control Room for AE detail, coverage review, and agent prompts.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td style="width:25%;padding:12px 8px;background:#eff6ff;text-align:center;border-radius:10px;"><strong style="display:block;font-size:22px;color:#2563eb;">${dealsProcessed}</strong><span style="font-size:11px;color:#475569;">Deals Processed</span></td>
        <td style="width:4%;"></td>
        <td style="width:22%;padding:12px 8px;background:#ecfdf5;text-align:center;border-radius:10px;"><strong style="display:block;font-size:22px;color:#15803d;">${strong}</strong><span style="font-size:11px;color:#475569;">Strong</span></td>
        <td style="width:4%;"></td>
        <td style="width:22%;padding:12px 8px;background:#fffbeb;text-align:center;border-radius:10px;"><strong style="display:block;font-size:22px;color:#b45309;">${moderate}</strong><span style="font-size:11px;color:#475569;">Moderate</span></td>
        <td style="width:4%;"></td>
        <td style="width:22%;padding:12px 8px;background:#eef2ff;text-align:center;border-radius:10px;"><strong style="display:block;font-size:22px;color:#4f46e5;">${aesWithMatches}</strong><span style="font-size:11px;color:#475569;">AEs Matched</span></td>
      </tr></table>
      <a href="${CONTROL_ROOM_URL}" style="display:inline-block;margin-top:22px;background:#2563eb;color:#ffffff;padding:12px 16px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;">Open Deal Flow Control Room</a>
    </div>
  </div>
</body></html>`;
}

function buildCompactDailyText(summary: Record<string, unknown>) {
  const generatedAt =
    typeof summary.generatedAt === "string" ? summary.generatedAt : new Date().toISOString();
  return [
    "Deal Flow Daily",
    formatReportMetaDateTime(generatedAt),
    `Deals processed: ${Number(summary.fetchedDeals ?? 0)}`,
    `Strong matches: ${Number(summary.totalStrongMatches ?? 0)}`,
    `Moderate matches: ${Number(summary.totalModerateMatches ?? 0)}`,
    `AEs matched: ${Number(summary.aesWithMatches ?? 0)}`,
    "",
    `Open the Control Room for full details: ${CONTROL_ROOM_URL}`,
  ].join("\n");
}

function buildDailyHtml(summary: Record<string, unknown>) {
  const generatedAt =
    typeof summary.generatedAt === "string" ? summary.generatedAt : new Date().toISOString();
  const dealsProcessed = Number(summary.fetchedDeals ?? 0);
  const strong = Number(summary.totalStrongMatches ?? 0);
  const moderate = Number(summary.totalModerateMatches ?? 0);
  const aesWithMatches = Number(summary.aesWithMatches ?? 0);
  const displayReports = getDisplayReports(summary);
  const detailReports = displayReports.filter((ae) => ae.totalMatched > 0);
  const generatedAtLabel = formatReportMetaDateTime(generatedAt);

  const summaryRowsHtml = displayReports
    .map(
      (ae) => `<tr>
      <td>${escapeHtml(ae.aeName)}</td>
      <td class="${ae.strongMatches > 0 ? "num-strong" : "num-zero"}">${ae.strongMatches}</td>
      <td class="${ae.moderateMatches > 0 ? "num-moderate" : "num-zero"}">${ae.moderateMatches}</td>
      <td>${ae.totalMatched > 0 ? `<strong>${ae.totalMatched}</strong>` : '<span class="num-zero">0</span>'}</td>
    </tr>`,
    )
    .join("");

  const matchedDealsHtml = detailReports
    .map((ae) => {
      const dealsHtml = ae.matches
        .map((match) => {
          const stats = formatDealStats(match);
          const isStrong = match.matchQuality === "Strong";
          const rowClass = isStrong ? "deal-row" : "deal-row moderate";
          const badgeClass = isStrong ? "badge badge-strong" : "badge badge-moderate";
          const name = match.listingUrl
            ? `<a href="${escapeHtml(match.listingUrl)}" style="color:#4695C0;text-decoration:none;font-weight:700;">${escapeHtml(match.dealName)}</a>`
            : escapeHtml(match.dealName);

          return `<div class="${rowClass}">
    <span class="${badgeClass}">${escapeHtml(match.matchQuality)} ${Math.round(match.scorePct)}%</span>
    <div>
      <div class="deal-name">${name}</div>
      <div class="deal-stats">${escapeHtml(stats || "No financial or location detail available")}</div>
    </div>
  </div>`;
        })
        .join("");

      return `<p class="ae-name-hdr">${escapeHtml(ae.aeName)}</p>
  <div style="margin-bottom:16px">
  ${dealsHtml}
  </div>`;
    })
    .join("");

  const css = `
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                     Oxygen, Ubuntu, Cantarell, Arial, sans-serif;
        font-size: 14px; color: #000000; max-width: 680px; margin: 0 auto;
        padding: 0; background: #F3F4F6; line-height: 1.6;
    }
    .email-header {
        background: #272732; padding: 18px 28px 0 28px; border-radius: 10px 10px 0 0;
    }
    .email-header-inner {
        border-bottom: 3px solid #4695C0; padding-bottom: 16px;
        display: flex; align-items: center; justify-content: space-between;
    }
    .brand-name {
        color: #ffffff; font-size: 13px; font-weight: 700;
        letter-spacing: 1.5px; text-transform: uppercase;
    }
    .header-label {
        color: #9ca3af; font-size: 12px;
    }
    .email-body { background: #ffffff; padding: 24px 28px; }
    .card {
        background: #ffffff; border-radius: 10px; padding: 20px 24px;
        margin-bottom: 16px;
        border: 1px solid #E2E2E2;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,.06), 0 10px 10px -5px rgba(0,0,0,.03);
    }
    h1 { color: #4695C0; font-size: 20px; font-weight: 700; margin: 0 0 4px; }
    .meta { color: #32373C; font-size: 13px; margin: 0; line-height: 1.6; }
    h2 {
        font-size: 14px; font-weight: 700; color: #272732;
        margin: 0 0 12px; padding-bottom: 8px;
        border-bottom: 1px solid #E2E2E2; text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    table { border-collapse: collapse; width: 100%; }
    th {
        background: #4695C0; color: #ffffff; padding: 9px 14px;
        text-align: left; font-size: 12px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.4px;
    }
    th:first-child { border-radius: 5px 0 0 5px; }
    th:last-child  { border-radius: 0 5px 5px 0; }
    td { padding: 9px 14px; border-bottom: 1px solid #F3F4F6; font-size: 13px; color: #000000; }
    tr:nth-child(even) td { background: #F3F4F6; }
    tr:last-child td { border-bottom: none; }
    .num-strong   { color: #166534; font-weight: 700; }
    .num-moderate { color: #E07A2C; font-weight: 700; }
    .num-zero     { color: #BCBDBF; }
    .ae-name-hdr {
        font-weight: 700; font-size: 14px; color: #4695C0;
        margin: 0 0 8px; padding-bottom: 4px;
        border-bottom: 2px solid #4695C0;
        display: inline-block;
    }
    .deal-row {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 8px 12px; margin-bottom: 5px;
        border-left: 3px solid #4695C0; background: #EBF5FB;
        border-radius: 0 5px 5px 0;
    }
    .deal-row.moderate {
        border-left-color: #E07A2C; background: #FDF3E9;
    }
    .badge {
        display: inline-block; font-size: 10px; font-weight: 700;
        padding: 2px 8px; border-radius: 25px;
        white-space: nowrap; flex-shrink: 0; margin-top: 2px;
        letter-spacing: 0.3px;
    }
    .badge-strong   { background: #4695C0; color: #ffffff; }
    .badge-moderate { background: #E07A2C; color: #ffffff; }
    .deal-name  { font-weight: 700; color: #272732; line-height: 1.5; font-size: 13px; }
    .deal-stats { color: #32373C; font-size: 12px; margin-top: 2px; line-height: 1.5; }
    .email-footer {
        background: #272732; padding: 0 28px 16px 28px;
        border-radius: 0 0 10px 10px;
    }
    .email-footer-inner {
        border-top: 3px solid #4695C0; padding-top: 14px;
        color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;
    }
    .footer-brand { color: #4695C0; font-weight: 700; }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${css}</style></head>
<body>
<div class="email-header">
  <div class="email-header-inner">
    <span class="brand-name">Acquira</span>
    <span class="header-label">Deal Flow Matcher</span>
  </div>
</div>
<div class="email-body">
  <div class="card">
    <h1>Deal Flow Report</h1>
    <p class="meta">${escapeHtml(generatedAtLabel)} &nbsp;&middot;&nbsp; Deals processed: <strong>${dealsProcessed}</strong> &nbsp;·&nbsp; 
    <strong style="color:#166534">${strong} strong</strong> &nbsp;+&nbsp;
    <span style="color:#E07A2C;font-weight:700">${moderate} moderate</span>
    &nbsp;&middot;&nbsp; <strong>${aesWithMatches}</strong> AE(s) with matches</p>
  </div>
  <div class="card">
    <h2>Summary by AE</h2>
    <table>
      <tr>
        <th>AE Name</th>
        <th>Strong</th>
        <th>Moderate</th>
        <th>Total</th>
      </tr>
      ${summaryRowsHtml}
    </table>
  </div>
  <div class="card">
    <h2>Matched Deals by AE</h2>
    ${matchedDealsHtml || '<p class="meta">No matched deals in this run.</p>'}
  </div>
</div>
<div class="email-footer">
  <div class="email-footer-inner">
    <span class="footer-brand">Acquira</span> Deal Flow Matcher
  </div>
</div>
</body>
</html>`;
}

function buildDailyText(summary: Record<string, unknown>) {
  const generatedAt =
    typeof summary.generatedAt === "string" ? summary.generatedAt : new Date().toISOString();
  const displayReports = getDisplayReports(summary);
  const dealsProcessed = Number(summary.fetchedDeals ?? 0);
  const strong = Number(summary.totalStrongMatches ?? 0);
  const moderate = Number(summary.totalModerateMatches ?? 0);
  const aesWithMatches = Number(summary.aesWithMatches ?? 0);
  const detailReports = displayReports.filter((ae) => ae.totalMatched > 0);

  return [
    "Deal Flow Report",
    `${formatReportMetaDateTime(generatedAt)} | Deals processed: ${dealsProcessed} | ${strong} strong + ${moderate} moderate | ${aesWithMatches} AE(s) with matches`,
    "",
    "Priority strong matches:",
    ...(detailReports.length
      ? detailReports.flatMap((ae) => [
          `${ae.aeName}`,
          ...ae.matches.map((match) => {
            const stats = formatDealStats(match);
            return `- ${match.matchQuality} ${Math.round(match.scorePct)}% | ${match.dealName}${stats ? ` | ${stats}` : ""}`;
          }),
          "",
        ])
      : ["None"]),
    "",
    "Summary by AE:",
    ...displayReports
      .map(
        (ae) =>
          `${ae.aeName}: ${ae.strongMatches} strong, ${ae.moderateMatches} moderate, ${ae.totalMatched} total`,
      ),
  ].join("\n");
}

function buildErrorHtml(input: SendErrorNotificationInput) {
  const generatedAt = formatReportDateTime();
  const context = input.context ? JSON.stringify(input.context, null, 2) : "";
  const contextHtml = context
    ? `<div class="card">
    <div class="section-title">
      <div>
        <p class="section-kicker">Context</p>
        <h2>Failure Details</h2>
      </div>
    </div>
    <div class="summary-list">
      <div class="summary-row">
        <div class="summary-label">Payload</div>
        <div>
          <div class="summary-detail" style="margin-top:0;white-space:pre-wrap;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;color:#334E68;">${escapeHtml(context)}</div>
        </div>
      </div>
    </div>
  </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>
  body {
    font-family: 'Avenir Next', Avenir, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 14px; color: #102A43; max-width: 760px; margin: 0 auto;
    padding: 0; background: #E9EEF3; line-height: 1.6;
  }
  .email-shell { padding: 20px 12px 28px; }
  .email-header { background: #FFFFFF; padding: 22px 24px 18px; border: 1px solid #D9E2EC; border-bottom: none; }
  .hero-title { color: #102A43; font-size: 28px; font-weight: 800; letter-spacing: -.4px; line-height: 1.1; margin: 0 0 6px; }
  .hero-window { color: #627D98; font-size: 12px; font-weight: 400; margin: 0; }
  .email-body { background: #F8FAFC; padding: 18px 24px 0; border-left: 1px solid #D9E2EC; border-right: 1px solid #D9E2EC; }
  .card { background: #FFFFFF; padding: 16px 18px; margin-bottom: 14px; border: 1px solid #E6EDF5; }
  .section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .section-kicker { color: #829AB1; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 6px; }
  h1, h2, h3, p { margin-top: 0; }
  h2 { font-size: 20px; font-weight: 800; color: #102A43; margin: 0; letter-spacing: -.2px; }
  .section-note { color: #627D98; font-size: 12px; }
  .summary-list { display: grid; gap: 10px; }
  .summary-row { display: grid; grid-template-columns: 210px 1fr; gap: 14px; padding: 10px 0; border-bottom: 1px solid #E6EDF5; }
  .summary-row:last-child { border-bottom: none; }
  .summary-label { color: #486581; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .summary-value { color: #102A43; font-size: 15px; font-weight: 700; }
  .summary-detail { color: #627D98; font-size: 12px; margin-top: 3px; }
  .email-footer { background: #FFFFFF; padding: 12px 24px 18px; border: 1px solid #D9E2EC; border-top: none; }
  .email-footer-inner { border-top: 1px solid #E6EDF5; padding-top: 12px; color: #829AB1; font-size: 12px; text-align: center; line-height: 1.6; }
  .footer-brand { color: #334E68; font-weight: 700; }
  @media (max-width: 640px) {
    .email-shell { padding: 10px 0 18px; }
    .email-header { padding: 18px 18px 14px; }
    .hero-title { font-size: 26px; }
    .email-body { padding: 18px 18px 0; }
    .card { padding: 14px 14px; }
    .summary-row { grid-template-columns: 1fr; gap: 6px; }
  }
</style></head>
<body>
<div class="email-shell">
<div class="email-header">
  <h1 class="hero-title">Deal Flow Matcher Error</h1>
  <div class="hero-window">${escapeHtml(generatedAt)}</div>
</div>
<div class="email-body">
  <div class="card">
    <div class="section-title">
      <div>
        <p class="section-kicker">Alert</p>
        <h2>Workflow Error</h2>
      </div>
      <span class="section-note">Daily-only delivery path</span>
    </div>
    <div class="summary-list">
      <div class="summary-row">
        <div class="summary-label">Workflow</div>
        <div><div class="summary-value">${escapeHtml(input.workflow)}</div></div>
      </div>
      <div class="summary-row">
        <div class="summary-label">Run ID</div>
        <div><div class="summary-value">${escapeHtml(input.runId)}</div></div>
      </div>
      <div class="summary-row">
        <div class="summary-label">Error</div>
        <div><div class="summary-value" style="color:#B91C1C;">${escapeHtml(input.message)}</div></div>
      </div>
      <div class="summary-row">
        <div class="summary-label">Recovery</div>
        <div>
          <div class="summary-value">Cursor stays at last successful run</div>
          <div class="summary-detail">After the issue is fixed, the next daily run resumes from the last successful Airtable cursor.</div>
        </div>
      </div>
    </div>
  </div>
  ${contextHtml}
</div>
<div class="email-footer">
  <div class="email-footer-inner">
    <span class="footer-brand">Acquira</span> Deal Flow Matcher
  </div>
</div>
</div>
</body>
</html>`;
}

export async function sendSummaryNotification(input: SendSummaryNotificationInput): Promise<void> {
  const env = getEnv();
  const subject = input.subject ?? buildDailySubject(input.summary);
  const text = buildCompactDailyText(input.summary);
  const html = buildCompactDailyHtml(input.summary);

  if (!env.GMAIL_SENDER || !env.NOTIFICATION_TO) {
    throw new Error("Missing Gmail notification recipients");
  }

  if (env.NOTIFICATION_PROVIDER === "gmail_oauth") {
    await sendViaGmailApi({
      from: env.GMAIL_SENDER,
      to: env.NOTIFICATION_TO,
      subject,
      text,
      html,
    });
    return;
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: env.GMAIL_SENDER,
    to: env.NOTIFICATION_TO,
    subject,
    text,
    html,
  });
}

export function buildSummaryNotificationPreview(summary: Record<string, unknown>) {
  return {
    subject: buildDailySubject(summary),
    text: buildCompactDailyText(summary),
    html: buildCompactDailyHtml(summary),
  };
}

export async function sendErrorNotification(input: SendErrorNotificationInput): Promise<void> {
  const env = getEnv();
  const subject = `Deal Flow Error | ${input.workflow} | ${input.runId.slice(0, 8)}`;
  const text = [
    "Deal Flow Matcher Error",
    `Generated: ${formatReportDateTime()}`,
    `Workflow: ${input.workflow}`,
    `Run ID: ${input.runId}`,
    `Error: ${input.message}`,
    "Recovery: Cursor stays at last successful run. After the issue is fixed, the next daily run resumes from the last successful Airtable cursor.",
    ...(input.context ? ["", "Context:", JSON.stringify(input.context, null, 2)] : []),
  ].join("\n");
  const html = buildErrorHtml(input);

  if (!env.GMAIL_SENDER || !env.NOTIFICATION_TO) {
    throw new Error("Missing Gmail notification recipients");
  }

  if (env.NOTIFICATION_PROVIDER === "gmail_oauth") {
    await sendViaGmailApi({
      from: env.GMAIL_SENDER,
      to: env.NOTIFICATION_TO,
      subject,
      text,
      html,
    });
    return;
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: env.GMAIL_SENDER,
    to: env.NOTIFICATION_TO,
    subject,
    text,
    html,
  });
}
