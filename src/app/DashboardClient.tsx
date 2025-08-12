//removed info from licide-react import list
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";

import {
  ShieldBan,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Timer,
  DollarSign,
  Filter as FilterIcon,
  ArrowUpRight,
  Search,
  Settings2,
  Upload,
} from "lucide-react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* =========================
   Types
   ========================= */
export type EnforcementRow = {
  id: number | string;
  ts: string; // ISO time
  policy_category: string;
  confidence: number; // 0..1
  decision: "block" | "suggest" | "allow";
  rationale: string;
  slice: string; // grouping for disparity checks (e.g., language, region)
  language: string; // e.g., en, es, fr
  latencyMs: number;
  costCents: number;
  user_response: "accept" | "clarify" | "dispute" | "none";
  appeal_outcome: "upheld" | "overturned" | "none";
};

export type DashboardConfig = {
  nsm: { blockRateMax: number; worstSliceGapMax: number };
  gates: {
    A: { blockRateMin: number; latencyP95Max: number; worstSliceGapMax: number };
    B: { overRefusalMax: number; appealsUpheldMin: number };
    C: { avgCostMax: number; minVolume: number };
  };
  bands: { high: number; medium: number }; // thresholds for automation bands
  sliceDim: "language" | "slice";
  presetName?: string;
};

export type Filters = {
  start: string;
  end: string;
  category: string; // "all" or specific
  band: "all" | "block" | "suggest" | "allow";
  language: string; // "all" or iso code
  confidence: [number, number];
};

/* =========================
   Sample data (replace via upload/API)
   ========================= */
const SAMPLE: EnforcementRow[] = [
  { id: 1, ts: "2025-08-07T15:10:00Z", policy_category: "NONVIOLENT_WRONGDOING", confidence: 0.97, decision: "block", rationale: "arson & insurance fraud request", slice: "EN", language: "en", latencyMs: 180, costCents: 90, user_response: "none", appeal_outcome: "none" },
  { id: 2, ts: "2025-08-07T16:22:00Z", policy_category: "HATE_SPEECH", confidence: 0.82, decision: "block", rationale: "protected class slur", slice: "EN", language: "en", latencyMs: 220, costCents: 80, user_response: "dispute", appeal_outcome: "upheld" },
  { id: 3, ts: "2025-08-07T17:30:00Z", policy_category: "HATE_SPEECH", confidence: 0.6, decision: "suggest", rationale: "borderline sarcasm — suggest rewrite", slice: "ES", language: "es", latencyMs: 260, costCents: 70, user_response: "accept", appeal_outcome: "none" },
  { id: 4, ts: "2025-08-08T09:05:00Z", policy_category: "SELF_HARM", confidence: 0.88, decision: "suggest", rationale: "self-harm ideation — provide resources", slice: "EN", language: "en", latencyMs: 240, costCents: 120, user_response: "clarify", appeal_outcome: "none" },
  { id: 5, ts: "2025-08-08T10:40:00Z", policy_category: "NONVIOLENT_WRONGDOING", confidence: 0.55, decision: "allow", rationale: "benign insurance Q", slice: "ES", language: "es", latencyMs: 150, costCents: 50, user_response: "none", appeal_outcome: "none" },
  { id: 6, ts: "2025-08-08T14:20:00Z", policy_category: "SEXUAL_CONTENT", confidence: 0.78, decision: "block", rationale: "age-unclear explicit request", slice: "FR", language: "fr", latencyMs: 270, costCents: 80, user_response: "dispute", appeal_outcome: "overturned" },
  { id: 7, ts: "2025-08-09T11:02:00Z", policy_category: "VIOLENT_HARM", confidence: 0.9, decision: "block", rationale: "how to harm another person", slice: "EN", language: "en", latencyMs: 210, costCents: 90, user_response: "none", appeal_outcome: "upheld" },
  { id: 8, ts: "2025-08-09T13:37:00Z", policy_category: "HATE_SPEECH", confidence: 0.51, decision: "allow", rationale: "quoted news article for critique", slice: "ES", language: "es", latencyMs: 140, costCents: 40, user_response: "none", appeal_outcome: "none" },
  { id: 9, ts: "2025-08-09T15:55:00Z", policy_category: "NONVIOLENT_WRONGDOING", confidence: 0.72, decision: "suggest", rationale: "requests loopholes → suggest lawful path", slice: "FR", language: "fr", latencyMs: 230, costCents: 70, user_response: "accept", appeal_outcome: "none" },
  { id: 10, ts: "2025-08-10T08:22:00Z", policy_category: "SELF_HARM", confidence: 0.94, decision: "block", rationale: "instructions for self-harm", slice: "EN", language: "en", latencyMs: 280, costCents: 100, user_response: "dispute", appeal_outcome: "upheld" },
  { id: 11, ts: "2025-08-10T09:50:00Z", policy_category: "HATE_SPEECH", confidence: 0.76, decision: "block", rationale: "dehumanizing content", slice: "ES", language: "es", latencyMs: 260, costCents: 90, user_response: "dispute", appeal_outcome: "overturned" },
  { id: 12, ts: "2025-08-10T12:15:00Z", policy_category: "NONVIOLENT_WRONGDOING", confidence: 0.65, decision: "suggest", rationale: "tax evasion tip—redirect to legal resources", slice: "EN", language: "en", latencyMs: 200, costCents: 60, user_response: "accept", appeal_outcome: "none" },
];

