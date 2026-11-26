"use client";

import { useState } from "react";
import type { Item } from "@/lib/types";

// ------------------------------------------------------------------ helpers

export function safeUrl(u?: string | null): string | null {
  return u && /^https?:\/\//i.test(u) ? u : null;
}

export function lastSegment(url: string): string {
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    return decodeURIComponent(segs[segs.length - 1] ?? "");
  } catch {
    return url;
  }
}

function shortLink(kind: "github" | "website", url: string): string {
  try {
    const u = new URL(url);
    if (kind === "github") return u.pathname.replace(/^\/+|\/+$/g, "") || u.hostname;
    const s = u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "");
    return s.length > 30 ? s.slice(0, 29) + "…" : s;
  } catch {
    return url;
  }
}

function initialsOf(label: string): string {
  const words = label.replace(/^Anonymous\b.*$/i, "").split(/[\s_.\-]+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ icons

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="ico">
    {children}
  </svg>
);
export const TelegramIcon = () => (
  <Svg>
    <path
      fill="currentColor"
      d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"
    />
  </Svg>
);
export const CodeIcon = () => (
  <Svg>
    <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const GlobeIcon = () => (
  <Svg>
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </g>
  </Svg>
);
export const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="search-ico">
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </g>
  </svg>
);

// ------------------------------------------------------------------ small components

export function CountryBadge({ code }: { code: string | null }) {
  return <span className="cc">{code ?? "—"}</span>;
}

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function Avatar({ src, label, size = 44 }: { src?: string | null; label: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  // Gravatar's "mystery person" default is a grey silhouette — ask for a 404 instead so we show coloured initials.
  const url = safeUrl(src)?.replace(/([?&]d=)mp\b/, "$1404") ?? null;
  const hue = hueOf(label);
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span
          className="avatar-fallback"
          style={{ background: `linear-gradient(135deg, hsl(${hue} 80% 58%), hsl(${(hue + 45) % 360} 75% 45%))` }}
        >
          {initialsOf(label)}
        </span>
      )}
    </span>
  );
}

