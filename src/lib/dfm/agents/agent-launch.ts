export type AgentLaunchCard = {
  name: string;
  shortUse: string;
  prompt: string;
  followUp: string;
  copyLabel: string;
};

export type AgentLaunchModel = {
  title: string;
  intro: string;
  platformRecommendation: {
    primarySurface: string;
    engineeringSurface: string;
    summary: string;
  };
  accessHelp: {
    title: string;
    summary: string;
    steps: string[];
  };
  handoffs: Array<{
    title: string;
    description: string;
    prompt: string;
    copyLabel: string;
  }>;
  cards: AgentLaunchCard[];
  notes: string[];
};

export type AgentLaunchPromptTab = {
  label: string;
  content: string;
  copyLabel: string;
};

const sharedSetup =
  "Use the current production Deal Flow Matcher operator state as your source of truth. Prefer the protected operator packet and the live operator dashboard over memory. Do not send ClickUp deals, move cursors, replay runs, or write to Airtable, Supabase, ClickUp, or Vercel unless I explicitly approve a live write.";

export function buildAgentLaunchModel(): AgentLaunchModel {
  return {
    title: "Deal Flow Agent Launch",
    intro:
      "Start the right agent conversation here first. The dashboard is for viewing workflow state in a browser, while these prompts are for starting role-based analysis in Codex or ChatGPT Work.",
    platformRecommendation: {
      primarySurface: "ChatGPT Work",
      engineeringSurface: "Codex",
      summary:
        "Use ChatGPT Work first for Operator and QA conversations because it is the better day-to-day workspace for reading workflow state, discussing findings, and staying in a guided operating flow. Use Codex when the Engineering Agent needs to inspect the repo, implement changes, run tests, or deploy fixes.",
    },
    accessHelp: {
      title: "If the dashboard is locked",
      summary:
        "The live operator dashboard and packet are intentionally protected. ChatGPT Work or the in-app browser will not unlock them automatically.",
      steps: [
        "Open the Operator Dashboard in a browser where you can enter the internal DFM secret.",
        "Use the dashboard's copy action to grab the live operator summary after it loads.",
        "Paste that summary into ChatGPT Work for Operator or QA analysis, or into Codex if you want technical follow-through.",
      ],
    },
    handoffs: [
      {
        title: "Start In ChatGPT Work",
        description:
          "Use this when you want a clean operational conversation for status, risk review, or decision support.",
        prompt:
          "Act as the Deal Flow Matcher Operator Agent first, then switch to the QA Agent if needed. Use the current production operator packet as your source of truth. Tell me what is happening now, what could still be wrong, and the single next action I should take. Do not perform live writes.",
        copyLabel: "Copy ChatGPT Work handoff",
      },
      {
        title: "Escalate To Codex",
        description:
          "Use this when an issue is already identified and you want repository inspection, code changes, tests, or deployment help.",
        prompt:
          "Act as the Deal Flow Matcher Engineering Agent. Start from the current production operator packet, inspect the repository and deployment setup, identify the highest-priority technical issue, recommend the smallest safe fix, and verify it before completion. Default to read-only analysis unless I explicitly approve code changes or deployment.",
        copyLabel: "Copy Codex handoff",
      },
    ],
    cards: [
      {
        name: "Operator Agent",
        shortUse: "Use this for the plain-English workflow status and the single most important next action.",
        prompt: `${sharedSetup}\n\nAct as the Deal Flow Matcher Operator Agent.\n\nUse the current production operator packet as your source of truth.\n\nYour job:\n1. Tell me whether the workflow is healthy.\n2. Tell me whether the Airtable cursor is safe.\n3. Tell me whether delivery is clear, pending, or blocked.\n4. Tell me whether the daily email report should already exist.\n5. Tell me the single most important next action.\n\nRules:\n- Do not perform any live writes.\n- Do not assume a report was sent unless the run state supports it.\n- Use beginner-friendly language.\n- Separate verified facts from assumptions.`,
        followUp:
          "Stay in the Operator Agent role and explain the workflow status in beginner-friendly language. Then tell me what I should manually check first if I want to confirm the run myself.",
        copyLabel: "Copy starter prompt",
      },
      {
        name: "QA Agent",
        shortUse: "Use this for silent-failure checks, contradictions, and reliability risk review.",
        prompt: `${sharedSetup}\n\nAct as the Deal Flow Matcher QA Agent.\n\nUse the current production operator packet as your source of truth.\n\nYour job:\n1. Find anything inconsistent, missing, or suspicious in the current workflow state.\n2. Check for silent failure patterns such as email mismatch, stuck delivery, stale cursor, missing thesis coverage, or contradictory run states.\n3. Tell me the top risks in priority order.\n4. Recommend the smallest safe verification step for each major risk.\n\nRules:\n- Do not perform live writes.\n- Do not assume upstream success from a downstream signal.\n- Prefer evidence over speculation.\n- Call out when the packet is not enough and what evidence would close the gap.`,
        followUp:
          "Stay in the QA Agent role and give me a red-yellow-green assessment of today’s workflow state, with one sentence of evidence for each color call.",
        copyLabel: "Copy starter prompt",
      },
      {
        name: "Engineering Agent",
        shortUse: "Use this for the smallest safe code, config, or deployment fix after an issue is identified.",
        prompt: `${sharedSetup}\n\nAct as the Deal Flow Matcher Engineering Agent.\n\nUse the current production operator packet as your starting context, then inspect the repository and deployment setup as needed.\n\nYour job:\n1. Identify the highest-priority technical issue.\n2. Recommend the smallest safe fix.\n3. Explain what code, config, route, env, or deployment area is involved.\n4. Explain how to verify the fix after implementation.\n\nRules:\n- Default to read-only analysis unless I explicitly approve code changes or deployment.\n- Do not recommend cursor movement or replay unless the recovery path is clearly justified.\n- Separate diagnosis, implementation plan, and verification plan.`,
        followUp:
          "Stay in the Engineering Agent role and turn your recommendation into a short implementation checklist with verification steps.",
        copyLabel: "Copy starter prompt",
      },
      {
        name: "AE Deal Flow Agent",
        shortUse:
          "Use this for the weekly accelerator deal-flow review to find AEs who are not receiving enough matched deals.",
        prompt: `${sharedSetup}\n\nAct as the Deal Flow Matcher AE Deal Flow Agent.\n\nUse the current production operator packet and operator dashboard as your source of truth.\n\nYour job:\n1. Review weekly AE coverage across delivered deal flow.\n2. Identify acquisition entrepreneurs with low recent match volume.\n3. Flag whether the likely cause is narrow criteria, a strong-only threshold, missing routing, a missing current thesis, or thin sourcing.\n4. Recommend the single best next investigation step for each flagged AE.\n\nRules:\n- Do not perform live writes.\n- Focus on delivered Strong and Moderate deal flow, not just total scraped deals.\n- Separate verified facts from likely diagnosis.\n- Use beginner-friendly language.`,
        followUp:
          "Stay in the AE Deal Flow Agent role and group the flagged AEs into: likely narrow criteria, likely sourcing gap, setup issue, and needs manual review.",
        copyLabel: "Copy starter prompt",
      },
    ],
    notes: [
      "Using a prompt here in Codex or ChatGPT Work will not automatically unlock the browser dashboard.",
      "The dashboard stays behind the internal secret, while the prompts can still be used in chat immediately.",
      "Do not paste the internal secret into prompts, docs, screenshots, or chat.",
      "There is no automatic 90-day untouched-deal deletion in ClickUp or Airtable. Any cleanup should start as a review or archive proposal first.",
    ],
  };
}

export function getPromptTabsForCard(card: AgentLaunchCard): AgentLaunchPromptTab[] {
  return [
    {
      label: "Launch prompt",
      content: card.prompt,
      copyLabel: card.copyLabel,
    },
    {
      label: "Follow-up",
      content: card.followUp,
      copyLabel: "Copy follow-up prompt",
    },
  ];
}