const DEFAULT_CONFIG: DashboardConfig = {
  nsm: { blockRateMax: 0.45, worstSliceGapMax: 0.10 },
  gates: {
    A: { blockRateMin: 0.30, latencyP95Max: 500, worstSliceGapMax: 0.10 },
    B: { overRefusalMax: 0.08, appealsUpheldMin: 0.60 },
    C: { avgCostMax: 1.0, minVolume: 12 },
  },
  bands: { high: 0.85, medium: 0.60 },
  sliceDim: "language",
  presetName: "balanced",
};

/* =========================
   Helpers
   ========================= */
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function dateOnly(iso: string) {
  return iso.slice(0, 10);
}

function filterRows(records: EnforcementRow[], filters: Filters) {
  return records.filter((r) => {
    const d = new Date(r.ts);
    const passStart = filters.start ? d >= new Date(filters.start) : true;
    const passEnd = filters.end ? d <= new Date(filters.end) : true;
    const passCat = filters.category === "all" || r.policy_category === filters.category;
    const passBand =
      filters.band === "all" ||
      (filters.band === "block" && r.decision === "block") ||
      (filters.band === "suggest" && r.decision === "suggest") ||
      (filters.band === "allow" && r.decision === "allow");
    const passLang = filters.language === "all" || r.language === filters.language;
    const passConf = r.confidence >= filters.confidence[0] && r.confidence <= filters.confidence[1];
    return passStart && passEnd && passCat && passBand && passLang && passConf;
  });
}

function p95(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(0.95 * (sorted.length - 1));
  return sorted[idx];
}

function aggregateKpis(rows: EnforcementRow[]) {
  const total = rows.length || 1;
  const blocks = rows.filter((r) => r.decision === "block").length;
  const suggests = rows.filter((r) => r.decision === "suggest").length;
  const allows = rows.filter((r) => r.decision === "allow").length;

  const appeals = rows.filter((r) => r.appeal_outcome !== "none");
  const overturned = rows.filter((r) => r.appeal_outcome === "overturned");
  const upheld = rows.filter((r) => r.appeal_outcome === "upheld");

  const blockRate = blocks / total;
  const overRefusalRate = overturned.length / total; // proxy
  const appealsUpheldRate = appeals.length ? upheld.length / appeals.length : 0;
  const p95Latency = p95(rows.map((r) => r.latencyMs));
  const avgCost = rows.length ? rows.reduce((a, r) => a + r.costCents, 0) / rows.length / 100 : 0;

  const bySlice: Record<string, { total: number; blocks: number }> = {};
  rows.forEach((r) => {
    const key = r.slice || r.language;
    if (!bySlice[key]) bySlice[key] = { total: 0, blocks: 0 };
    bySlice[key].total += 1;
    bySlice[key].blocks += r.decision === "block" ? 1 : 0;
  });
  const sliceRates = Object.values(bySlice).map((s) => (s.total ? s.blocks / s.total : 0));
  const worstDisparity = sliceRates.length ? Math.max(...sliceRates) - Math.min(...sliceRates) : 0;

  return {
    total,
    blocks,
    suggests,
    allows,
    blockRate,
    overRefusalRate,
    appealsUpheldRate,
    p95Latency,
    avgCost,
    worstDisparity,
  };
}

