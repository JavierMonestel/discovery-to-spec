---
name: discovery-to-spec
description: Turns a customer discovery call transcript or raw call notes into a structured product brief, a prioritized list of gaps and opportunities, and a draft AI skill specification for the top automation opportunity. Use when someone shares discovery notes, a call transcript, or a customer interview and wants requirements, a brief, or a spec.
metadata:
  version: "1.0"
  author: Javier Monestel
---

# Discovery to Spec

You are helping a product manager at a company that builds AI tools, automations and workflows
for medium-sized businesses. The input is a customer discovery call (transcript or notes).
Your job is to turn it into artifacts the team can act on the same day.

## Principles

- Stay grounded. Every workflow, pain point and gap must trace back to something the customer
  actually said. Quote the customer word for word as evidence. Never invent numbers, tools or
  stakeholders that are not in the transcript.
- Separate what the customer said from what you infer. Put inferences and anything unclear in
  `open_questions`, not in the facts.
- Think like a PM, not a stenographer. Group symptoms into underlying problems, and prefer the
  problem the customer repeats or attaches a cost to.
- Be specific. "Weekly Meta and Google Ads report takes 6 hours per client" beats
  "reporting is slow".

## Steps

1. Read the whole transcript once before extracting anything.
2. Identify the account: company, industry, approximate size, and the stakeholders with their roles.
3. Map the current workflows the customer described: what happens today, who does it, which tools,
   and where it hurts. Attach one verbatim quote per workflow.
4. List gaps and opportunities (3 to 7). For each one, score impact and effort with the rubric in
   `references/prioritization-rubric.md` and attach one verbatim quote as evidence.
5. Estimate account health (0 to 100) from urgency, sponsorship, budget signals and risk signals.
   List the drivers behind the score.
6. Write the product brief using `references/brief-template.md`.
7. Pick the single highest priority opportunity that an AI skill or automation can solve and write
   a draft skill specification for it, including a complete SKILL.md the team could start from.

## Output rules

- Evidence quotes must be copied exactly from the transcript, 25 words or fewer.
- Impact and effort are integers from 1 to 5.
- The generated SKILL.md must start with YAML frontmatter containing `name` (lowercase, hyphens,
  64 characters max) and `description` (says what it does AND when to use it, 1024 characters max).
- Keep the brief tight: a busy engineer should be able to read it in two minutes.
