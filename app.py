"""Local web app for Discovery-to-Spec. Run: python app.py, then open http://localhost:5050"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory

load_dotenv()

import engine  # noqa: E402  (after load_dotenv so the API key is visible)
import slack  # noqa: E402

ROOT = Path(__file__).parent
SAMPLES = ROOT / "evals" / "transcripts"
EVAL_RESULTS = ROOT / "evals" / "results"

app = Flask(__name__, static_folder="static")


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/status")
def status():
    _, version = engine.load_skill()
    return jsonify({
        "live": engine.is_live(),
        "model": os.getenv("CLAUDE_MODEL", engine.DEFAULT_MODEL) if engine.is_live() else "mock",
        "skill_version": version,
        "slack": slack.is_configured(),
    })


@app.get("/api/samples")
def samples():
    return jsonify([f.name for f in sorted(SAMPLES.glob("*.txt"))])


@app.get("/api/samples/<name>")
def sample(name):
    f = SAMPLES / name
    if f.parent != SAMPLES or not f.exists():
        return jsonify({"error": "not found"}), 404
    return jsonify({"name": name, "text": f.read_text(encoding="utf-8")})


@app.get("/api/runs")
def runs():
    return jsonify(engine.list_runs())


@app.get("/api/runs/<run_id>")
def run(run_id):
    r = engine.get_run(run_id)
    return (jsonify(r), 200) if r else (jsonify({"error": "not found"}), 404)


@app.post("/api/analyze")
def analyze():
    body = request.get_json(force=True)
    text = (body.get("transcript") or "").strip()
    if len(text) < 200:
        return jsonify({"error": "Paste a full transcript or detailed notes (at least a few paragraphs)."}), 400
    try:
        r = engine.analyze(text, source=body.get("source") or "pasted")
    except Exception as e:  # surface API errors in the UI instead of a blank failure
        return jsonify({"error": str(e)}), 500
    return jsonify(r)


@app.post("/api/runs/<run_id>/slack")
def to_slack(run_id):
    r = engine.get_run(run_id)
    if not r:
        return jsonify({"error": "not found"}), 404
    try:
        slack.post_run(r)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"ok": True})


@app.get("/api/runs/<run_id>/skill.md")
def skill_md(run_id):
    r = engine.get_run(run_id)
    if not r:
        return "not found", 404
    spec = r["result"]["skill_spec"]
    return Response(spec["skill_md"], mimetype="text/markdown",
                    headers={"Content-Disposition": f"attachment; filename={spec['name']}-SKILL.md"})


@app.get("/api/evals")
def evals():
    out = []
    for f in sorted(EVAL_RESULTS.glob("*.json")):
        out.append(json.loads(f.read_text(encoding="utf-8")))
    return jsonify(out)


if __name__ == "__main__":
    mode = "LIVE (Claude API)" if engine.is_live() else "MOCK (no ANTHROPIC_API_KEY found)"
    print(f"\n  Discovery-to-Spec running in {mode} mode")
    print("  Open http://localhost:5050\n")
    app.run(port=5050, debug=False)
