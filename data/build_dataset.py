#!/usr/bin/env python3
"""
Merge public datasets (HH-RLHF, RealToxicityPrompts, HateXplain, HatEval) into the
EnforcementRow schema used by the Policy‑Aware Refusal Dashboard.

Schema (CSV/JSON rows):
  id, ts, policy_category, confidence, decision, rationale,
  slice, language, latencyMs, costCents, user_response, appeal_outcome

Design choices
- Content comes directly from public datasets. No synthetic prompts are generated.
- Ops fields (confidence/decision/latency/cost/appeal) are derived deterministically
  from dataset labels/scores and simple heuristics so demos exercise KPIs without RNG.
- Reproducible via a fixed seed and functional mappings (no randomness by default).

"""

from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import math
import os
import re
from typing import Dict, Iterable, List, Tuple

import pandas as pd
from datasets import load_dataset, Dataset, concatenate_datasets

# -----------------------------
# Schema helpers
# -----------------------------
POL_CATS = {
    "NONVIOLENT_WRONGDOING",
    "HATE_SPEECH",
    "SELF_HARM",
    "SEXUAL_CONTENT",
    "VIOLENT_HARM",
}
Decision = Tuple[str, float]  # (decision, confidence)

ISO_BASE = dt.datetime(2025, 8, 10, tzinfo=dt.timezone.utc)  # base time for deterministic ts


def det_ts(i: int, window_days: int = 7) -> str:
    """Deterministic timestamp within the last `window_days` from ISO_BASE.
    We use a simple hash-based offset so runs are reproducible across machines.
    """
    h = int(hashlib.sha1(f"row{i}".encode()).hexdigest(), 16)
    offset_days = (h % (window_days * 24 * 60)) / (24 * 60)  # minutes → days float
    ts = ISO_BASE - dt.timedelta(days=offset_days)
    return ts.isoformat().replace("+00:00", "Z")


def est_latency_ms(text: str) -> int:
    # simple token-ish estimate → deterministic
    toks = max(1, len(text.split()))
    return int(120 + 3.5 * min(300, toks))


def est_cost_cents(text: str) -> int:
    toks = max(1, len(text.split()))
    # assume $3 / 1M tokens → 0.0003 per token → in cents = 0.03 per 100 tokens
    return int(math.ceil(0.03 * toks))


# -----------------------------
# Banding & decision rules (mirrors dashboard)
# -----------------------------
class Banding:
    def __init__(self, high: float = 0.85, medium: float = 0.60):
        self.high = high
        self.medium = medium

    def decide(self, conf: float) -> str:
        if conf >= self.high:
            return "block"
        if conf >= self.medium:
            return "suggest"
        return "allow"


# -----------------------------
# Dataset loaders & mappers
# -----------------------------

def map_hatexplain(max_rows: int, bands: Banding) -> List[dict]:
    """Load HateXplain (EN). Uses majority label to set category and confidence.
    labels: hatespeech(0), normal(1), offensive(2)
    """
    try:
        ds_train = load_dataset("Hate-speech-CNERG/hatexplain", split="train")
        ds_val = load_dataset("Hate-speech-CNERG/hatexplain", split="validation")
        ds_test = load_dataset("Hate-speech-CNERG/hatexplain", split="test")
    except Exception:
        # Some mirrors only provide a single default split
        ds_train = load_dataset("Hate-speech-CNERG/hatexplain", split="train")
        ds_val = None
        ds_test = None

    parts = [d for d in [ds_train, ds_val, ds_test] if d is not None]
    ds = concatenate_datasets(parts)
    rows: List[dict] = []
    for i, ex in enumerate(ds):
        if i >= max_rows:
            break
        # reconstruct text
        tokens = ex.get("post_tokens") or []
        text = " ".join(tokens) if tokens else ex.get("text") or ""
        anns = ex.get("annotators", [])
        # majority vote label
        label_counts = {0: 0, 1: 0, 2: 0}
        for a in anns:
            lab = a.get("label")
            if lab in label_counts:
                label_counts[lab] += 1
        maj = max(label_counts, key=label_counts.get)
        if maj == 1:
            base_conf = 0.15
            decision = bands.decide(base_conf)
            cat = "HATE_SPEECH"  # normal content still exercises pipeline
            rationale = "hatexplain: normal"
        elif maj == 2:
            base_conf = 0.70
            decision = bands.decide(base_conf)
            cat = "HATE_SPEECH"
            rationale = "hatexplain: offensive (borderline)"
        else:  # 0 hatespeech
            base_conf = 0.92
            decision = bands.decide(base_conf)
            cat = "HATE_SPEECH"
            rationale = "hatexplain: hatespeech"

        rid = f"hx_{i+1}"
        rows.append(
            {
                "id": rid,
                "ts": det_ts(i + 1000),
                "policy_category": cat,
                "confidence": round(base_conf, 3),
                "decision": decision,
                "rationale": rationale,
                "slice": "EN",
                "language": "en",
                "latencyMs": est_latency_ms(text),
                "costCents": est_cost_cents(text),
                # appeals: deterministic based on potential FP
                "user_response": "dispute" if decision == "block" and maj != 0 else "none",
                "appeal_outcome": "overturned" if decision == "block" and maj == 1 else ("upheld" if decision == "block" else "none"),
            }
        )
    return rows


