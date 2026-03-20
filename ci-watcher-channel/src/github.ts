import { $ } from "bun"

export interface PullRequest {
  number: number
  title: string
  headRefName: string
  url: string
}

export interface CheckRun {
  name: string
  status: string
  conclusion: string
  detailsUrl: string
}

export interface FailedRun {
  pr: PullRequest
  checks: CheckRun[]
  runId: string | undefined
}

export async function listMyOpenPRs(): Promise<PullRequest[]> {
  const result =
    await $`gh pr list --author @me --state open --json number,title,headRefName,url`.quiet()
  return JSON.parse(result.stdout.toString()) as PullRequest[]
}

export async function getPRChecks(prNumber: number): Promise<CheckRun[]> {
  const result =
    await $`gh pr checks ${prNumber} --json name,state,conclusion,detailsUrl`.quiet()

  const raw = JSON.parse(result.stdout.toString()) as Array<{
    name: string
    state: string
    conclusion: string
    detailsUrl: string
  }>

  return raw.map((c) => ({
    name: c.name,
    status: c.state,
    conclusion: c.conclusion,
    detailsUrl: c.detailsUrl,
  }))
}

export function extractRunId(detailsUrl: string): string | undefined {
  // /actions/runs/<id> pattern in GitHub Actions URLs
  const match = detailsUrl.match(/\/actions\/runs\/(\d+)/)
  return match?.[1]
}

export async function getFailedLogs(runId: string): Promise<string> {
  try {
    const result =
      await $`gh run view ${runId} --log-failed`.quiet()
    return result.stdout
      .toString()
      .replace(/\x1b\[[0-9;]*m/g, "") // strip ANSI escape codes
      .slice(-3000)
  } catch {
    return "(could not retrieve logs)"
  }
}
