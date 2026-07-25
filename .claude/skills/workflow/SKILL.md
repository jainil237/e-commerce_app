---
name: workflow
description: Full Lifecycle Orchestrator for this project. Routes any request through the agentsmyth Think → Plan → Build → Review → Test → Ship → Reflect chain. Loads the correct phase skill, enforces lifecycle order, writes phase artifacts, and pauses when user input or evidence is required. Use when starting or resuming any Standard or Complex task. Trivial tasks are handled inline without artifacts.
user-invocable: true
---

# /workflow — Full Lifecycle Orchestrator

Load and execute `workflow/skills/lifecycle-orchestrator/SKILL.md` as the primary routing skill for this session.

## Quick-Start

1. Load `workflow/router.md` — classifies the request and selects the current phase.
2. Load `workflow/config/agent-behavior.yaml` — task classes, artifact chain, evidence and waiver policy.
3. Load `workflow/skills/lifecycle-orchestrator/SKILL.md` — primary routing skill for Standard and Complex work.
4. Check `workflow/config/pending-setup.yaml` if it exists; resolve any open items via inspection or user prompt.
5. Inspect existing artifacts under `workflow/artifacts/**` to determine active chains and their current phase.
6. Route: new request → Think; resume → restore-context then continue; trivial → handle inline.

## Lifecycle Order

```
Think → Plan → Build → Review → Test → Ship → Reflect
```

| Phase | Skill | Artifact |
|---|---|---|
| Think | `workflow/skills/lifecycle-think/SKILL.md` | `workflow/artifacts/briefs/<slug>-v<N>.md` |
| Plan | `workflow/skills/lifecycle-plan/SKILL.md` | `workflow/artifacts/plans/<slug>-v<N>.md` |
| Build | `workflow/skills/lifecycle-build/SKILL.md` | `workflow/artifacts/tasks/<slug>-v<N>.md` |
| Review | `workflow/skills/lifecycle-review/SKILL.md` | `workflow/artifacts/reviews/<slug>-v<N>.md` |
| Test | `workflow/skills/lifecycle-test/SKILL.md` | `workflow/artifacts/verify/<slug>-v<N>.md` |
| Ship | `workflow/skills/lifecycle-ship/SKILL.md` | `workflow/artifacts/ship/<slug>-v<N>.md` |
| Reflect | `workflow/skills/lifecycle-reflect/SKILL.md` | `workflow/artifacts/reflect/<slug>-v<N>.md` |

All phase behavior, pause conditions, exit gates, and artifact schemas are defined in the lifecycle-orchestrator SKILL.md and its references. Follow those exactly.
