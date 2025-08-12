

# Model Evals & Policy-Aware Dashboard

This folder standardizes how we run, store, and demo **policy-aware moderation evals** (quality, fairness, latency, cost) and how we feed them into the **Next.js dashboard**.

## TL;DR

* Put eval outputs (CSV/JSON) in `model-evals/data/`.
* Put dashboard presets (gate thresholds, NSMs, bands) in `public/configs/`.
* Run the dashboard: `npm run dev` → upload a CSV/JSON or load a preset via `?config=<url>`.
* For private demos, use the `DEMO_PASSCODE` middleware.

---

## Repo Layout (relevant)

```
/src/app/                 # Next.js app
/model-evals/
  data/                   # eval outputs (CSV/JSON) per run
  notebooks/              # optional analysis
  README.md               # this file
/public/configs/          # JSON presets for dashboard
/public/data/             # optional: host sample evals for quick sharing
```

---

## Data Schemas

### EnforcementRow (CSV or JSON array)

Each row = one enforcement decision the system made during eval.

| field             | type          | notes                                                                                       |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `id`              | string/number | unique per row                                                                              |
| `ts`              | ISO datetime  | e.g., `2025-08-10T09:50:00Z`                                                                |
| `policy_category` | string        | e.g., `NONVIOLENT_WRONGDOING`, `HATE_SPEECH`, `SELF_HARM`, `VIOLENT_HARM`, `SEXUAL_CONTENT` |
| `confidence`      | number (0..1) | model confidence                                                                            |
| `decision`        | enum          | `block` \| `suggest` \| `allow`                                                             |
| `rationale`       | string        | short human-readable reason                                                                 |
| `slice`           | string        | group for disparity (e.g., `EN`, `ES`, `FR` or cohort)                                      |
| `language`        | string        | e.g., `en`, `es`, `fr`                                                                      |
| `latencyMs`       | number        | end-to-end decision latency                                                                 |
| `costCents`       | integer       | per-decision cost in cents                                                                  |
| `user_response`   | enum          | `accept` \| `clarify` \| `dispute` \| `none`                                                |
| `appeal_outcome`  | enum          | `upheld` \| `overturned` \| `none`                                                          |

**CSV header example:**

```csv
id,ts,policy_category,confidence,decision,rationale,slice,language,latencyMs,costCents,user_response,appeal_outcome
1,2025-08-10T09:50:00Z,HATE_SPEECH,0.76,block,dehumanizing content,ES,es,260,90,dispute,overturned
```

### DashboardConfig (JSON preset)

Stored in `public/configs/*.json` (or hosted elsewhere, e.g., Firebase Hosting).

```json
{
  "nsm": { "blockRateMax": 0.45, "worstSliceGapMax": 0.10 },
  "gates": {
    "A": { "blockRateMin": 0.30, "latencyP95Max": 500, "worstSliceGapMax": 0.10 },
    "B": { "overRefusalMax": 0.08, "appealsUpheldMin": 0.60 },
    "C": { "avgCostMax": 1.00, "minVolume": 12 }
  },
  "bands": { "high": 0.85, "medium": 0.60 },
  "sliceDim": "language",
  "presetName": "balanced"
}
```

---

## How to Add a New Eval Run

1. Export your run to **CSV or JSON** using the schema above.
2. Save it as `model-evals/data/<run-id>.{csv|json}` (e.g., `2025-08-11_baseline.csv`).
3. Start the dashboard:

```bash
npm run dev
# open http://localhost:3000
```

4. Click **Data → upload** your file. The KPIs/charts update live.
5. (Optional) Commit the file:

```bash
git add model-evals/data/2025-08-11_baseline.csv
git commit -m "eval: baseline 2025-08-11"
```

---

## Presets via URL (for meetings)

1. Put presets in `public/configs/strict.json` (or host on Firebase Hosting).
2. Load the dashboard with:

```
http://localhost:3000/?config=/configs/strict.json
# or your hosted URL:
https://<your-site>.web.app/?config=https://<your-site>.web.app/configs/strict.json
```

---

## Private Demo (passcode)

Set an env var in Vercel: `DEMO_PASSCODE=<secret>`.
Middleware requires `?pass=<secret>` once; it sets a cookie and unlocks.

* File: `src/middleware.ts` (already provided in instructions).
* Vercel: Project → Settings → Environment Variables → redeploy.

---

## KPI Definitions (as implemented in the demo)

* **Block rate** = blocks / total decisions.
* **Over-refusal (proxy)** = overturned appeals / total decisions.

  * *Use your true over-refusal metric if you have a better signal.*
* **Appeals upheld** = upheld / appealed.
* **P95 latency** = 95th percentile of `latencyMs`.
* **Avg cost** = mean `costCents` / 100 (USD).
* **Worst-slice gap** = max(block-rate by slice) − min(block-rate by slice).

> Tip: Keep the **proxy** label until you wire real appeal pipelines.

---

## Release Gates & Bands

* **Gates (A/B/C)** are pass/fail checks using the config thresholds above.
* **Automation bands**:

  * High: `conf ≥ bands.high` → auto-block (or auto-apply)
  * Medium: `bands.medium ≤ conf < bands.high` → suggest + rationale
  * Low: `conf < bands.medium` → allow + shadow check

Tune **bands** carefully and re-check disparity before promotion.

---

## Bias & Fairness Workflow

1. Maintain a **diverse eval set**: clear violations, ambiguous, benign lookalikes.
2. Track **worst-slice** metrics and **appeal outcomes by slice**.
3. Adjust **thresholds** and **disambiguation prompts**, not policy scope.
4. Gate changes with **A/B** + **parity** checks; avoid increasing disparity.

---

## Local Dev & Deploy

**Local**

```bash
npm install
npm run dev
```

**Vercel (recommended)**

```bash
# push to GitHub, then import on vercel.com, or:
npx vercel
npx vercel deploy --prod
```

**Firebase Hosting for presets (optional)**

```bash
npx firebase-tools login
npx firebase-tools init hosting
# add presets to public/configs/
npx firebase-tools deploy --only hosting
```

---

## Troubleshooting

* **Styles not showing**:

  * `tailwind.config.js` `content` points to `./src/app/**/*.{ts,tsx}` and `./src/components/**/*.{ts,tsx}`
  * `src/app/layout.tsx` imports `./globals.css`
  * Restart `npm run dev`

* **`@/components/ui/...` not found**: run shadcn adds again:

```bash
npx shadcn@latest add card button badge input label select slider tooltip sheet
```

* **Vercel CLI EACCES**: use `npx vercel` (don’t install globally).

* **TS red squiggles on `plugins`**: keep `"plugins": [{ "name": "next" }]`, then restart TS server in VS Code.

---

## Versioning & Reproducibility

* Name runs with date + tag: `YYYY-MM-DD_<tag>` (e.g., `2025-08-11_baseline`).
* Commit both **data** and **config** used in the demo.
* Consider pinning Node & Next versions (e.g., `.nvmrc`, `engines` in `package.json`).

---

## Privacy & Security

* Use synthetic or properly anonymized data in demos.
* Avoid storing PII; if required, document retention and DPIA steps.
* Keep `DEMO_PASSCODE` in env vars (never commit secrets).

---

## Glossary

* **Over-refusal**: benign content incorrectly blocked.
* **Slice**: cohort/group used for disparity analysis.
* **NSM**: North-Star Metric(s) for this system (e.g., worst-slice gap ≤ X).

---


