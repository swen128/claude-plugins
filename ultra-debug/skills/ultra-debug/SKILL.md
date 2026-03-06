---
name: ultra-debug
description: Spawn debugger and critic agents to collaboratively investigate a bug's root cause through adversarial hypothesis testing. Produces a grounded markdown report with no speculation.
user-invocable: true
argument-hint: <problem description>
---

# Ultra Debug

Orchestrate a team of debugger agents and a critic agent to investigate the root cause of a production issue through adversarial hypothesis testing.

## Input

The user provides: `$ARGUMENTS`

This may be a Sentry issue URL/ID, a problem description, relevant shop IDs, timestamps, error messages, or any combination.

## Orchestration Workflow

### Phase 0: Gather Context (keep it brief)

Spend minimal time here — just enough to frame the problem and form hypotheses. Quick searches are fine; deep investigation is the debuggers' job.

1. **Sentry**: If a Sentry URL or issue ID is provided, fetch the issue summary (title, stack trace, first/last seen)
2. **Quick checks**: A few log or code searches to understand the affected area are okay
3. **Summarize in one paragraph**: WHAT is broken, WHEN it started, WHO is affected, WHERE in the system

Do NOT spend more than a few tool calls here. Move on to hypothesis formation quickly.

### Phase 1: Form Hypotheses

Based on the summary and your general knowledge of the system, generate **5 distinct, testable hypotheses**. Each hypothesis must be:

- **Specific**: names a concrete mechanism (code path, data state, timing condition, external dependency)
- **Testable**: can be confirmed or refuted with available evidence (logs, code, data, errors)
- **Independent**: does not overlap significantly with other hypotheses

### Phase 2: Create Team

1. Create a team:

```
TeamCreate with team_name: "ultra-debug-<short-kebab-description>"
```

2. Create one task per hypothesis using TaskCreate:
   - Subject: `Investigate: <hypothesis summary>`
   - Description: full hypothesis details and suggested investigation approach

3. Create one task for the critic:
   - Subject: `Critique all hypotheses`
   - Description: list of all hypotheses, debugger names, and the evidence standards

### Phase 3: Spawn Agents

Spawn **all agents in parallel** (single message with multiple Agent tool calls).

For **each hypothesis**, spawn a debugger:

```
Agent tool:
  subagent_type: "debugger-teammate"
  team_name: "ultra-debug-<name>"
  name: "debugger-N"
  prompt: |
    You are debugger-N in team ultra-debug-<name>.

    YOUR HYPOTHESIS:
    <hypothesis description>

    PROBLEM CONTEXT:
    <gathered context from Phase 0>

    YOUR TEAMMATES:
    - Other debuggers: <list names and their hypotheses>
    - Critic: critic-1

    YOUR TASK ID: <task-id>

    Begin investigation. Share findings via SendMessage with critic-1
    and relevant debuggers.
```

Spawn **one critic**:

```
Agent tool:
  subagent_type: "critic-teammate"
  team_name: "ultra-debug-<name>"
  name: "critic-1"
  prompt: |
    You are critic-1 in team ultra-debug-<name>.

    PROBLEM CONTEXT:
    <gathered context from Phase 0>

    HYPOTHESES UNDER INVESTIGATION:
    1. <hypothesis 1> — investigated by debugger-1
    2. <hypothesis 2> — investigated by debugger-2
    3. <hypothesis 3> — investigated by debugger-3

    YOUR TASK ID: <task-id>

    Wait for debuggers to share initial findings, then begin your
    adversarial review. Continue for up to 5 rounds until every
    hypothesis is either proved or disproved.
```

### Phase 4: Monitor & Facilitate

1. **Wait** for agents to send findings — messages from teammates arrive automatically
2. If a debugger discovers evidence relevant to another's hypothesis, relay it if they haven't communicated directly
3. If agents are stuck (idle without progress), send guidance or additional context
4. Allow **up to 5 rounds** of challenge-response between debuggers and critic, until every hypothesis is either proved or disproved
5. If a new hypothesis emerges during investigation, spawn an additional debugger if warranted
6. Track progress via TaskList

### Phase 5: Synthesize Report

After all agents report their final assessments:

1. Collect all findings, evidence, and debate outcomes
2. Determine the consensus:
   - If one hypothesis **SURVIVED** the critic's challenges: status = **CONFIRMED**
   - If multiple survived or none did: status = **INCONCLUSIVE**
3. Write the report to `.claude/works/ultra-debug-<name>/report.md`
4. Present the report to the user

## Report Template

```markdown
# <title>

**Date**: YYYY-MM-DD
**Status**: CONFIRMED | INCONCLUSIVE

## Problem Statement

<What is broken. When it started. Who is affected. How it manifests.>

## Root Cause

<If CONFIRMED: Single definitive statement of the root cause, with primary evidence reference.>
<If INCONCLUSIVE: What was eliminated and what remains unresolved.>

## Evidence

| # | Finding | Source |
|---|---------|--------|
| 1 | <concrete finding> | <file:line / log timestamp / query / Sentry event ID> |
| 2 | ... | ... |

## Investigation Timeline

| Hypothesis | Verdict | Summary |
|------------|---------|---------|
| <hypothesis 1> | CONFIRMED / DISPROVED | <one line> |
| <hypothesis 2> | CONFIRMED / DISPROVED | <one line> |

## Debate Log

### Hypothesis 1: <name>
- **Debugger finding**: <summary with evidence refs>
- **Critic challenge**: <the challenge and its basis>
- **Resolution**: <how it was resolved, with evidence>

### Hypothesis 2: <name>
...

## Recommendations

<Concrete, actionable next steps based on findings. Reference specific code locations.>
```

## Strict Rules

### Language Rules

The final report MUST NOT contain any of these hedge words or phrases:

> likely, unlikely, maybe, perhaps, possibly, probably, might, could (expressing uncertainty),
> appears to, seems to, seems like, it looks like, we think, we believe,
> should be (expressing uncertainty), in theory

Every statement must be either:
- A **fact** backed by cited evidence in the Evidence table, OR
- Explicitly labeled as **[UNVERIFIED]** with a note on what evidence is missing

### Evidence Rules

- Code references: markdown link with `file:line` as link text and GitHub permalink with commit SHA as URL (e.g., `[/path/to/file.ts:142](https://github.com/org/repo/blob/<commit-sha>/path/to/file.ts#L142)`). Run `git rev-parse HEAD` to get the current commit SHA.
- Log references: timestamp and log source
- Database findings: the exact query used (reproducible)
- Sentry references: event ID or issue ID with link
- Git references: commit hash

### Scope Rules

- Do NOT fix the bug — only identify the root cause
- Do NOT modify any source files
- Do NOT speculate about fixes beyond the Recommendations section
- The report is the sole deliverable
