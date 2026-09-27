"""Discovery-to-Spec engine.

Loads the Claude Skill (SKILL.md + references), sends a discovery transcript to Claude,
and forces a structured JSON result through tool use so the dashboard and evals can rely on it.
"""
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
SKILL_DIR = ROOT / "skill" / "discovery-to-spec"
RUNS_DIR = ROOT / "data" / "runs"
MOCK_FILE = ROOT / "data" / "mock_output.json"

DEFAULT_MODEL = "claude-sonnet-5"

# ---------------------------------------------------------------- schema
_str = {"type": "string"}
_str_list = {"type": "array", "items": _str}

ANALYSIS_TOOL = {
    "name": "submit_analysis",
    "description": "Submit the structured discovery analysis.",
    "input_schema": {
        "type": "object",
        "required": ["account", "summary", "workflows", "gaps", "health", "brief", "skill_spec"],
        "properties": {
            "account": {
                "type": "object",
                "required": ["company", "industry", "size", "stakeholders"],
                "properties": {
                    "company": _str,
                    "industry": _str,
                    "size": _str,
                    "stakeholders": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["name", "role"],
                            "properties": {"name": _str, "role": _str, "stance": {
                                "type": "string", "enum": ["decision maker", "champion", "user", "skeptic", "influencer"]}},
                        },
                    },
                },
            },
            "summary": {"type": "string", "description": "Three sentences max."},
            "workflows": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["name", "current_state", "pain", "evidence"],
                    "properties": {"name": _str, "current_state": _str, "pain": _str,
                                   "tools": _str_list, "evidence": {"type": "string", "description": "Verbatim quote"}},
                },
            },
            "gaps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["title", "description", "category", "impact", "effort", "evidence"],
                    "properties": {
                        "title": _str,
                        "description": _str,
                        "category": {"type": "string", "enum": ["reporting", "content", "support", "operations",
                                                                "analytics", "data-quality", "enablement"]},
                        "impact": {"type": "integer", "minimum": 1, "maximum": 5},
                        "effort": {"type": "integer", "minimum": 1, "maximum": 5},
                        "ai_solvable": {"type": "boolean"},
                        "evidence": {"type": "string", "description": "Verbatim quote, 25 words max"},
                    },
                },
            },
            "health": {
                "type": "object",
                "required": ["score", "label", "drivers"],
                "properties": {"score": {"type": "integer", "minimum": 0, "maximum": 100},
                               "label": {"type": "string", "enum": ["strong", "stable", "at risk"]},
                               "drivers": _str_list},
            },
            "brief": {
                "type": "object",
                "required": ["problem", "goals", "users", "in_scope", "out_of_scope", "success_metrics",
                             "risks", "open_questions"],
                "properties": {"problem": _str, "goals": _str_list, "users": _str_list, "in_scope": _str_list,
                               "out_of_scope": _str_list, "success_metrics": _str_list, "risks": _str_list,
                               "open_questions": _str_list},
            },
            "skill_spec": {
                "type": "object",
                "required": ["name", "description", "solves_gap", "inputs", "steps", "outputs", "guardrails",
                             "integrations", "skill_md"],
                "properties": {"name": _str, "description": _str, "solves_gap": _str, "inputs": _str_list,
                               "steps": _str_list, "outputs": _str_list, "guardrails": _str_list,
                               "integrations": _str_list,
                               "skill_md": {"type": "string", "description": "Complete SKILL.md with YAML frontmatter"}},
            },
        },
    },
}


# ---------------------------------------------------------------- skill loading
def load_skill():
    """Return (system_prompt, version) built from SKILL.md and its reference files."""
    skill_md = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    m = re.search(r'version:\s*"?([\w.]+)"?', skill_md)
    version = m.group(1) if m else "0"
    body = re.sub(r"^---.*?---\s*", "", skill_md, flags=re.S)
    refs = ""
    for ref in sorted((SKILL_DIR / "references").glob("*.md")):
        refs += f"\n\n<reference file=\"references/{ref.name}\">\n{ref.read_text(encoding='utf-8')}\n</reference>"
    system = body + refs + "\n\nWhen done, call the submit_analysis tool exactly once."
    return system, version


# ---------------------------------------------------------------- helpers
def priority(gap):
    return int(gap.get("impact", 0)) * (6 - int(gap.get("effort", 5)))


def _finish(result, transcript, source, model, version, started, usage=None, mock=False):
    for g in result.get("gaps", []):
        g["priority"] = priority(g)
    result["gaps"] = sorted(result.get("gaps", []), key=lambda g: g["priority"], reverse=True)
    run = {
        "id": datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:4],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "model": model,
        "skill_version": version,
        "mock": mock,
        "duration_s": round(time.time() - started, 1),
        "usage": usage or {},
        "transcript": transcript,
        "result": result,
    }
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    (RUNS_DIR / f"{run['id']}.json").write_text(json.dumps(run, indent=2, ensure_ascii=False), encoding="utf-8")
    return run


def is_live():
    return bool(os.getenv("ANTHROPIC_API_KEY"))


# ---------------------------------------------------------------- main entry
def analyze(transcript, source="pasted", mock=None):
    """Analyze one transcript. Uses mock mode automatically when no API key is set."""
    system, version = load_skill()
    model = os.getenv("CLAUDE_MODEL", DEFAULT_MODEL)
    started = time.time()
    if mock is None:
        mock = not is_live()

    if mock:
        result = json.loads(MOCK_FILE.read_text(encoding="utf-8"))
        return _finish(result, transcript, source, "mock", version, started, mock=True)

    import anthropic  # imported here so mock mode works without the package configured

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=model,
        max_tokens=8000,
        system=system,
        tools=[ANALYSIS_TOOL],
        tool_choice={"type": "tool", "name": "submit_analysis"},
        messages=[{"role": "user", "content": f"<transcript>\n{transcript}\n</transcript>"}],
    )
    block = next(b for b in msg.content if b.type == "tool_use")
    usage = {"input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens}
    return _finish(block.input, transcript, source, model, version, started, usage=usage)


# ---------------------------------------------------------------- storage
def list_runs():
    runs = []
    for f in sorted(RUNS_DIR.glob("*.json"), reverse=True):
        r = json.loads(f.read_text(encoding="utf-8"))
        res = r["result"]
        top = res["gaps"][0] if res.get("gaps") else {}
        runs.append({
            "id": r["id"], "created_at": r["created_at"], "source": r["source"], "mock": r.get("mock", False),
            "company": res.get("account", {}).get("company", "Unknown"),
            "industry": res.get("account", {}).get("industry", ""),
            "health": res.get("health", {}), "gap_count": len(res.get("gaps", [])),
            "top_gap": top.get("title", ""), "skill_version": r.get("skill_version"),
        })
    return runs


def get_run(run_id):
    f = RUNS_DIR / f"{run_id}.json"
    if not f.exists() or "/" in run_id or "\\" in run_id:
        return None
    return json.loads(f.read_text(encoding="utf-8"))
