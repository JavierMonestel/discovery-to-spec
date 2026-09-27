"""Run the Discovery-to-Spec skill against the sample transcripts and score the output.

Usage:
    python evals/run_evals.py          # live, uses your ANTHROPIC_API_KEY
    python evals/run_evals.py --mock   # offline check of the eval pipeline itself

Checks are deterministic (no extra model calls), so a full run costs only the 5 analyses.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
import engine  # noqa: E402

HERE = ROOT / "evals"
CASES = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))


def norm(s):
    s = s.lower().replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def check(run, case):
    r, t = run["result"], norm(run["transcript"])
    gaps = r.get("gaps", [])
    gaps_text = " ".join((g["title"] + " " + g["description"]).lower() for g in gaps)
    quotes = [g.get("evidence", "") for g in gaps] + [w.get("evidence", "") for w in r.get("workflows", [])]
    grounded = [q for q in quotes if q and norm(q) in t]
    skill_md = r.get("skill_spec", {}).get("skill_md", "")
    fm = re.match(r"^---\s*\n(.*?)\n---", skill_md, re.S)
    name_m = re.search(r"^name:\s*(\S+)", fm.group(1), re.M) if fm else None
    desc_m = re.search(r"^description:\s*(.+)", fm.group(1), re.M) if fm else None
    top = (gaps[0]["title"] + " " + gaps[0]["description"]).lower() if gaps else ""

    results = {
        "schema_complete": all(r.get(k) for k in ["account", "summary", "workflows", "gaps", "health", "brief", "skill_spec"]),
        "account_identified": case["account"].lower() in r.get("account", {}).get("company", "").lower(),
        "evidence_grounded": bool(quotes) and len(grounded) == len(quotes),
        "gap_count_3_to_7": 3 <= len(gaps) <= 7,
        "covers_key_topics": all(k in gaps_text for k in case["must_mention"]),
        "top_priority_matches_customer": any(k in top for k in case["top_priority_keywords"]),
        "skill_md_valid": bool(name_m and desc_m and re.fullmatch(r"[a-z0-9-]{1,64}", name_m.group(1))
                               and len(desc_m.group(1)) <= 1024),
    }
    detail = {
        "grounded_quotes": f"{len(grounded)}/{len(quotes)}",
        "ungrounded": [q for q in quotes if q and q not in grounded],
        "missing_topics": [k for k in case["must_mention"] if k not in gaps_text],
        "top_gap": gaps[0]["title"] if gaps else None,
    }
    return results, detail


def main():
    mock = "--mock" in sys.argv
    _, version = engine.load_skill()
    cases_out, passed, total = [], 0, 0
    print(f"\nSkill v{version} | {'MOCK' if mock else 'LIVE'}\n")
    for fname, case in CASES.items():
        transcript = (HERE / "transcripts" / fname).read_text(encoding="utf-8")
        run = engine.analyze(transcript, source=f"eval:{fname}", mock=True if mock else None)
        res, detail = check(run, case)
        p = sum(res.values())
        passed += p
        total += len(res)
        cases_out.append({"case": fname, "run_id": run["id"], "passed": p, "total": len(res),
                          "checks": res, "detail": detail})
        marks = " ".join("ok" if v else "--" for v in res.values())
        print(f"  {fname:<28} {p}/{len(res)}   {marks}")

    out = {
        "id": datetime.now().strftime("%Y%m%d-%H%M%S"),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "skill_version": version,
        "model": "mock" if mock else run["model"],
        "mock": mock,
        "score": round(passed / total, 3),
        "passed": passed,
        "total": total,
        "cases": cases_out,
    }
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results" / f"{out['id']}.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\n  Overall: {passed}/{total} checks passed ({out['score']:.0%})")
    print("  Checks: " + ", ".join(res.keys()) + "\n")


if __name__ == "__main__":
    main()
