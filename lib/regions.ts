import type { CountryInfo, Engineer, RegionId } from "./types";

/** Display order: the Americas first, then the rest of the world. */
export const REGIONS: { id: RegionId; label: string }[] = [
  { id: "americas", label: "Americas" },
  { id: "europe", label: "Europe" },
  { id: "asia", label: "Asia & Middle East" },
  { id: "africa", label: "Africa" },
  { id: "oceania", label: "Oceania" },
  { id: "other", label: "Remote / Unknown" },
];

/** Subregions in display order; the region of a country is derived from these lists. */
export const SUBREGIONS: Record<Exclude<RegionId, "other">, { label: string; codes: string }[]> = {
  americas: [
    { label: "North America", codes: "US CA MX GL BM PM" },
    {
      label: "Central America & Caribbean",
      codes: "GT BZ SV HN NI CR PA CU JM HT DO PR BS BB TT AG DM GD KN LC VC AW CW SX BQ KY TC VG VI AI MS GP MQ BL MF",
    },
    { label: "South America", codes: "BR AR CO PE VE CL EC BO PY UY GY SR GF FK" },
  ],
  europe: [
    { label: "Western Europe", codes: "AT BE FR DE LI LU MC NL CH" },
    { label: "Northern Europe", codes: "DK EE FI IS IE LV LT NO SE GB IM JE GG FO AX SJ" },
    { label: "Southern Europe", codes: "AL AD BA HR CY GR IT XK MT ME MK PT SM RS SI ES VA GI" },
    { label: "Eastern Europe", codes: "BY BG CZ HU MD PL RO RU SK UA EU" },
  ],
  asia: [
    { label: "East Asia", codes: "CN HK MO JP KP KR MN TW" },
    { label: "Southeast Asia", codes: "BN KH ID LA MY MM PH SG TH TL VN" },
    { label: "South Asia", codes: "AF BD BT IN IR MV NP PK LK IO" },
    { label: "Central Asia", codes: "KZ KG TJ TM UZ" },
    { label: "West Asia / Middle East", codes: "AM AZ BH GE IQ IL JO KW LB OM PS QA SA SY TR AE YE" },
  ],
  africa: [
    { label: "North Africa", codes: "DZ EG LY MA SD TN EH" },
    { label: "West Africa", codes: "BJ BF CV CI GM GH GN GW LR ML MR NE NG SN SL TG SH" },
    { label: "East Africa", codes: "BI KM DJ ER ET KE MG MW MU YT MZ RE RW SC SO SS TZ UG ZM ZW" },
    { label: "Central Africa", codes: "AO CM CF TD CG CD GQ GA ST" },
    { label: "Southern Africa", codes: "BW SZ LS NA ZA" },
  ],
  oceania: [{ label: "Oceania", codes: "AU NZ FJ PG SB VU NC PF WS TO KI FM MH NR PW TV GU AS MP CK NU NF PN TK WF" }],
};

const CODE_TO_REGION = new Map<string, RegionId>();
const CODE_TO_SUBREGION = new Map<string, string>();
for (const [region, subs] of Object.entries(SUBREGIONS)) {
  for (const sub of subs) {
    for (const code of sub.codes.split(/\s+/).filter(Boolean)) {
      CODE_TO_REGION.set(code, region as RegionId);
      CODE_TO_SUBREGION.set(code, sub.label);
    }
  }
}

export function regionOf(code: string | null): RegionId {
  return (code && CODE_TO_REGION.get(code)) || "other";
}

/** Subregion label, e.g. "Southeast Asia"; "Remote / Unknown" for countries outside the map. */
export function subregionOf(code: string | null): string {
  return (code && CODE_TO_SUBREGION.get(code)) || "Remote / Unknown";
}

/** Subregion labels of a region in display order. */
export function subregionOrder(region: RegionId): string[] {
  return region === "other" ? ["Remote / Unknown"] : [...SUBREGIONS[region].map((s) => s.label), "Remote / Unknown"];
}

export const REGION_ORDER: Record<RegionId, number> = Object.fromEntries(REGIONS.map((r, i) => [r.id, i])) as Record<
  RegionId,
  number
>;

let displayNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    displayNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Where the engineer is based: residency first, then nationality, then the listing-card flag. */
export function countryOf(e: Engineer): CountryInfo {
  const code = e.residencyCode || e.nationalityCode || e.cardFlagCode || null;
  if (code) {
    const name =
      (code === e.residencyCode && e.residencyName) ||
      (code === e.nationalityCode && e.nationalityName) ||
      countryName(code);
    return { key: code, code, name };
  }
  const label = e.residencyName || e.nationalityName || "";
  if (/remote|anywhere|world/i.test(label)) return { key: "REMOTE", code: null, name: "Remote" };
  return { key: "UNKNOWN", code: null, name: "Unknown" };
}
