"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactKey, Dataset, Item, RegionId } from "@/lib/types";
import { REGIONS, REGION_ORDER, countryOf, regionOf, subregionOf, subregionOrder } from "@/lib/regions";
import { HIDDEN_COUNTRIES, HIDE_DEAD_LINKEDIN, REQUIRE_LINKEDIN } from "@/lib/config";
import { downloadCsv } from "@/lib/csv";
import { isDeadLinkedin } from "@/lib/linkedin";
import { CountryBadge, EngineerCard, EngineerRow, SearchIcon } from "./parts";

const CONTACTS: { key: ContactKey; label: string }[] = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "telegram", label: "Telegram" },
  { key: "github", label: "GitHub" },
  { key: "website", label: "Website" },
];
/** Contact filters offered in the toolbar (LinkedIn is pointless when everyone has it). */
const FILTERABLE = CONTACTS.filter((c) => !(REQUIRE_LINKEDIN && c.key === "linkedin"));

type SortKey = "site" | "experience" | "contacts";
const PAGE_SIZE = 60;
const ALL = "__ALL__";
const COPIED_KEY = "w3c.copiedLinkedin.v1";

interface CountryTab {
  key: string;
  code: string | null;
  name: string;
  count: number;
  sub: string;
}

function useCountUp(target: number, duration = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function Stat({ value, label, tone, i }: { value: number; label: string; tone: string; i: number }) {
  const v = useCountUp(value);
  return (
    <div className={`stat tone-${tone}`} style={{ ["--i" as string]: i } as React.CSSProperties}>
      <b>{v.toLocaleString()}</b>
      <span>{label}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <main className="shell" data-region="americas">
      <div className="hero skeleton-hero" />
      <div className="stats">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="stat skel" />
        ))}
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skel skel-row" />
      ))}
    </main>
  );
}

