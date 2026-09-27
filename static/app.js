const $ = (s, el = document) => el.querySelector(s);
const main = $("#main");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const list = (arr) => `<ul>${(arr || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
const api = async (url, opts) => {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
};
let STATUS = {};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

const healthColor = (label) => ({ strong: "var(--good)", stable: "var(--warn)", "at risk": "var(--bad)" }[label] || "var(--ink-3)");
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/* ------------------------------------------------------------ rail */
async function loadRail(activeId) {
  STATUS = await api("/api/status");
  $("#status").innerHTML = `
    <div><span class="dot" style="background:${STATUS.live ? "var(--good)" : "var(--warn)"}"></span><b>${STATUS.live ? "Live" : "Mock mode"}</b> · ${esc(STATUS.model)}</div>
    <div>Skill <span class="mono">discovery-to-spec</span> v${esc(STATUS.skill_version)}</div>
    <div>Slack ${STATUS.slack ? "connected" : "not connected"}</div>`;
  const runs = (await api("/api/runs")).filter((r) => !r.source.startsWith("eval:") || true);
  const seen = new Set();
  const latest = runs.filter((r) => (seen.has(r.company) ? false : seen.add(r.company)));
  $("#accounts").innerHTML = latest.length
    ? latest.map((r) => `
      <li><a href="#/run/${r.id}" class="${r.id === activeId ? "on" : ""}">
        <span class="co">${esc(r.company)}</span>
        <span class="hs" style="color:${healthColor(r.health.label)}" title="Account health ${r.health.score}/100">${r.health.score ?? ""}</span>
        <span class="ind">${esc(r.industry)}${r.mock ? " · mock" : ""}</span>
      </a></li>`).join("")
    : `<li class="empty">No analyses yet.</li>`;
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", location.hash === `#/${a.dataset.nav}`));
  return latest;
}

/* ------------------------------------------------------------ matrix */
function matrix(gaps) {
  const W = 440, H = 300, pad = { l: 34, r: 12, t: 12, b: 34 };
  const x = (e) => pad.l + ((e - 0.5) / 5) * (W - pad.l - pad.r);
  const y = (i) => pad.t + ((5.5 - i) / 5) * (H - pad.t - pad.b);
  const midX = x(3), midY = y(3);
  const placed = {};
  const pts = gaps.map((g, i) => {
    const k = `${g.effort}-${g.impact}`;
    const n = (placed[k] = (placed[k] || 0) + 1) - 1;
    return { g, i, cx: x(g.effort) + n * 17, cy: y(g.impact) };
  });
  const grid = [1, 2, 3, 4, 5].map((v) => `
      <line x1="${x(v)}" x2="${x(v)}" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--rule)" stroke-width="1"/>
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/>
      <text x="${x(v)}" y="${H - pad.b + 16}" text-anchor="middle" font-size="11" fill="var(--ink-3)" font-family="IBM Plex Mono">${v}</text>
      <text x="${pad.l - 10}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)" font-family="IBM Plex Mono">${v}</text>`).join("");
  const quad = (tx, ty, label, anchor) =>
    `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-size="11.5" fill="var(--ink-3)" font-family="Public Sans">${label}</text>`;
  return `
    <div class="matrix">
      <p class="cap">Impact vs effort. Hover a point for detail.</p>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Impact versus effort chart of ${gaps.length} opportunities">
        <rect x="${pad.l}" y="${pad.t}" width="${midX - pad.l}" height="${midY - pad.t}" fill="var(--accent-soft)" opacity=".55"/>
        ${grid}
        <line x1="${midX}" x2="${midX}" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--rule-strong)" stroke-dasharray="3 3"/>
        <line x1="${pad.l}" x2="${W - pad.r}" y1="${midY}" y2="${midY}" stroke="var(--rule-strong)" stroke-dasharray="3 3"/>
        ${quad(pad.l + 8, pad.t + 16, "Quick wins", "start")}
        ${quad(W - pad.r - 8, pad.t + 16, "Big bets", "end")}
        ${quad(pad.l + 8, H - pad.b - 8, "Fill-ins", "start")}
        ${quad(W - pad.r - 8, H - pad.b - 8, "Later", "end")}
        <text x="${(pad.l + W - pad.r) / 2}" y="${H - 2}" text-anchor="middle" font-size="11.5" fill="var(--ink-2)" font-family="Public Sans">Effort</text>
        <text transform="translate(9 ${(pad.t + H - pad.b) / 2}) rotate(-90)" text-anchor="middle" font-size="11.5" fill="var(--ink-2)" font-family="Public Sans">Impact</text>
        ${pts.map((p) => `
          <g class="pt" data-i="${p.i}">
            <circle cx="${p.cx}" cy="${p.cy}" r="16" fill="transparent"/>
            <circle cx="${p.cx}" cy="${p.cy}" r="9" fill="${p.i === 0 ? "var(--accent)" : "var(--ink)"}" stroke="var(--surface)" stroke-width="2"/>
            <text x="${p.cx}" y="${p.cy + 3.5}" text-anchor="middle" font-size="10" fill="#fff" font-family="IBM Plex Mono" font-weight="500">${p.i + 1}</text>
          </g>`).join("")}
      </svg>
      <div class="tip"></div>
    </div>`;
}