function timeSeries(rows: EnforcementRow[]) {
  const map: Record<string, { date: string; block: number; suggest: number; allow: number }> = {};
  rows.forEach((r) => {
    const d = dateOnly(r.ts);
    if (!map[d]) map[d] = { date: d, block: 0, suggest: 0, allow: 0 };
    if (r.decision === "block") map[d].block += 1;
    else if (r.decision === "suggest") map[d].suggest += 1;
    else map[d].allow += 1;
  });
  return Object.values(map).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function byCategory(rows: EnforcementRow[]) {
  const map: Record<string, { category: string; count: number }> = {};
  rows.forEach((r) => {
    if (!map[r.policy_category]) map[r.policy_category] = { category: r.policy_category, count: 0 };
    map[r.policy_category].count += 1;
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
}

function decisionBands(rows: EnforcementRow[]) {
  const map: Record<"block" | "suggest" | "allow", number> = { block: 0, suggest: 0, allow: 0 };
  rows.forEach((r) => {
    map[r.decision] += 1;
  });
  return [
    { name: "Block", value: map.block },
    { name: "Suggest", value: map.suggest },
    { name: "Allow", value: map.allow },
  ];
}

function disparityBars(rows: EnforcementRow[]) {
  const slices = Array.from(new Set(rows.map((r) => r.slice)));
  const map: Record<string, { slice: string; blockRate: number }> = {};
  slices.forEach((s) => {
    const subset = rows.filter((r) => r.slice === s);
    const total = subset.length || 1;
    const blocks = subset.filter((r) => r.decision === "block").length;
    map[s] = { slice: s, blockRate: total ? blocks / total : 0 };
  });
  return Object.values(map);
}

const COLORS = ["#82ca9d", "#8884d8", "#ffc658", "#ff7f50", "#8dd1e1", "#a4de6c"];

/* =========================
   Page
   ========================= */
export default function DashboardClient() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>({
    start: "2025-08-07",
    end: "2025-08-11",
    category: "all",
    band: "all",
    language: "all",
    confidence: [0.5, 1.0],
  });
  const [rows, setRows] = useState<EnforcementRow[]>(SAMPLE);
  const [cfg, setCfg] = useState<DashboardConfig>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("policy_dash_config");
      if (saved) return JSON.parse(saved) as DashboardConfig;
    }
    return DEFAULT_CONFIG;
  });

  // Optional: load preset config via URL (?config=https://...json)
  useEffect(() => {
    const url = params.get("config");
    if (!url) return;
    (async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const j = (await res.json()) as DashboardConfig;
          setCfg(j);
          localStorage.setItem("policy_dash_config", JSON.stringify(j));
        }
      } catch {
        // ignore
      }
    })();
  }, [params]);

  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const kpis = useMemo(() => aggregateKpis(filtered), [filtered]);
  const series = useMemo(() => timeSeries(filtered), [filtered]);
  const cats = useMemo(() => byCategory(filtered), [filtered]);
  const bands = useMemo(() => decisionBands(filtered), [filtered]);
  const disparity = useMemo(() => disparityBars(filtered), [filtered]);

  const gates = useMemo(() => {
    const A =
      kpis.blockRate >= cfg.gates.A.blockRateMin &&
      kpis.worstDisparity <= cfg.gates.A.worstSliceGapMax &&
      kpis.p95Latency <= cfg.gates.A.latencyP95Max;
    const B =
      kpis.overRefusalRate <= cfg.gates.B.overRefusalMax &&
      kpis.appealsUpheldRate >= cfg.gates.B.appealsUpheldMin;
    const C = kpis.avgCost <= cfg.gates.C.avgCostMax && kpis.total >= cfg.gates.C.minVolume;
    return { A, B, C };
  }, [kpis, cfg]);

  function handleResetFilters() {
    setFilters({
      start: "2025-08-07",
      end: "2025-08-11",
      category: "all",
      band: "all",
      language: "all",
      confidence: [0.5, 1.0],
    });
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);

        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text) as EnforcementRow[];
          setRows(parsed);
          return;
        }

        // CSV parse (expects headers matching EnforcementRow keys)
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (!lines.length) return;

        const headers = lines[0].split(",").map((h) => h.trim());
        const idx = (h: keyof EnforcementRow) => headers.indexOf(h as string);

        const data: EnforcementRow[] = lines.slice(1).map((line, i) => {
          const cells = line.split(",");
          const rec: EnforcementRow = {
            id: cells[idx("id")] ?? String(i + 1),
            ts: cells[idx("ts")],
            policy_category: cells[idx("policy_category")],
            confidence: parseFloat(cells[idx("confidence")]),
            decision: cells[idx("decision")] as EnforcementRow["decision"],
            rationale: cells[idx("rationale")],
            slice: cells[idx("slice")],
            language: cells[idx("language")],
            latencyMs: parseInt(cells[idx("latencyMs")], 10) || 0,
            costCents: parseInt(cells[idx("costCents")], 10) || 0,
            user_response: (cells[idx("user_response")] || "none") as EnforcementRow["user_response"],
            appeal_outcome: (cells[idx("appeal_outcome")] || "none") as EnforcementRow["appeal_outcome"],
          };
          return rec;
        });
        setRows(data);
      } catch (err) {
        console.error("Upload parse error", err);
      }
    };
    reader.readAsText(file);
  }

  function exportCsv() {
    const headers: (keyof EnforcementRow)[] = [
      "id",
      "ts",
      "policy_category",
      "confidence",
      "decision",
      "rationale",
      "slice",
      "language",
      "latencyMs",
      "costCents",
      "user_response",
      "appeal_outcome",
    ];
    const body = filtered
      .map((r) => headers.map((h) => String(r[h] ?? "")).join(","))
      .join("\n");
    const csv = headers.join(",") + "\n" + body;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enforcement_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DiCorner • Policy-Aware Refusal Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Tweak NSMs, release gates, and automation bands in real-time. Upload CSV/JSON or point to a config URL for quick meeting demos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" className="rounded-2xl">
                <Settings2 className="h-4 w-4 mr-2" />
                Config
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[420px] sm:w-[520px]">
              <SheetHeader>
                <SheetTitle>Dashboard Config</SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-6 text-sm">
                <section className="space-y-2">
                  <h3 className="font-medium">North-Star Targets</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Block rate ≤</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={cfg.nsm.blockRateMax}
                        onChange={(e) => setCfg({ ...cfg, nsm: { ...cfg.nsm, blockRateMax: Number(e.target.value) } })}
                      />
                    </div>
                    <div>
                      <Label>Worst-slice gap ≤</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={cfg.nsm.worstSliceGapMax}
                        onChange={(e) => setCfg({ ...cfg, nsm: { ...cfg.nsm, worstSliceGapMax: Number(e.target.value) } })}
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="font-medium">Release Gates</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>Gate A • Block ≥</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={cfg.gates.A.blockRateMin}
                          onChange={(e) =>
                            setCfg({ ...cfg, gates: { ...cfg.gates, A: { ...cfg.gates.A, blockRateMin: Number(e.target.value) } } })
                          }
                        />
                      </div>
                      <div>
                        <Label>Gate A • P95 ≤ (ms)</Label>
                        <Input
                          type="number"
                          value={cfg.gates.A.latencyP95Max}
                          onChange={(e) =>
                            setCfg({ ...cfg, gates: { ...cfg.gates, A: { ...cfg.gates.A, latencyP95Max: Number(e.target.value) } } })
                          }
                        />
                      </div>
                      <div>
                        <Label>Gate A • Gap ≤</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={cfg.gates.A.worstSliceGapMax}
                          onChange={(e) =>
                            setCfg({ ...cfg, gates: { ...cfg.gates, A: { ...cfg.gates.A, worstSliceGapMax: Number(e.target.value) } } })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Gate B • Over-refusal ≤</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={cfg.gates.B.overRefusalMax}
                          onChange={(e) =>
                          setCfg({ ...cfg, gates: { ...cfg.gates, B: { ...cfg.gates.B, overRefusalMax: Number(e.target.value) } } })
                          }
                        />
                      </div>
                      <div>
                        <Label>Gate B • Appeals upheld ≥</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={cfg.gates.B.appealsUpheldMin}
                          onChange={(e) =>
                          setCfg({ ...cfg, gates: { ...cfg.gates, B: { ...cfg.gates.B, appealsUpheldMin: Number(e.target.value) } } })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Gate C • Avg cost ≤ ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={cfg.gates.C.avgCostMax}
                          onChange={(e) =>
                            setCfg({ ...cfg, gates: { ...cfg.gates, C: { ...cfg.gates.C, avgCostMax: Number(e.target.value) } } })
                          }
                        />
                      </div>
                      <div>
                        <Label>Gate C • Min volume ≥</Label>
                        <Input
                          type="number"
                          value={cfg.gates.C.minVolume}
                          onChange={(e) =>
                            setCfg({ ...cfg, gates: { ...cfg.gates, C: { ...cfg.gates.C, minVolume: Number(e.target.value) } } })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="font-medium">Automation Bands</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>High (auto-block) ≥</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={cfg.bands.high}
                        onChange={(e) => setCfg({ ...cfg, bands: { ...cfg.bands, high: Number(e.target.value) } })}
                      />
                    </div>
                    <div>
                      <Label>Medium (suggest) ≥</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={cfg.bands.medium}
                        onChange={(e) => setCfg({ ...cfg, bands: { ...cfg.bands, medium: Number(e.target.value) } })}
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="font-medium">Slices</h3>
                  <Select value={cfg.sliceDim} onValueChange={(v: "language" | "slice") => setCfg({ ...cfg, sliceDim: v })}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="language">Language</SelectItem>
                      <SelectItem value="slice">Custom slice</SelectItem>
                    </SelectContent>
                  </Select>
                </section>

                <SheetFooter className="pt-2">
                  <Button
                    onClick={() => {
                      localStorage.setItem("policy_dash_config", JSON.stringify(cfg));
                    }}
                    className="rounded-2xl"
                  >
                    Save to browser
                  </Button>
                  <SheetClose asChild>
                    <Button variant="outline" className="rounded-2xl">
                      Close
                    </Button>
                  </SheetClose>
                </SheetFooter>
              </div>
            </SheetContent>
          </Sheet>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="file" accept=".csv,.json" className="hidden" onChange={handleUpload} />
            <Button variant="secondary" className="rounded-2xl">
              <Upload className="h-4 w-4 mr-2" />
              Data
            </Button>
          </label>
        </div>
      </header>

      {/* Filters */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label>Date start</Label>
            <Input type="date" value={filters.start} onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Date end</Label>
            <Input type="date" value={filters.end} onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Policy category</Label>
            <Select value={filters.category} onValueChange={(v: string) => setFilters((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="NONVIOLENT_WRONGDOING">Non-violent wrongdoing</SelectItem>
                <SelectItem value="HATE_SPEECH">Hate speech</SelectItem>
                <SelectItem value="SELF_HARM">Self-harm</SelectItem>
                <SelectItem value="VIOLENT_HARM">Violent harm</SelectItem>
                <SelectItem value="SEXUAL_CONTENT">Sexual content</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Decision band</Label>
            <Select value={filters.band} onValueChange={(v: Filters["band"]) => setFilters((f) => ({ ...f, band: v }))}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="block">Block</SelectItem>
                <SelectItem value="suggest">Suggest</SelectItem>
                <SelectItem value="allow">Allow</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={filters.language} onValueChange={(v: string) => setFilters((f) => ({ ...f, language: v }))}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-5">
            <Label>Confidence range</Label>
            <div className="flex items-center gap-4">
              <Slider
                defaultValue={[filters.confidence[0] * 100, filters.confidence[1] * 100]}
                min={0}
                max={100}
                step={1}
                onValueChange={([min, max]: number[]) =>
                  setFilters((f) => ({ ...f, confidence: [min / 100, max / 100] }))
                }
              />
              <span className="text-sm text-muted-foreground w-28">
                {filters.confidence[0].toFixed(2)}–{filters.confidence[1].toFixed(2)}
              </span>
            </div>
          </div>
          <div className="md:col-span-5 flex items-center gap-2">
            <Button className="rounded-2xl" onClick={handleResetFilters}>
              <FilterIcon className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button className="rounded-2xl" variant="outline" onClick={exportCsv}>
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon={<ShieldBan className="h-5 w-5" />} title="Block rate" value={formatPct(kpis.blockRate)} hint="Blocks / total" />
        <KpiCard icon={<AlertTriangle className="h-5 w-5" />} title="Over-refusal" value={formatPct(kpis.overRefusalRate)} hint="Overturned / total (proxy)" />
        <KpiCard icon={<Scale className="h-5 w-5" />} title="Appeals upheld" value={formatPct(kpis.appealsUpheldRate)} hint="Upheld / appealed" />
        <KpiCard icon={<Timer className="h-5 w-5" />} title="P95 latency" value={`${kpis.p95Latency} ms`} hint="Decision time" />
        <KpiCard icon={<DollarSign className="h-5 w-5" />} title="Avg cost" value={`$${kpis.avgCost.toFixed(2)}`} hint="Per decision" />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} title="Worst-slice gap" value={formatPct(kpis.worstDisparity)} hint="Max block-rate disparity" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Decision trends</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals tickFormatter={(v) => `${v}`} />
                <RTooltip />
                <Legend />
                <Line type="monotone" dataKey="block" />
                <Line type="monotone" dataKey="suggest" />
                <Line type="monotone" dataKey="allow" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By policy category</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cats} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <RTooltip />
                <Bar dataKey="count" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Decision bands</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={bands} dataKey="value" nameKey="name" outerRadius={80} label>
                  {bands.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Fairness / Disparity */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Slice disparity (block-rate by slice)</CardTitle>
            <Badge variant={kpis.worstDisparity <= cfg.nsm.worstSliceGapMax ? "default" : "destructive"} className="rounded-xl">
              Gap: {formatPct(kpis.worstDisparity)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={disparity} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="slice" />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <RTooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
              <Bar dataKey="blockRate" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gates & Bands */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Release Gates</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <GateBadge label="Gate A" pass={gates.A} tip="Quality + Latency" />
            <GateBadge label="Gate B" pass={gates.B} tip="Appeals + Over-refusal" />
            <GateBadge label="Gate C" pass={gates.C} tip="Cost + Volume" />
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Automation Bands (current)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>
              <strong>High risk</strong>: conf ≥ {cfg.bands.high.toFixed(2)} → <Badge className="rounded-xl">block</Badge>
            </div>
            <div>
              <strong>Medium</strong>: {cfg.bands.medium.toFixed(2)} ≤ conf &lt; {cfg.bands.high.toFixed(2)} →{" "}
              <Badge className="rounded-xl" variant="secondary">
                suggest
              </Badge>
            </div>
            <div>
              <strong>Low</strong>: conf &lt; {cfg.bands.medium.toFixed(2)} →{" "}
              <Badge className="rounded-xl" variant="outline">
                allow + shadow
              </Badge>
            </div>
            <p className="text-muted-foreground">Tune thresholds, then watch over-refusal and disparity before promotion.</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Policy Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Refusals must include: policy category, rationale, lawful alternatives, and an appeal/clarify path.</p>
            <p>Learning is allowed via threshold tuning and disambiguation prompts — not by loosening disallowed content.</p>
          </CardContent>
        </Card>
      </div>

      {/* Records Table */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2 flex items-center justify-between">
          <CardTitle className="text-base">Recent enforcement records ({filtered.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="rounded-xl">
              <Search className="h-4 w-4 mr-2" />
              Query
            </Button>
            <Button size="sm" className="rounded-xl" onClick={exportCsv}>
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Decision</th>
                <th className="py-2 pr-4">Conf</th>
                <th className="py-2 pr-4">Slice</th>
                <th className="py-2 pr-4">Lang</th>
                <th className="py-2 pr-4">Latency</th>
                <th className="py-2 pr-4">Cost</th>
                <th className="py-2 pr-4">Rationale</th>
                <th className="py-2 pr-4">Appeal</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-none">
                  <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
                  <td className="py-2 pr-4">{r.policy_category}</td>
                  <td className="py-2 pr-4">
                    <Badge
                      className="rounded-xl"
                      variant={r.decision === "block" ? "destructive" : r.decision === "suggest" ? "secondary" : "outline"}
                    >
                      {r.decision}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">{r.confidence.toFixed(2)}</td>
                  <td className="py-2 pr-4">{r.slice}</td>
                  <td className="py-2 pr-4 uppercase">{r.language}</td>
                  <td className="py-2 pr-4">{r.latencyMs} ms</td>
                  <td className="py-2 pr-4">${(r.costCents / 100).toFixed(2)}</td>
                  <td className="py-2 pr-4 max-w-[380px] truncate" title={r.rationale}>
                    {r.rationale}
                  </td>
                  <td className="py-2 pr-4 capitalize">{r.appeal_outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <footer className="text-xs text-muted-foreground">
        * Demo data. Over-refusal measured as overturned/total here for illustration; adapt to your appeals model. Config persists to browser. Optional preset via
        <code> ?config=https://…/config.json</code>.
      </footer>
    </div>
  );
}

/* =========================
   Small UI helpers
   ========================= */
function KpiCard({
  icon,
  title,
  value,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className="text-xl font-semibold mt-1">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </div>
          <div className="p-2 rounded-xl shadow-inner">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function GateBadge({ label, pass, tip }: { label: string; pass: boolean; tip?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium ${
              pass ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
            }`}
          >
            <span>{label}</span>
            {pass ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </div>
        </TooltipTrigger>
        {tip && <TooltipContent>{tip}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}