export default function EngineerBrowser() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionId>("americas");
  const [country, setCountry] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<ContactKey>>(new Set());
  const [sort, setSort] = useState<SortKey>("site");
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const urlRead = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Restore view from the URL, e.g. ?region=asia&country=all&exclude=CN&has=telegram&q=solidity
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("region");
    if (r && REGIONS.some((x) => x.id === r)) setRegion(r as RegionId);
    const c = p.get("country");
    if (c) setCountry(c.toLowerCase() === "all" ? ALL : c.toUpperCase());
    const ex = p.get("exclude");
    if (ex) setExcluded(new Set(ex.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)));
    const q = p.get("q");
    if (q) setQuery(q);
    const has = p.get("has");
    if (has) setFilters(new Set(has.split(",").filter((k) => FILTERABLE.some((x) => x.key === k)) as ContactKey[]));
    urlRead.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(COPIED_KEY) || "[]");
      if (Array.isArray(saved)) setCopied(new Set(saved.filter((s) => typeof s === "string")));
    } catch {
      /* storage unavailable — copied marks just won't persist */
    }
  }, []);

  useEffect(() => {
    // Prefer the static public snapshot (no DB; survives Vercel deploys). Fall back to the API route.
    const load = async () => {
      const urls = ["/data/snapshot.json", "/api/engineers"];
      let lastError = "No data snapshot found.";
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
          setData(json as Dataset);
          return;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }
      setError(lastError);
    };
    void load();
  }, []);

  const removed = useMemo(() => {
    if (data?.removed) return data.removed; // snapshot already applied the rules
    let country = 0;
    let linkedin = 0;
    let deadLinkedin = 0;
    for (const e of data?.engineers ?? []) {
      if (HIDDEN_COUNTRIES.has(countryOf(e).key)) country++;
      else if (REQUIRE_LINKEDIN && !e.linkedin) linkedin++;
      else if (HIDE_DEAD_LINKEDIN && isDeadLinkedin(e)) deadLinkedin++;
    }
    return { country, linkedin, deadLinkedin };
  }, [data]);

  const items: Item[] = useMemo(() => {
    if (!data) return [];
    const out: Item[] = [];
    for (const e of data.engineers) {
      const c = countryOf(e);
      if (HIDDEN_COUNTRIES.has(c.key)) continue;
      if (REQUIRE_LINKEDIN && !e.linkedin) continue;
      if (HIDE_DEAD_LINKEDIN && isDeadLinkedin(e)) continue;
      out.push({
        ...e,
        country: c,
        region: regionOf(c.code),
        years: parseInt(e.experience ?? "", 10) || 0,
        contactCount: CONTACTS.filter((k) => e[k.key]).length,
        search: [e.name, e.username, e.linkedinName, e.headline, e.category, e.telegramId, e.latestJob, c.name, e.nationalityName, ...(e.skills ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      });
    }
    return out;
  }, [data]);

  const groups = useMemo(() => {
    const byRegion = new Map<RegionId, Map<string, CountryTab>>();
    for (const r of items) {
      let m = byRegion.get(r.region);
      if (!m) byRegion.set(r.region, (m = new Map()));
      const tab = m.get(r.country.key);
      if (tab) tab.count++;
      else m.set(r.country.key, { ...r.country, count: 1, sub: subregionOf(r.country.code) });
    }
    return REGIONS.map((reg) => {
      const countries = [...(byRegion.get(reg.id)?.values() ?? [])].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const subgroups = subregionOrder(reg.id)
        .map((label) => {
          const list = countries.filter((c) => c.sub === label);
          return { label, countries: list, count: list.reduce((s, c) => s + c.count, 0) };
        })
        .filter((s) => s.countries.length);
      return { ...reg, countries, subgroups, count: countries.reduce((s, c) => s + c.count, 0) };
    });
  }, [items]);

  const countryRank = useMemo(() => {
    const m = new Map<string, number>();
    groups.forEach((g) => g.countries.forEach((c, i) => m.set(c.key, i)));
    return m;
  }, [groups]);

  const group = groups.find((g) => g.id === region)!;
  const activeCountry =
    country === ALL || (country && group.countries.some((c) => c.key === country)) ? country : group.countries[0]?.key ?? ALL;
  const isAll = activeCountry === ALL;
  const activeTab = group.countries.find((c) => c.key === activeCountry);
  const regionExcluded = group.countries.filter((c) => excluded.has(c.key));
  const includedCountries = group.countries.length - regionExcluded.length;

  let viewLabel = activeTab?.name ?? "";
  if (isAll) {
    if (!regionExcluded.length) viewLabel = `All ${group.label}`;
    else if (regionExcluded.length <= 3) viewLabel = `${group.label} excluding ${regionExcluded.map((c) => c.name).join(", ")}`;
    else viewLabel = `${group.label} (${includedCountries} of ${group.countries.length} countries)`;
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter(
      (r) =>
        r.region === region &&
        (isAll ? !excluded.has(r.country.key) : r.country.key === activeCountry) &&
        [...filters].every((k) => !!r[k]) &&
        (!q || r.search.includes(q))
    );
    if (sort === "experience") list.sort((a, b) => b.years - a.years || a.rank - b.rank);
    else if (sort === "contacts") list.sort((a, b) => b.contactCount - a.contactCount || a.rank - b.rank);
    else list.sort((a, b) => a.rank - b.rank);
    return list;
  }, [items, region, isAll, activeCountry, excluded, filters, query, sort]);

  useEffect(() => {
    if (!urlRead.current || !data) return;
    const p = new URLSearchParams();
    if (region !== "americas") p.set("region", region);
    if (country) p.set("country", isAll ? "all" : activeCountry);
    if (excluded.size) p.set("exclude", [...excluded].join(","));
    if (query.trim()) p.set("q", query.trim());
    if (filters.size) p.set("has", [...filters].join(","));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [data, region, country, isAll, activeCountry, excluded, query, filters]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const viewKey = `${region}|${activeCountry}|${safePage}|${sort}`;

  const stats = useMemo(
    () => ({
      countries: new Set(items.map((r) => r.country.key)).size,
      linkedin: items.filter((r) => r.linkedin).length,
      telegram: items.filter((r) => r.telegram).length,
      github: items.filter((r) => r.github).length,
      website: items.filter((r) => r.website).length,
    }),
    [items]
  );

  const byCountry = (rows: Item[]) =>
    [...rows].sort(
      (a, b) =>
        REGION_ORDER[a.region] - REGION_ORDER[b.region] ||
        (countryRank.get(a.country.key) ?? 0) - (countryRank.get(b.country.key) ?? 0)
    );
  const downloadAll = () => downloadCsv(byCountry([...items].sort((a, b) => a.rank - b.rank)), "all-countries");
  const downloadView = () => downloadCsv(isAll ? byCountry(visible) : visible, viewLabel);

  const markCopied = (id: string) =>
    setCopied((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(COPIED_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  const clearCopied = () => {
    if (!window.confirm(`Clear the red "copied" mark from ${copied.size} LinkedIn URL(s)?`)) return;
    setCopied(new Set());
    try {
      localStorage.removeItem(COPIED_KEY);
    } catch {
      /* ignore */
    }
  };

  const selectRegion = (id: RegionId) => {
    setRegion(id);
    setCountry(null);
    setPage(0);
  };
  const selectCountry = (key: string) => {
    setCountry(key);
    setPage(0);
  };
  const toggleFilter = (k: ContactKey) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setPage(0);
  };
  const setIncluded = (keys: string[], include: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (include) next.delete(k);
        else next.add(k);
      }
      return next;
    });
    setPage(0);
  };
  const onlySubregion = (label: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const c of group.countries) {
        if (c.sub === label) next.delete(c.key);
        else next.add(c.key);
      }
      return next;
    });
    setPage(0);
  };
  const goToPage = (p: number) => {
    setPage(p);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (error) {
    return (
      <main className="shell" data-region="americas">
        <div className="notice error">
          <strong>Could not load data.</strong> {error}
        </div>
      </main>
    );
  }
  if (!data) return <Skeleton />;

  const rules = [
    REQUIRE_LINKEDIN && "LinkedIn profiles only",
    HIDDEN_COUNTRIES.size > 0 && `excluding ${[...HIDDEN_COUNTRIES].map((c) => (c === "KR" ? "South Korea" : c)).join(", ")}`,
  ].filter(Boolean);

  return (
    <main className="shell" data-region={region}>
      <header className="hero">
        <span className="blob b1" aria-hidden="true" />
        <span className="blob b2" aria-hidden="true" />
        <span className="blob b3" aria-hidden="true" />
        <div className="hero-inner">
          <div>
            <p className="eyebrow">web3.career · talent search</p>
            <h1>Blockchain Engineers</h1>
            <p className="hero-sub">
              {items.length.toLocaleString()} engineers · {rules.join(" · ")} · scraped{" "}
              {new Date(data.scrapedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
            </p>
          </div>
          <button className="btn hero-btn" onClick={downloadAll}>
            ⬇ Download all (CSV)
          </button>
        </div>
      </header>

      <section className="stats">
        <Stat i={0} tone="accent" value={items.length} label="engineers" />
        <Stat i={1} tone="amber" value={stats.countries} label="countries" />
        {REQUIRE_LINKEDIN ? (
          <Stat i={2} tone="web" value={stats.website} label="with website" />
        ) : (
          <Stat i={2} tone="li" value={stats.linkedin} label="with LinkedIn" />
        )}
        <Stat i={3} tone="tg" value={stats.telegram} label="with Telegram" />
        <Stat i={4} tone="gh" value={stats.github} label="with GitHub" />
      </section>

      <nav className="regions scroller" aria-label="Regions">
        {groups.map((g) => (
          <button
            key={g.id}
            data-r={g.id}
            className={`region ${g.id === region ? "active" : ""}`}
            disabled={g.count === 0}
            onClick={() => selectRegion(g.id)}
          >
            <span className="dot" />
            {g.label} <span className="count">{g.count.toLocaleString()}</span>
          </button>
        ))}
      </nav>

      <div className="tabs scroller" role="tablist" aria-label="Countries">
        <button role="tab" aria-selected={isAll} className={`tab ${isAll ? "active" : ""}`} onClick={() => selectCountry(ALL)}>
          All {group.label} <span className="count">{group.count}</span>
        </button>
        {group.countries.map((c) => (
          <button
            key={c.key}
            role="tab"
            aria-selected={activeCountry === c.key}
            className={`tab ${activeCountry === c.key ? "active" : ""} ${isAll && excluded.has(c.key) ? "excluded" : ""}`}
            onClick={() => selectCountry(c.key)}
          >
            <CountryBadge code={c.code} /> {c.name} <span className="count">{c.count}</span>
          </button>
        ))}
      </div>

      {isAll && (
        <section className="picker">
          <div className="picker-head">
            <span>
              <b>{includedCountries}</b> of {group.countries.length} countries included
              {regionExcluded.length > 0 && regionExcluded.length <= 6 && (
                <span className="muted"> · excluding {regionExcluded.map((c) => c.name).join(", ")}</span>
              )}
            </span>
            <button className="btn small-btn" onClick={() => setShowPicker((v) => !v)} aria-expanded={showPicker}>
              {showPicker ? "Done" : "Choose countries"}
            </button>
          </div>
          {showPicker && (
            <div className="picker-body">
              <div className="picker-actions">
                <button className="chip" onClick={() => setIncluded(group.countries.map((c) => c.key), true)}>
                  Select all
                </button>
                <button className="chip" onClick={() => setIncluded(group.countries.map((c) => c.key), false)}>
                  Select none
                </button>
              </div>
              {group.subgroups.map((sg) => {
                const allOn = sg.countries.every((c) => !excluded.has(c.key));
                return (
                  <fieldset key={sg.label} className="subgroup">
                    <legend>
                      <label>
                        <input type="checkbox" checked={allOn} onChange={() => setIncluded(sg.countries.map((c) => c.key), !allOn)} />{" "}
                        <b>{sg.label}</b> <span className="count">{sg.count}</span>
                      </label>
                      {group.subgroups.length > 1 && (
                        <button className="link-btn" onClick={() => onlySubregion(sg.label)}>
                          only
                        </button>
                      )}
                    </legend>
                    <div className="subgroup-list">
                      {sg.countries.map((c) => (
                        <label key={c.key} className={excluded.has(c.key) ? "off" : ""}>
                          <input type="checkbox" checked={!excluded.has(c.key)} onChange={() => setIncluded([c.key], excluded.has(c.key))} />
                          <CountryBadge code={c.code} /> {c.name} <span className="count">{c.count}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="toolbar">
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search name, skill, role, country, Telegram…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <div className="chips" aria-label="Require contact">
          <span className="muted small">Must have:</span>
          {FILTERABLE.map((c) => (
            <button
              key={c.key}
              className={`chip chip-${c.key} ${filters.has(c.key) ? "on" : ""}`}
              aria-pressed={filters.has(c.key)}
              onClick={() => toggleFilter(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
          <option value="site">Sort: site order</option>
          <option value="experience">Sort: most experience</option>
          <option value="contacts">Sort: most contact links</option>
        </select>
        <button className="btn primary" onClick={downloadView} disabled={!visible.length} title={viewLabel}>
          ⬇ Download this view
        </button>
      </section>

      <div className="view-title" ref={resultsRef}>
        <span>
          <b>{viewLabel}</b> <span className="muted">· {visible.length.toLocaleString()} engineers</span>
        </span>
        {copied.size > 0 && (
          <button className="link-btn" onClick={clearCopied}>
            Clear {copied.size} copied mark{copied.size === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Engineer</th>
              <th>Role &amp; skills</th>
              <th>Country &amp; exp.</th>
              <th>LinkedIn</th>
              <th>Telegram</th>
              <th>GitHub</th>
              <th>Website</th>
            </tr>
          </thead>
          <tbody key={viewKey}>
            {pageRows.map((r, i) => (
              <EngineerRow key={r.id} r={r} n={safePage * PAGE_SIZE + i} copied={copied.has(r.id)} onCopied={() => markCopied(r.id)} />
            ))}
            {!pageRows.length && (
              <tr>
                <td colSpan={8} className="empty">
                  No engineers match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="cards" key={`c-${viewKey}`}>
        {pageRows.map((r, i) => (
          <EngineerCard key={r.id} r={r} n={safePage * PAGE_SIZE + i} copied={copied.has(r.id)} onCopied={() => markCopied(r.id)} />
        ))}
        {!pageRows.length && <div className="notice">No engineers match these filters.</div>}
      </div>

      {pageCount > 1 && (
        <div className="pager">
          <button className="btn" disabled={safePage === 0} onClick={() => goToPage(safePage - 1)}>
            ‹ Prev
          </button>
          <span>
            Page {safePage + 1} / {pageCount}
          </span>
          <button className="btn" disabled={safePage >= pageCount - 1} onClick={() => goToPage(safePage + 1)}>
            Next ›
          </button>
        </div>
      )}

      {(removed.linkedin > 0 || removed.country > 0 || (removed.deadLinkedin ?? 0) > 0) && (
        <p className="footnote muted small">
          Hidden by settings in lib/config.ts: {removed.linkedin.toLocaleString()} without LinkedIn
          {(removed.deadLinkedin ?? 0) > 0 && <>, {(removed.deadLinkedin ?? 0).toLocaleString()} dead/404 LinkedIn</>}
          {removed.country > 0 && <>, {removed.country} in excluded countries</>}.
        </p>
      )}
    </main>
  );
}