function wireMatrix(gaps) {
  const box = $(".matrix"), tip = $(".tip", box);
  box.querySelectorAll(".pt").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      const g = gaps[+el.dataset.i];
      tip.innerHTML = `<b>${+el.dataset.i + 1}. ${esc(g.title)}</b><br>Impact ${g.impact} · Effort ${g.effort} · Priority ${g.priority}`;
      tip.style.opacity = 1;
    });
    el.addEventListener("mousemove", (e) => {
      const r = box.getBoundingClientRect();
      tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 250) + "px";
      tip.style.top = e.clientY - r.top + 14 + "px";
    });
    el.addEventListener("mouseleave", () => (tip.style.opacity = 0));
  });
}

/* ------------------------------------------------------------ run view */
async function showRun(id) {
  await loadRail(id);
  const run = await api(`/api/runs/${id}`);
  const r = run.result, a = r.account, b = r.brief, s = r.skill_spec;
  const maxP = Math.max(...r.gaps.map((g) => g.priority), 1);
  main.innerHTML = `
    <div class="head">
      <div>
        <h1>${esc(a.company)}${run.mock ? `<span class="mock-flag">mock data</span>` : ""}</h1>
        <div class="meta"><span>${esc(a.industry)}</span><span>${esc(a.size)}</span><span>Analyzed ${fmtDate(run.created_at)}</span><span class="mono">${esc(run.model)}${run.duration_s ? ` · ${run.duration_s}s` : ""}</span></div>
      </div>
      <div class="health">
        <div class="num">${r.health.score}<small>/100</small></div>
        <div class="lbl"><span class="dot" style="background:${healthColor(r.health.label)}"></span>Account health: ${esc(r.health.label)}</div>
      </div>
    </div>

    <nav class="subnav">
      <a href="#ops" data-jump>Opportunities</a><a href="#brief" data-jump>Product brief</a>
      <a href="#skill" data-jump>AI skill spec</a><a href="#flows" data-jump>Workflows</a><a href="#src" data-jump>Transcript</a>
    </nav>

    <div class="overview">
      <div>
        <p class="summary">${esc(r.summary)}</p>
        <h3>Stakeholders</h3>
        <ul class="people">${a.stakeholders.map((p) => `<li><span>${esc(p.name)} <span class="muted">· ${esc(p.role)}</span></span><span class="muted">${esc(p.stance || "")}</span></li>`).join("")}</ul>
        <h3 style="margin-top:22px">What drives the health score</h3>
        <ul class="drivers">${r.health.drivers.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
      </div>
      ${matrix(r.gaps)}
    </div>

    <section class="block" id="ops">
      <div class="head" style="align-items:center;margin-bottom:14px"><h2 style="margin:0">Gaps and opportunities</h2>
        <div class="actions">
          <button class="btn primary" id="slackBtn" ${STATUS.slack ? "" : "disabled title='Add SLACK_WEBHOOK_URL to .env'"}>Send brief to Slack</button>
        </div>
      </div>
      <table>
        <thead><tr><th></th><th>Opportunity and customer evidence</th><th>Category</th><th class="n">Impact</th><th class="n">Effort</th><th>Priority</th></tr></thead>
        <tbody>${r.gaps.map((g, i) => `
          <tr class="${i === 0 ? "top" : ""}">
            <td class="rank">${i + 1}</td>
            <td><div class="gap-title">${esc(g.title)}</div><div class="gap-desc">${esc(g.description)}</div><div class="quote">${esc(g.evidence)}</div></td>
            <td class="cat">${esc(g.category)}</td>
            <td class="n">${g.impact}</td><td class="n">${g.effort}</td>
            <td class="mono" style="white-space:nowrap">${g.priority}<span class="bar" style="width:${Math.round((g.priority / maxP) * 60)}px"></span></td>
          </tr>`).join("")}</tbody>
      </table>
      <p class="muted" style="font-size:12.5px;margin-top:10px">Priority = impact × (6 − effort). Scores follow the rubric in the skill's references.</p>
    </section>

    <section class="block" id="brief">
      <h2>Product brief</h2>
      <dl class="brief">
        <dt>Problem</dt><dd class="problem">${esc(b.problem)}</dd>
        <dt>Goals</dt><dd>${list(b.goals)}</dd>
        <dt>Users</dt><dd>${list(b.users)}</dd>
        <dt>In scope</dt><dd>${list(b.in_scope)}</dd>
        <dt>Out of scope</dt><dd>${list(b.out_of_scope)}</dd>
        <dt>Success metrics</dt><dd>${list(b.success_metrics)}</dd>
        <dt>Risks</dt><dd>${list(b.risks)}</dd>
        <dt>Open questions</dt><dd>${list(b.open_questions)}</dd>
      </dl>
    </section>

    <section class="block" id="skill">
      <h2>AI skill spec</h2>
      <div class="skill">
        <div>
          <div class="name">${esc(s.name)}</div>
          <p class="desc">${esc(s.description)}</p>
          <div class="muted" style="font-size:13px">Solves: <b style="color:var(--ink)">${esc(s.solves_gap)}</b></div>
          <h4>Inputs</h4>${list(s.inputs)}
          <h4>Steps</h4><ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
          <h4>Outputs</h4>${list(s.outputs)}
          <h4>Guardrails</h4>${list(s.guardrails)}
          <h4>Integrations</h4>${list(s.integrations)}
        </div>
        <div>
          <div class="code-head"><span class="file">${esc(s.name)}/SKILL.md</span>
            <div class="actions"><button class="btn" id="copyBtn">Copy</button><a class="btn" href="/api/runs/${run.id}/skill.md">Download</a></div>
          </div>
          <pre class="code">${esc(s.skill_md)}</pre>
        </div>
      </div>
    </section>

    <section class="block" id="flows">
      <h2>Current workflows</h2>
      <div class="flows">${r.workflows.map((w) => `
        <div class="flow"><h3>${esc(w.name)}</h3><p>${esc(w.current_state)}</p><p><b style="color:var(--ink)">Pain:</b> ${esc(w.pain)}</p>
        <div class="quote">${esc(w.evidence)}</div>${w.tools?.length ? `<div class="tools" style="margin-top:6px">${w.tools.map(esc).join(" / ")}</div>` : ""}</div>`).join("")}
      </div>
    </section>

    <section class="block" id="src">
      <details><summary>Source transcript (${run.transcript.split(/\s+/).length} words)</summary>
        <div class="transcript" style="margin-top:14px">${esc(run.transcript)}</div></details>
    </section>`;

  wireMatrix(r.gaps);
  document.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault(); $(a.getAttribute("href")).scrollIntoView({ behavior: "smooth" });
  }));
  $("#copyBtn").onclick = () => navigator.clipboard.writeText(s.skill_md).then(() => toast("SKILL.md copied"));
  $("#slackBtn").onclick = async () => {
    const btn = $("#slackBtn");
    btn.disabled = true; btn.textContent = "Sending";
    try { await api(`/api/runs/${run.id}/slack`, { method: "POST" }); toast("Brief posted to Slack"); }
    catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = "Send brief to Slack";
  };
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------ new analysis */
async function showNew() {
  await loadRail();
  const samples = await api("/api/samples");
  main.innerHTML = `
    <h1>New analysis</h1>
    <div class="meta">Paste a discovery call transcript or your raw call notes.</div>
    <div class="new-grid">
      <div>
        <textarea id="tx" placeholder="Paste the transcript here"></textarea>
        <div class="actions" style="margin-top:14px">
          <button class="btn primary" id="go">Analyze call</button>
          <span class="working" id="working"></span>
        </div>
        <div class="err" id="err"></div>
      </div>
      <div class="side">
        <h3>Sample calls</h3>
        <p>Synthetic transcripts for testing. No real customer data.</p>
        <select id="sample"><option value="">Load a sample</option>${samples.map((s) => `<option>${esc(s)}</option>`).join("")}</select>
        <h3 style="margin-top:28px">What you get</h3>
        <ol>
          <li>Customer needs and current workflows, with quotes</li>
          <li>Gaps ranked by impact and effort</li>
          <li>A product brief</li>
          <li>A draft SKILL.md for the top opportunity</li>
        </ol>
        ${STATUS.live ? "" : `<p style="color:var(--warn)">No API key found, so this runs in mock mode and returns a fixed example.</p>`}
      </div>
    </div>`;
  let source = "pasted";
  $("#sample").onchange = async (e) => {
    if (!e.target.value) return;
    const s = await api(`/api/samples/${encodeURIComponent(e.target.value)}`);
    $("#tx").value = s.text; source = `sample:${s.name}`;
  };
  $("#tx").oninput = () => (source = "pasted");
  $("#go").onclick = async () => {
    $("#err").textContent = "";
    const btn = $("#go"); btn.disabled = true;
    const t0 = Date.now();
    const steps = ["Reading the call", "Mapping workflows", "Scoring opportunities", "Writing the brief", "Drafting the skill spec"];
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $("#working").innerHTML = `${steps[Math.min(Math.floor(s / 7), steps.length - 1)]} <span class="t muted">${s}s</span>`;
    }, 250);
    try {
      const run = await api("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: $("#tx").value, source }) });
      location.hash = `#/run/${run.id}`;
    } catch (e) { $("#err").textContent = e.message; }
    clearInterval(tick); btn.disabled = false; $("#working").textContent = "";
  };
}