export function CopyButton({ text, copied, onCopied }: { text: string; copied: boolean; onCopied: () => void }) {
  const [pop, setPop] = useState(false);
  async function copy() {
    if (await copyText(text)) {
      onCopied();
      setPop(true);
    } else {
      window.prompt("Copy this LinkedIn URL:", text);
    }
  }
  return (
    <button
      type="button"
      className={`copy-btn ${copied ? "copied" : ""} ${pop ? "pop" : ""}`}
      onClick={copy}
      onAnimationEnd={() => setPop(false)}
      aria-label={copied ? "LinkedIn URL copied — copy again" : "Copy LinkedIn URL"}
      title={copied ? "Copied — click to copy again" : "Copy LinkedIn URL"}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export function LinkedInField({ url, copied, onCopied }: { url: string | null; copied: boolean; onCopied: () => void }) {
  if (!url) return <span className="muted">—</span>;
  return (
    <div className="li-field">
      <a className="li-url" href={url} target="_blank" rel="noopener noreferrer nofollow">
        <span className="li-badge">in</span>
        {url}
      </a>
      <CopyButton text={url} copied={copied} onCopied={onCopied} />
    </div>
  );
}

export function TelegramPill({ r }: { r: Item }) {
  const url = safeUrl(r.telegram);
  if (url)
    return (
      <a className="pill tg" href={url} target="_blank" rel="noopener noreferrer nofollow" title={url}>
        <TelegramIcon />
        <span className="pill-t">@{r.telegramId ?? lastSegment(url)}</span>
      </a>
    );
  if (r.telegramInvalid)
    return (
      <span className="pill off" title="Not a Telegram username — shown exactly as the candidate typed it">
        <TelegramIcon />
        <span className="pill-t">{r.telegramInvalid}</span>
      </span>
    );
  return null;
}

export function GithubPill({ r }: { r: Item }) {
  const url = safeUrl(r.github);
  if (!url) return null;
  return (
    <a className="pill gh" href={url} target="_blank" rel="noopener noreferrer nofollow" title={url}>
      <CodeIcon />
      <span className="pill-t">{shortLink("github", url)}</span>
    </a>
  );
}

export function WebsitePill({ r }: { r: Item }) {
  const url = safeUrl(r.website);
  if (!url) return null;
  return (
    <a className="pill web" href={url} target="_blank" rel="noopener noreferrer nofollow" title={url}>
      <GlobeIcon />
      <span className="pill-t">{shortLink("website", url)}</span>
    </a>
  );
}

const Dash = () => <span className="muted">—</span>;

function NameBlock({ r }: { r: Item }) {
  return (
    <div className="who">
      <Avatar src={r.avatar} label={r.linkedinName || r.username || r.name || "?"} />
      <div className="who-text">
        <a className="who-name" href={r.profileUrl} target="_blank" rel="noopener noreferrer">
          {r.name ?? "—"}
        </a>
        {r.verified && (
          <span className="verified" title="Verified on web3.career" aria-label="Verified">
            ✓
          </span>
        )}
        {r.linkedinName && <div className="muted small">{r.linkedinName}</div>}
      </div>
    </div>
  );
}

function Skills({ r, max = 5 }: { r: Item; max?: number }) {
  if (!r.skills?.length) return null;
  return (
    <div className="skills">
      {r.skills.slice(0, max).map((s) => (
        <span key={s}>{s}</span>
      ))}
      {r.skills.length > max && <span className="more">+{r.skills.length - max}</span>}
    </div>
  );
}

function CountryCell({ r }: { r: Item }) {
  return (
    <>
      <span className="nowrap">
        <CountryBadge code={r.country.code} /> {r.country.name}
      </span>
      {r.nationalityName && r.nationalityName !== r.country.name && !/^remote$/i.test(r.nationalityName) && (
        <div className="muted small">from {r.nationalityName}</div>
      )}
    </>
  );
}

interface RowProps {
  r: Item;
  n: number;
  copied: boolean;
  onCopied: () => void;
}

/** Desktop table row */
export function EngineerRow({ r, n, copied, onCopied }: RowProps) {
  return (
    <tr className="row-in" style={{ ["--i" as string]: Math.min(n % 100, 24) } as React.CSSProperties}>
      <td className="muted num">{n + 1}</td>
      <td>
        <NameBlock r={r} />
      </td>
      <td className="role">
        <div>{r.headline || r.category || "—"}</div>
        <Skills r={r} />
      </td>
      <td>
        <CountryCell r={r} />
      </td>
      <td className="nowrap">{r.experience ?? "—"}</td>
      <td className="li-col">
        <LinkedInField url={safeUrl(r.linkedin)} copied={copied} onCopied={onCopied} />
      </td>
      <td>{r.telegram || r.telegramInvalid ? <TelegramPill r={r} /> : <Dash />}</td>
      <td>{r.github ? <GithubPill r={r} /> : <Dash />}</td>
      <td>{r.website ? <WebsitePill r={r} /> : <Dash />}</td>
    </tr>
  );
}

/** Phone / tablet card */
export function EngineerCard({ r, n, copied, onCopied }: RowProps) {
  return (
    <article className="ecard row-in" style={{ ["--i" as string]: Math.min(n % 100, 12) } as React.CSSProperties}>
      <div className="ecard-top">
        <NameBlock r={r} />
        {r.experience && <span className="exp">{r.experience}</span>}
      </div>
      <div className="ecard-role">{r.headline || r.category || "—"}</div>
      <div className="ecard-meta">
        <CountryCell r={r} />
      </div>
      <Skills r={r} max={6} />
      <div className="ecard-li">
        <LinkedInField url={safeUrl(r.linkedin)} copied={copied} onCopied={onCopied} />
      </div>
      <div className="ecard-pills">
        <TelegramPill r={r} />
        <GithubPill r={r} />
        <WebsitePill r={r} />
      </div>
    </article>
  );
}