def map_hateval(max_rows: int, bands: Banding, use_fallback: bool = False) -> List[dict]:
    """Load HatEval (ES & EN). If gated, optionally fallback to an open Spanish superset.
    We map label (HS vs non-HS) to HATE_SPEECH category and derive ops.
    """
    rows: List[dict] = []
    def _emit(text: str, is_hs: bool, lang: str, idx: int):
        conf = 0.9 if is_hs else 0.2
        decision = bands.decide(conf)
        rid = f"he_{idx}"
        rows.append(
            {
                "id": rid,
                "ts": det_ts(idx + 3000),
                "policy_category": "HATE_SPEECH",
                "confidence": round(conf, 3),
                "decision": decision,
                "rationale": "hateval: HS" if is_hs else "hateval: non-HS",
                "slice": lang.upper(),
                "language": lang,
                "latencyMs": est_latency_ms(text),
                "costCents": est_cost_cents(text),
                "user_response": "dispute" if decision == "block" and not is_hs else "none",
                "appeal_outcome": "overturned" if decision == "block" and not is_hs else ("upheld" if decision == "block" else "none"),
            }
        )

    if not use_fallback:
        try:
            ds = load_dataset("valeriobasile/HatEval")
            # Common fields: 'text', 'HS' (1/0), sometimes language via subset name; we default to EN/ES by split name
            for split in ["train", "test"]:
                if split not in ds:
                    continue
                for i, ex in enumerate(ds[split]):
                    if len(rows) >= max_rows:
                        return rows
                    text = ex.get("text") or ex.get("tweet") or ""
                    label = ex.get("HS")
                    if label is None:
                        label = ex.get("hs")
                    is_hs = bool(int(label)) if label is not None else True
                    # infer lang from available field or default to es for this dataset portion
                    lang = ex.get("lang") or ("es")
                    _emit(text, is_hs, lang, len(rows) + 1)
            return rows
        except Exception:
            # fall through to fallback
            pass

    # Fallback: Spanish hate-speech superset filtered to hatEval entries
    sup = load_dataset("manueltonneau/spanish-hate-speech-superset", split="train")
    for i, ex in enumerate(sup):
        if len(rows) >= max_rows:
            break
        if (ex.get("dataset") or "").lower() != "hateval":
            continue
        text = ex.get("text") or ""
        is_hs = bool(int(ex.get("HS") or ex.get("hs") or 1))
        _emit(text, is_hs, "es", len(rows) + 1)
    return rows


# Keyword lexicons for HH mapping (very small, demo only)
KW = {
    "VIOLENT_HARM": [
        r"\b(kill|stab|shoot|bomb|poison|assault|harm)\b",
        r"\b(make|build)\s+(a\s+)?(bomb|weapon)\b",
    ],
    "SELF_HARM": [r"\b(kill\s+myself|suicide|self[- ]?harm|cutting)\b"],
    "SEXUAL_CONTENT": [r"\b(sex|porn|nude|explicit|adult)\b"],
    "NONVIOLENT_WRONGDOING": [
        r"\b(steal|shoplift|tax\s+evasion|scam|fraud|counterfeit|hack|ddos|phishing)\b",
    ],
}


def classify_hh(text: str) -> str:
    t = text.lower()
    for cat, pats in KW.items():
        for p in pats:
            if re.search(p, t):
                return cat
    # default bucket so it still flows through the pipeline
    return "NONVIOLENT_WRONGDOING"


def map_hh(max_rows: int, bands: Banding) -> List[dict]:
    """Load Anthropic HH-RLHF harmless data (prompts mention harmful behavior).
    We parse 'chosen'/'rejected' strings, extract the Human prompt line, classify via KW.
    """
    ds = load_dataset("Anthropic/hh-rlhf", data_dir="harmless-base", split="train")
    rows: List[dict] = []
    for i, ex in enumerate(ds):
        if i >= max_rows:
            break
        pair = ex.get("chosen") or ""
        # extract last 'Human:' utterance
        human_lines = [m.group(1).strip() for m in re.finditer(r"Human:\s*(.*)", pair)]
        text = human_lines[-1] if human_lines else pair[:280]
        cat = classify_hh(text)
        # derive confidence from category specificity (crude): more specific → higher conf
        base_conf = {
            "VIOLENT_HARM": 0.93,
            "SELF_HARM": 0.92,
            "SEXUAL_CONTENT": 0.88,
            "NONVIOLENT_WRONGDOING": 0.82,
        }[cat]
        decision = bands.decide(base_conf)
        rid = f"hh_{i+1}"
        rows.append(
            {
                "id": rid,
                "ts": det_ts(i + 2000),
                "policy_category": cat,
                "confidence": round(base_conf, 3),
                "decision": decision,
                "rationale": f"hh-rlhf: prompt matches {cat}",
                "slice": "EN",
                "language": "en",
                "latencyMs": est_latency_ms(text),
                "costCents": est_cost_cents(text),
                "user_response": "none",
                "appeal_outcome": "none",
            }
        )
    return rows


