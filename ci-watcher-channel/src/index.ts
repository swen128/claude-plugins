import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  type FailedRun,
  extractRunId,
  getFailedLogs,
  getPRChecks,
  listMyOpenPRs,
} from "./github.ts"

const POLL_INTERVAL_MS = Number(process.env.CI_POLL_INTERVAL_MS) || 60_000

const seenFailures = new Set<string>()

function failureKey(prNumber: number, checkName: string): string {
  return `${prNumber}:${checkName}`
}

async function detectNewFailures(): Promise<FailedRun[]> {
  const prs = await listMyOpenPRs()
  const results: FailedRun[] = []

  for (const pr of prs) {
    const checks = await getPRChecks(pr.number)
    const newlyFailed = checks.filter(
      (c) =>
        c.conclusion === "failure" &&
        !seenFailures.has(failureKey(pr.number, c.name)),
    )

    if (newlyFailed.length === 0) continue

    for (const c of newlyFailed) {
      seenFailures.add(failureKey(pr.number, c.name))
    }

    const runId = extractRunId(newlyFailed[0].detailsUrl)

    results.push({ pr, checks: newlyFailed, runId })
  }

  return results
}

function formatFailureMessage(failure: FailedRun, logs: string): string {
  const checkList = failure.checks
    .map((c) => `  - ${c.name}: ${c.detailsUrl}`)
    .join("\n")

  return [
    `CI failed on PR #${failure.pr.number}: ${failure.pr.title}`,
    `Branch: ${failure.pr.headRefName}`,
    `URL: ${failure.pr.url}`,
    `Failed checks:\n${checkList}`,
    logs ? `\nLogs (tail):\n${logs}` : "",
  ].join("\n")
}

async function main() {
  const server = new Server(
    { name: "ci-watcher", version: "0.1.0" },
    {
      capabilities: {
        experimental: { "claude/channel": {} },
      },
      instructions:
        "CI failure alerts for your GitHub PRs. When a failure arrives, help the user diagnose and fix it.",
    },
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[ci-watcher] Channel server started, polling every", POLL_INTERVAL_MS, "ms")

  const poll = async () => {
    try {
      const failures = await detectNewFailures()
      for (const failure of failures) {
        const logs = failure.runId ? await getFailedLogs(failure.runId) : ""
        const message = formatFailureMessage(failure, logs)

        await server.notification({
          method: "notifications/claude/channel",
          params: {
            content: message,
            meta: {
              pr_number: String(failure.pr.number),
              branch: failure.pr.headRefName,
              run_id: failure.runId ?? "",
              severity: "high",
            },
          },
        })

        console.error(`[ci-watcher] Notified: PR #${failure.pr.number} (${failure.checks.length} failed checks)`)
      }
    } catch (err) {
      console.error("[ci-watcher] Poll error:", err)
    }
  }

  await poll()
  setInterval(poll, POLL_INTERVAL_MS)
}

main().catch((err) => {
  console.error("[ci-watcher] Fatal:", err)
  process.exit(1)
})
