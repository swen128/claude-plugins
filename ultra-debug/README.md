# ultra-debug

Find the root cause of a production bug. Give it problem description, and it spawns multiple agents in parallel to investigate. The result is a report backed entirely by evidence: code references, log timestamps, and reproducible queries. No guessing.

## Installation

```
/plugin install ultra-debug@swen128-claude-plugins
```

## Usage

Type `/ultra-debug <problem description>` and just wait.

## Example Output

See [example report](./examples/ultra-debug-report.md), which was the result of the following prompt:

```
/ultra-debug My macbook is connected to a display via Thunderbolt, but the display doesn't get the signal. 
             The macbook restarted this morning, so it likely got updated.
```
