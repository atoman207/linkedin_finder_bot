import type { Row } from "./types";
import { REGIONS } from "./regions";

const REGION_LABEL = Object.fromEntries(REGIONS.map((r) => [r.id, r.label]));

const COLUMNS: { header: string; value: (r: Row) => string | null | undefined }[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Name (from LinkedIn URL)", value: (r) => r.linkedinName },
  { header: "LinkedIn URL", value: (r) => r.linkedin },
  { header: "Telegram ID", value: (r) => r.telegramId },
  { header: "Telegram URL", value: (r) => r.telegram },
  { header: "Telegram (not a username, as typed)", value: (r) => r.telegramInvalid },
  { header: "GitHub", value: (r) => r.github },
  { header: "Website", value: (r) => r.website },
  { header: "Twitter / X", value: (r) => r.twitter },
  { header: "Country", value: (r) => r.country.name },
  { header: "Country Code", value: (r) => r.country.code },
  { header: "Region", value: (r) => REGION_LABEL[r.region] },
  { header: "Nationality", value: (r) => r.nationalityName },
  { header: "Headline", value: (r) => r.headline },
  { header: "Category", value: (r) => r.category },
  { header: "Experience", value: (r) => r.experience },
  { header: "Yearly Salary", value: (r) => r.yearlySalary },
  { header: "Hourly Rate", value: (r) => r.hourlyRate },
  { header: "Skills", value: (r) => r.skills?.join("; ") },
  { header: "Languages", value: (r) => r.languages?.join("; ") },
  { header: "Latest Job", value: (r) => r.latestJob },
  { header: "Verified", value: (r) => (r.verified ? "yes" : "no") },
  { header: "web3.career Profile", value: (r) => r.profileUrl },
  { header: "Avatar URL", value: (r) => r.avatar },
];

function cell(v: string | null | undefined): string {
  let s = (v ?? "").replace(/\r?\n/g, " ");
  // Neutralise spreadsheet formula injection (cells starting with = + - @ tab or CR)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: Row[]): string {
  const lines = [COLUMNS.map((c) => cell(c.header)).join(",")];
  for (const r of rows) lines.push(COLUMNS.map((c) => cell(c.value(r))).join(","));
  // BOM so Excel opens the file as UTF-8
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function downloadCsv(rows: Row[], label: string) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `web3-blockchain-engineers-${slug || "all"}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
