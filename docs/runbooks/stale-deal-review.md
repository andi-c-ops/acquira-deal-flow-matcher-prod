# Stale Deal Review Policy

## Purpose

This runbook defines how to handle old deals that remain untouched in ClickUp or Airtable.

Current policy:

- Deal Flow Matcher does **not** automatically delete untouched deals from ClickUp.
- Deal Flow Matcher does **not** automatically delete untouched deals from Airtable.
- Any future cleanup must begin as a review or archive workflow, not a delete workflow.

## Current State

As of August 12, 2026:

- there is no 90-day stale-deal cleanup automation in this repo
- there is no automatic archive action for untouched ClickUp deals
- there is no automatic delete action for untouched Airtable deals
- stale-run recovery exists for workflow runs, but that is separate from stale-deal cleanup

The operator packet shows stale ClickUp-delivered deal counts from Deal Flow Matcher delivery records. These counts are intentionally fast and auditable, but they are not a fresh full ClickUp task-activity census. Recent ClickUp activity is used separately for the 14-day and 30-day AE Deal Flow review.

## Why Delete Is Not Automatic

Deleting old deals without review is risky because those records may still be needed for:

- match audit history
- AE pipeline context
- future thesis rematching
- delivery verification
- operator troubleshooting

In other words, an untouched deal is not automatically a bad deal or a disposable record.

## Safe Review Sequence

If stale-deal cleanup is desired in the future, use this order:

1. identify untouched deals older than the approved age threshold
2. produce a review list, not a delete action
3. separate ClickUp task state from Airtable source-of-truth state
4. decide whether each stale deal should be kept, archived, or manually deleted
5. log the action taken and who approved it

## Recommended First Implementation

If this capability is added later, the first version should be:

- read-only
- report-only
- filterable by age threshold, such as 90 days
- separate for ClickUp and Airtable
- explicit about counts, sample records, and approval required

Recommended outputs:

- `stale clickup deals over 90 days`
- `stale airtable deals over 90 days`
- `archive candidates`
- `manual review required`

## Guardrails

- Never delete Airtable records automatically without explicit approval.
- Never delete ClickUp tasks automatically without explicit approval.
- Prefer archive or status-change actions over delete actions.
- Keep source-of-truth retention rules separate from delivery-surface cleanup rules.
- Require a dry-run or review report before any live cleanup action.