def map_realtox(max_rows: int, bands: Banding) -> List[dict]:
    """Load RealToxicityPrompts (EN). Use provided toxicity/attributes to set category & confidence.
    Dataset has a 'prompt' dict with keys like text, toxicity, identity_attack, threat, sexually_explicit, etc.
    """
    ds = load_dataset("allenai/real-toxicity-prompts", split="train")
    rows: List[dict] = []
    def get_metric(d: dict, key: str, default: float = 0.0) -> float:
        v = d.get(key)
        try:
            return float(v)
        except Exception:
            return default

    for i, ex in enumerate(ds):
        if i >= max_rows:
            break
        p = ex.get("prompt") or {}
        # some viewers show prompt as nested dict; ensure we grab text
        text = p.get("text") if isinstance(p, dict) else None
        if text is None:
            # in rare cases, field may be top-level 'text'
            text = ex.get("text") or ""
            scores = ex
        else:
            scores = p

        tox = max(0.0, min(1.0, get_metric(scores, "toxicity", 0.0)))
        ident = get_metric(scores, "identity_attack", 0.0)
        threat = get_metric(scores, "threat", 0.0)
        sex = get_metric(scores, "sexually_explicit", 0.0)

        # categorize by dominant attribute
        if ident >= 0.5:
            cat = "HATE_SPEECH"
            conf = max(tox, ident)
            rationale = "rtp: identity attack"
        elif threat >= 0.5:
            cat = "VIOLENT_HARM"
            conf = max(tox, threat)
            rationale = "rtp: threat"
        elif sex >= 0.85:
            cat = "SEXUAL_CONTENT"
            conf = max(tox, sex)
            rationale = "rtp: sexual explicit"
        else:
            # treat as allowed/benign content to populate 'allow' rows
            cat = "NONVIOLENT_WRONGDOING"
            conf = tox * 0.5  # low confidence → often allow
            rationale = "rtp: benign/low-tox"

        decision = bands.decide(conf)
        rid = f"rtp_{i+1}"
        rows.append(
            {
                "id": rid,
                "ts": det_ts(i + 4000),
                "policy_category": cat,
                "confidence": round(conf, 3),
                "decision": decision,
                "rationale": rationale,
                "slice": "EN",
                "language": "en",
                "latencyMs": est_latency_ms(text),
                "costCents": est_cost_cents(text),
                # If we block but overall toxicity is modest, simulate user dispute/overturn
                "user_response": "dispute" if decision == "block" and tox < 0.6 else "none",
                "appeal_outcome": "overturned" if decision == "block" and tox < 0.6 else ("upheld" if decision == "block" else "none"),
            }
        )
    return rows


# -----------------------------
# Main
# -----------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="Output CSV file path")
    ap.add_argument("--max-hx", type=int, default=2000)
    ap.add_argument("--max-he", type=int, default=2000)
    ap.add_argument("--max-hh", type=int, default=2000)
    ap.add_argument("--max-rtp", type=int, default=2000)
    ap.add_argument("--he-fallback", action="store_true", help="Use Spanish superset fallback for HatEval if gated")
    ap.add_argument("--bands-high", type=float, default=0.85)
    ap.add_argument("--bands-medium", type=float, default=0.60)
    args = ap.parse_args()

    bands = Banding(high=args.bands_high, medium=args.bands_medium)

    print("Loading HateXplain…")
    hx = map_hatexplain(args.max_hx, bands)
    print(f"  HateXplain: {len(hx)} rows")

    print("Loading HatEval…")
    he = map_hateval(args.max_he, bands, use_fallback=args.he_fallback)
    print(f"  HatEval: {len(he)} rows")

    print("Loading HH-RLHF (harmless-base)…")
    hh = map_hh(args.max_hh, bands)
    print(f"  HH: {len(hh)} rows")

    print("Loading RealToxicityPrompts…")
    rtp = map_realtox(args.max_rtp, bands)
    print(f"  RealToxicity: {len(rtp)} rows")

    all_rows = hx + he + hh + rtp
    df = pd.DataFrame(all_rows, columns=[
        "id","ts","policy_category","confidence","decision","rationale",
        "slice","language","latencyMs","costCents","user_response","appeal_outcome"
    ])

    # Enforce types/ranges
    df["confidence"] = df["confidence"].clip(0, 1)
    df["latencyMs"] = df["latencyMs"].astype(int)
    df["costCents"] = df["costCents"].astype(int)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"Wrote {len(df)} rows → {args.out}")


if __name__ == "__main__":
    main()
