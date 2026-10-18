import { type SpecimenCopy } from "@auto-design/core";

export { defaultCopy, type SpecimenCopy } from "@auto-design/core";

const str = (description: string) => ({ type: "string", description });

/** JSON Schema for the copy, so a model can write it for a specific product. */
export function copySchema(): Record<string, unknown> {
  const obj = (properties: Record<string, unknown>) => ({
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  });
  return obj({
    headline: str("Marketing headline, at most 9 words, specific to the product. No hype words."),
    subhead: str("One sentence under 24 words saying what the product does for whom."),
    cta: str("Primary button, 2-3 words, sentence case."),
    secondaryCta: str("Secondary button, 2-4 words."),
    note: str("Fine print under the buttons, under 10 words."),
    nav: { type: "array", items: { type: "string" }, description: "Exactly 5 app navigation items, one or two words each." },
    pageTitle: str("Title of the main app screen, 2-4 words."),
    pageSummary: str("One sentence summarizing that screen's state with a real number."),
    primaryAction: str("The one primary action on that screen, 2-3 words."),
    done: str("Past-tense confirmation of that action for a toast, 2-3 words, e.g. 'Plan approved'."),
    statusLabel: str("A status badge for the screen, 1-2 words."),
    metrics: { type: "array", items: obj({ label: str("Metric name, 1-3 words."), value: str("Short value with units.") }), description: "Exactly 3." },
    table: obj({
      columns: { type: "array", items: { type: "string" }, description: "Exactly 4 column headers: name, detail, value, status." },
      rows: {
        type: "array",
        description: "Exactly 4 rows of realistic data.",
        items: obj({ name: str("Row name."), detail: str("Secondary detail."), value: str("A number with units."), status: { type: "string", enum: ["ok", "review"] } }),
      },
    }),
    chat: obj({
      question: str("A user's question to the product's assistant."),
      tool: str("snake_case tool name the assistant calls."),
      toolArgs: str("The tool's arguments, as short key: value pairs."),
      answer: str("The assistant's answer, two sentences with specific numbers."),
      followUp: str("One short follow-up sentence."),
    }),
    code: obj({ comment: str("A shell comment starting with #."), command: str("A plausible CLI or curl command for the product.") }),
    sms: {
      type: "array",
      description: "Exactly 3 text messages between the business and a customer, plain text, no markdown.",
      items: obj({ from: { type: "string", enum: ["business", "customer"] }, text: str("Under 160 characters.") }),
    },
    card: obj({ title: str("Title of an image card sent by text message, 2-4 words."), body: str("One line under 40 characters."), metric: str("A key number with a short label.") }),
  });
}

/** Merge model-written copy over defaults, keeping shapes the previews rely on. */
export function mergeCopy(base: SpecimenCopy, partial: Partial<SpecimenCopy>): SpecimenCopy {
  const out: SpecimenCopy = { ...base, ...partial } as SpecimenCopy;
  out.nav = (partial.nav ?? base.nav).slice(0, 5);
  while (out.nav.length < 5) out.nav.push(base.nav[out.nav.length]!);
  out.metrics = (partial.metrics ?? base.metrics).slice(0, 3);
  const rows = (partial.table?.rows ?? base.table.rows).slice(0, 4);
  const cols = (partial.table?.columns ?? base.table.columns).slice(0, 4);
  out.table = { columns: (cols.length === 4 ? cols : base.table.columns) as SpecimenCopy["table"]["columns"], rows: rows.length ? rows : base.table.rows };
  out.sms = (partial.sms ?? base.sms).slice(0, 4);
  out.chat = { ...base.chat, ...(partial.chat ?? {}) };
  out.code = { ...base.code, ...(partial.code ?? {}) };
  out.card = { ...base.card, ...(partial.card ?? {}) };
  return out;
}
