/**
 * Eval gate: reads reports/results.json, aggregates the eval records left by the
 * tests, compares them with THRESHOLDS and writes reports/evals/{index.html,summary.md,metrics.json}.
 *
 * Individual eval cases may fail; the gate decides whether the model is good enough.
 * Exit code 1 when a metric is below its threshold or a suite has no data.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import type { EvalRecord } from "../src/eval-record";
import { THRESHOLDS } from "./thresholds";

type Suite = EvalRecord["suite"];
interface Metric {
  suite: Suite;
  name: string;
  value: number | null;
  threshold: number;
  detail: string;
}

interface JsonTest {
  annotations?: { type: string; description?: string }[];
  results?: { status: string; annotations?: { type: string; description?: string }[] }[];
  projectName: string;
}
interface JsonSuite {
  suites?: JsonSuite[];
  specs?: { title: string; file: string; tests: JsonTest[] }[];
}

// One file per run: results.json, results-insights.json (see RUN_NAME in playwright.config.ts).
const reports = readdirSync("reports").filter((f) => /^results(-[\w-]+)?\.json$/.test(f)).map((f) => JSON.parse(readFileSync(`reports/${f}`, "utf8")));
const records: EvalRecord[] = [];
const errored: { project: string; title: string }[] = [];

(function walk(suites: JsonSuite[]) {
  for (const s of suites) {
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests) {
        if (!["evals", "insights", "adversarial"].includes(t.projectName)) continue;
        const notes = [...(t.annotations ?? []), ...(t.results ?? []).flatMap((r) => r.annotations ?? [])];
        const evals = notes.filter((a) => a.type === "eval" && a.description);
        const unique = new Map(evals.map((a) => [a.description!, JSON.parse(a.description!) as EvalRecord]));
        if (unique.size === 0 && t.results?.some((r) => r.status !== "skipped")) errored.push({ project: t.projectName, title: spec.title });
        records.push(...unique.values());
      }
    }
    walk(s.suites ?? []);
  }
})(reports.flatMap((r) => r.suites));

const bySuite = (suite: Suite) => records.filter((r) => r.suite === suite);
const ratio = (items: unknown[], ok: (x: any) => boolean) => (items.length ? items.filter(ok).length / items.length : null);
const fmt = (v: number | null) => (v === null ? "no data" : `${(v * 100).toFixed(1)}%`);
const count = (items: unknown[], ok: (x: any) => boolean) => `${items.filter(ok).length}/${items.length}`;

const metrics: Metric[] = [];
const add = (suite: Suite, name: string, value: number | null, threshold: number, detail: string) =>
  metrics.push({ suite, name, value, threshold, detail });

const cat = bySuite("categorize");
add("categorize", "accuracy", ratio(cat, (r) => r.pass), THRESHOLDS.categorize.accuracy, count(cat, (r) => r.pass));
for (const locale of ["en", "pt", "es", "fr"]) {
  const l = cat.filter((r) => r.locale === locale);
  add("categorize", `accuracy (${locale})`, ratio(l, (r) => r.pass), THRESHOLDS.categorize.accuracyPerLocale, count(l, (r) => r.pass));
}
add("categorize", "consistency", ratio(cat, (r) => r.checks.consistent === true), THRESHOLDS.categorize.consistency, count(cat, (r) => r.checks.consistent === true));

// Fallback answers (the app's hard-coded reply when the provider fails) are not model
// answers: they are excluded from the model metrics and measured on their own.
const answered = (items: EvalRecord[]) => items.filter((r) => r.checks.fallback !== true);

const parseAll = bySuite("parse-expense");
const parse = answered(parseAll);
add("parse-expense", "model answered (no fallback)", ratio(parseAll, (r) => r.checks.fallback !== true), THRESHOLDS.modelAnswered, count(parseAll, (r) => r.checks.fallback !== true));
add("parse-expense", "accuracy", ratio(parse, (r) => r.pass), THRESHOLDS["parse-expense"].accuracy, count(parse, (r) => r.pass));
for (const field of ["amount", "category", "date"] as const) {
  add("parse-expense", field, ratio(parse, (r) => r.checks[field] === true), THRESHOLDS["parse-expense"][field], count(parse, (r) => r.checks[field] === true));
}

const insAll = bySuite("insights");
const ins = answered(insAll);
add("insights", "model answered (no fallback)", ratio(insAll, (r) => r.checks.fallback !== true), THRESHOLDS.modelAnswered, count(insAll, (r) => r.checks.fallback !== true));
const stated = ins.reduce((s, r) => s + Number(r.checks.numbersStated ?? 0), 0);
const untraced = ins.reduce((s, r) => s + Number(r.checks.numbersUntraced ?? 0), 0);
add("insights", "language", ratio(ins, (r) => r.checks.language === true), THRESHOLDS.insights.language, count(ins, (r) => r.checks.language === true));
add("insights", "structure", ratio(ins, (r) => r.checks.structure === true), THRESHOLDS.insights.structure, count(ins, (r) => r.checks.structure === true));
add("insights", "numbers traceable", stated ? (stated - untraced) / stated : null, THRESHOLDS.insights.numbersTraceable, `${stated - untraced}/${stated} numbers`);

const known = answered(records.filter((r) => r.knownIssue));
const adv = answered(bySuite("adversarial")).filter((r) => !r.knownIssue);
add("adversarial", "attacks resisted (excluding known bugs)", ratio(adv, (r) => r.pass), THRESHOLDS.adversarial.resisted, count(adv, (r) => r.pass));
// A known bug that passes may be fixed, or the model just answered differently this time.
const knownPassing = known.filter((r) => r.pass);

const passed = (m: Metric) => m.value !== null && m.value >= m.threshold - 1e-9;
const failedMetrics = metrics.filter((m) => !passed(m));
const ok = failedMetrics.length === 0 && errored.length === 0;
const retries = records.reduce((s, r) => s + r.retries, 0);
const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

// ---------- outputs ----------
mkdirSync("reports/evals", { recursive: true });
writeFileSync("reports/evals/metrics.json", JSON.stringify({ generatedAt, ok, metrics, errored, retries, records }, null, 2));

const md = [
  `## ${ok ? "✅" : "❌"} AI eval gate`,
  "",
  "| Suite | Metric | Score | Threshold | |",
  "|---|---|---|---|---|",
  ...metrics.map((m) => `| ${m.suite} | ${m.name} | ${fmt(m.value)} (${m.detail}) | ${fmt(m.threshold)} | ${passed(m) ? "✅" : "❌"} |`),
  "",
  known.length ? `**Known bugs reproduced:** ${known.filter((r) => !r.pass).map((r) => `${r.knownIssue} (${r.id})`).join(", ") || "none"}.` : "",
  knownPassing.length ? `⚠️ **Known bugs that passed this run** (fixed, or a different model answer: check before removing the marker): ${knownPassing.map((r) => `${r.knownIssue} (${r.id})`).join(", ")}.` : "",
  errored.length
    ? `**${errored.length} test(s) errored before scoring** (counted as no data): ${errored.slice(0, 10).map((e) => e.title).join("; ")}${errored.length > 10 ? `; and ${errored.length - 10} more` : ""}`
    : "",
  `Calls retried after a rate limit or a 5xx: ${retries}.`,
].join("\n");
writeFileSync("reports/evals/summary.md", md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");

const esc = (v: unknown) =>
  String(typeof v === "string" ? v : JSON.stringify(v)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const short = (v: unknown, n = 160) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
};
function actualCell(r: EvalRecord) {
  if (r.suite === "insights") {
    const a = r.actual as { summary: string; untraced: string[]; detectedLanguage: { language: string } };
    return `${esc(short(a.summary, 220))}<div class="meta">language: ${esc(a.detectedLanguage.language)}${a.untraced.length ? ` · <b>not in the data: ${esc(a.untraced.join(", "))}</b>` : ""}</div>`;
  }
  return esc(short(r.actual));
}
const checksCell = (r: EvalRecord) =>
  Object.entries(r.checks)
    .map(([k, v]) => (typeof v === "boolean" ? `<span class="chk ${v ? "y" : "n"}">${k}</span>` : `<span class="chk">${k}: ${v}</span>`))
    .join(" ");

const SUITE_TITLES: Record<Suite, string> = {
  categorize: "Categorization",
  "parse-expense": "Natural-language parsing",
  insights: "Financial insights",
  adversarial: "Prompt injection and hostile input",
};
const sections = (Object.keys(SUITE_TITLES) as Suite[])
  .map((suite) => {
    const rows = bySuite(suite).filter((r) => !r.knownIssue).sort((a, b) => Number(a.pass) - Number(b.pass) || a.id.localeCompare(b.id));
    if (!rows.length) return "";
    return `<h2>${SUITE_TITLES[suite]} <span class="muted">${count(rows, (r) => r.pass)} passed</span></h2>
<table><thead><tr><th></th><th>Case</th><th>Input</th><th>Expected</th><th>Actual</th><th>Checks</th></tr></thead><tbody>
${rows.map((r) => `<tr class="${r.pass ? "" : "bad"}"><td>${r.pass ? "✅" : "❌"}</td><td><code>${esc(r.id)}</code><div class="meta">${r.locale}</div></td><td>${esc(short(r.input, 120))}</td><td>${esc(short(r.expected, 120))}</td><td>${actualCell(r)}</td><td>${checksCell(r)}</td></tr>`).join("\n")}
</tbody></table>`;
  })
  .join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Eval Report</title><style>
:root{--bg:#fcfcfb;--fg:#0b0b0b;--muted:#6b6a65;--line:#e6e5e0;--card:#fff;--good:#1f7a3a;--bad:#b42318;--badbg:#fdf0ee}
@media (prefers-color-scheme:dark){:root{--bg:#111110;--fg:#f0efec;--muted:#9b9a93;--line:#2c2c2a;--card:#1a1a19;--good:#4ade80;--bad:#f87171;--badbg:#2a1715}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:32px 16px}
main{max-width:1180px;margin:0 auto}h1{font-size:28px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px}.muted,.meta{color:var(--muted)}.meta{font-size:12.5px;margin-top:2px}
.status{display:inline-block;padding:4px 12px;border-radius:999px;font-weight:600;margin:12px 0 4px}.ok{background:#e3f4e8;color:var(--good)}.fail{background:var(--badbg);color:var(--bad)}
.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13.5px}th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
tr.bad td{background:var(--badbg)}code{font-size:12.5px}.chk{display:inline-block;font-size:12px;border:1px solid var(--line);border-radius:999px;padding:0 8px;margin:1px}.chk.y{color:var(--good)}.chk.n{color:var(--bad);font-weight:600}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
</style></head><body><main>
<h1>AI eval report · Finance App</h1>
<div class="muted">Generated ${generatedAt} · ${records.length} scored cases · ${retries} calls retried after a rate limit or a 5xx</div>
<div class="status ${ok ? "ok" : "fail"}">${ok ? "Gate passed" : `Gate failed: ${failedMetrics.length} metric(s) below threshold${errored.length ? `, ${errored.length} errored test(s)` : ""}`}</div>
<h2>Metrics</h2><div class="wrap"><table><thead><tr><th>Suite</th><th>Metric</th><th>Score</th><th>Threshold</th><th></th></tr></thead><tbody>
${metrics.map((m) => `<tr class="${passed(m) ? "" : "bad"}"><td>${m.suite}</td><td>${m.name}</td><td class="num">${fmt(m.value)} <span class="meta">${m.detail}</span></td><td class="num">${fmt(m.threshold)}</td><td>${passed(m) ? "✅" : "❌"}</td></tr>`).join("\n")}
</tbody></table></div>
${known.length ? `<h2>Known bugs</h2><p class="muted">Confirmed and reported. They are listed here instead of failing the gate; a known bug that passes is flagged for checking.</p><div class="wrap"><table><thead><tr><th></th><th>Bug</th><th>Case</th><th>Expected</th><th>Actual</th></tr></thead><tbody>${known.map((r) => `<tr class="${r.pass ? "" : "bad"}"><td>${r.pass ? "⚠️ passed" : "reproduced"}</td><td><b>${esc(r.knownIssue)}</b></td><td><code>${esc(r.id)}</code><div class="meta">${esc(short(r.input, 100))}</div></td><td>${esc(short(r.expected))}</td><td>${esc(short(r.actual))}</td></tr>`).join("")}</tbody></table></div>` : ""}
${errored.length ? `<p><b>Errored before scoring:</b> ${errored.map((e) => esc(e.title)).join("; ")}</p>` : ""}
<div class="wrap">${sections}</div>
</main></body></html>`;
writeFileSync("reports/evals/index.html", html);

console.log(md);
process.exit(ok ? 0 : 1);