/* ------------------------------------------------------------ evals */
const CHECK_LABELS = {
  schema_complete: "Schema complete", account_identified: "Account identified", evidence_grounded: "Quotes grounded",
  gap_count_3_to_7: "3 to 7 gaps", covers_key_topics: "Key topics covered", top_priority_matches_customer: "Top priority matches customer",
  skill_md_valid: "Valid SKILL.md",
};

async function showEvals() {
  await loadRail();
  const all = await api("/api/evals");
  if (!all.length) {
    main.innerHTML = `<div class="empty-state"><h1>Evals</h1><p>No eval runs yet. From the project folder run <span class="mono">python evals/run_evals.py</span> to score the skill against the five sample calls.</p></div>`;
    return;
  }
  const last = all[all.length - 1];
  const checks = Object.keys(last.cases[0].checks);
  main.innerHTML = `
    <div class="head">
      <div><h1>Evals</h1><div class="meta"><span>Skill v${esc(last.skill_version)}</span><span class="mono">${esc(last.model)}</span><span>${esc(last.created_at.replace("T", " "))}</span>${last.mock ? "<span>mock</span>" : ""}</div></div>
      <div class="health"><div class="score">${Math.round(last.score * 100)}%</div><div class="lbl muted">${last.passed} of ${last.total} checks passed</div></div>
    </div>
    <section class="block" style="border:0;margin-top:10px">
      <h2>Latest run</h2>
      <table class="evalgrid">
        <thead><tr><th>Sample call</th>${checks.map((c) => `<th>${CHECK_LABELS[c] || c}</th>`).join("")}<th class="n">Score</th></tr></thead>
        <tbody>${last.cases.map((c) => `
          <tr><td><a href="#/run/${c.run_id}">${esc(c.case.replace(/^\d+_|\.txt$/g, "").replace(/_/g, " "))}</a></td>
          ${checks.map((k) => (c.checks[k] ? `<td class="check-ok" title="pass">pass</td>` : `<td class="check-no" title="fail">fail</td>`)).join("")}
          <td class="n">${c.passed}/${c.total}</td></tr>`).join("")}</tbody>
      </table>
      ${failureNotes(last)}
    </section>
    <section class="block">
      <h2>History</h2>
      <table>
        <thead><tr><th>Run</th><th>Skill version</th><th>Model</th><th class="n">Checks</th><th>Score</th></tr></thead>
        <tbody>${[...all].reverse().map((e) => `
          <tr><td class="mono">${esc(e.created_at.replace("T", " "))}</td><td>v${esc(e.skill_version)}</td><td class="mono">${esc(e.model)}</td>
          <td class="n">${e.passed}/${e.total}</td><td class="mono">${Math.round(e.score * 100)}%<span class="bar" style="width:${Math.round(e.score * 120)}px"></span></td></tr>`).join("")}</tbody>
      </table>
    </section>`;
}

function failureNotes(ev) {
  const notes = [];
  ev.cases.forEach((c) => {
    const name = c.case.replace(/^\d+_|\.txt$/g, "").replace(/_/g, " ");
    if (c.detail.ungrounded?.length) notes.push(`${name}: quote not found word for word in the transcript: "${c.detail.ungrounded.join('" / "')}"`);
    if (c.detail.missing_topics?.length) notes.push(`${name}: missed topics ${c.detail.missing_topics.join(", ")}`);
    if (!c.checks.top_priority_matches_customer) notes.push(`${name}: ranked "${c.detail.top_gap}" first, not what the customer asked to fix first`);
  });
  return notes.length ? `<h3 style="margin-top:26px">What failed</h3><ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "";
}

/* ------------------------------------------------------------ router */
async function route() {
  const h = location.hash;
  try {
    if (h.startsWith("#/run/")) return await showRun(h.slice(6));
    if (h === "#/new") return await showNew();
    if (h === "#/evals") return await showEvals();
    const runs = await loadRail();
    if (runs.length) location.hash = `#/run/${runs[0].id}`;
    else location.hash = "#/new";
  } catch (e) {
    main.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}
window.addEventListener("hashchange", route);
route();
