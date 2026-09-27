"""Post a finished brief to Slack through an Incoming Webhook."""
import os

import requests


def _bullets(items, limit=4):
    return "\n".join(f"• {i}" for i in items[:limit]) or "–"


def build_payload(run):
    r = run["result"]
    acc, brief, spec, health = r["account"], r["brief"], r["skill_spec"], r["health"]
    top = r["gaps"][:3]
    gaps_txt = "\n".join(f"*{g['title']}*  impact {g['impact']} / effort {g['effort']}" for g in top)
    return {
        "text": f"New discovery brief: {acc['company']}",
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": f"Discovery brief: {acc['company']}"}},
            {"type": "context", "elements": [{"type": "mrkdwn", "text":
                f"{acc['industry']} · {acc['size']} · health {health['score']}/100 ({health['label']})"}]},
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*Problem*\n{brief['problem']}"}},
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*Top opportunities*\n{gaps_txt}"}},
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*Success metrics*\n{_bullets(brief['success_metrics'])}"}},
            {"type": "section", "text": {"type": "mrkdwn", "text":
                f"*Proposed AI skill:* `{spec['name']}`\n{spec['description']}"}},
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*Open questions*\n{_bullets(brief['open_questions'], 3)}"}},
        ],
    }


def is_configured():
    return bool(os.getenv("SLACK_WEBHOOK_URL"))


def post_run(run):
    url = os.getenv("SLACK_WEBHOOK_URL")
    if not url:
        raise RuntimeError("SLACK_WEBHOOK_URL is not set in .env")
    resp = requests.post(url, json=build_payload(run), timeout=10)
    if resp.status_code != 200:
        raise RuntimeError(f"Slack returned {resp.status_code}: {resp.text}")
    return True
