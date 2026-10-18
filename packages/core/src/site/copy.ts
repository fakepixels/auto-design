/**
 * Sample content for previews. Taste questions are answered on screens that
 * show the person's own product, so a choice of type or texture is judged on
 * their headline and their data, not on lorem ipsum.
 */

export interface SpecimenCopy {
  product: string;
  headline: string;
  subhead: string;
  cta: string;
  secondaryCta: string;
  note: string;
  nav: string[];
  pageTitle: string;
  pageSummary: string;
  primaryAction: string;
  /** Past-tense confirmation for the primary action, shown in toasts. */
  done: string;
  statusLabel: string;
  metrics: { label: string; value: string }[];
  table: { columns: [string, string, string, string]; rows: { name: string; detail: string; value: string; status: "ok" | "review" }[] };
  chat: { question: string; tool: string; toolArgs: string; answer: string; followUp: string };
  code: { comment: string; command: string };
  sms: { from: "business" | "customer"; text: string }[];
  card: { title: string; body: string; metric: string };
}

export function defaultCopy(product = "Northwind", description = ""): SpecimenCopy {
  const name = product.trim() || "Northwind";
  const about = description.trim();
  return {
    product: name,
    headline: (about && sentence(about, 10)) || `Everything your team ships, in one place.`,
    subhead: about
      ? `${name} gives your team one place to plan, track and share the work, so nothing slips between tools.`
      : `${name} keeps projects, people and numbers in one calm view, so the next step is always obvious.`,
    cta: "Start free trial",
    secondaryCta: "See how it works",
    note: "Free for 14 days. No card needed.",
    nav: ["Overview", "Projects", "Reports", "Team", "Settings"],
    pageTitle: "October review",
    pageSummary: "38 projects updated this month. Three need a decision before Friday.",
    primaryAction: "Approve plan",
    done: "Plan approved",
    statusLabel: "In review",
    metrics: [
      { label: "Active projects", value: "38" },
      { label: "On track", value: "92%" },
      { label: "Needs a decision", value: "3" },
    ],
    table: {
      columns: ["Project", "Owner", "Budget", "Status"],
      rows: [
        { name: "Website refresh", detail: "Maya Chen", value: "$48,200", status: "review" },
        { name: "Mobile onboarding", detail: "Jonas Weber", value: "$31,750", status: "ok" },
        { name: "Billing migration", detail: "Priya Nair", value: "$92,400", status: "review" },
        { name: "Support playbooks", detail: "Leo Martins", value: "$12,900", status: "ok" },
      ],
    },
    chat: {
      question: "Why is the billing migration over budget?",
      tool: "query_spend",
      toolArgs: "project: billing-migration, period: 2026-10",
      answer:
        "Most of the overage is one line item. Contractor hours rose from 120 to 210 after the data audit found two legacy systems nobody had listed.",
      followUp: "Everything else is within 4% of plan.",
    },
    code: { comment: `# Create a project from the command line`, command: `${slug(name)} projects create --name "Website refresh" --owner maya` },
    sms: [
      { from: "business", text: `${name}: Your October report is ready. 3 projects need a decision this week.` },
      { from: "customer", text: "Which ones?" },
      { from: "business", text: "Website refresh, Billing migration and Q4 hiring. Reply 1, 2 or 3 to open one." },
    ],
    card: { title: "October report", body: "3 projects need a decision", metric: "92% on track" },
  };
}

/**
 * A headline from a description: its first sentence, or its first clause if
 * that runs long. Never a sentence cut off mid-thought.
 */
function sentence(text: string, maxWords: number): string | null {
  const first = text.split(/(?<=[.!?])\s+/)[0]!.replace(/[.\s]+$/, "");
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const pick = words(first) <= maxWords ? first : first.split(/,\s+|\s+[—–-]\s+|:\s+/)[0]!;
  if (words(pick) < 2 || words(pick) > maxWords) return null;
  return `${pick.charAt(0).toUpperCase()}${pick.slice(1)}.`;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
}

