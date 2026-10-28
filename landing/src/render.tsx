import { renderToStaticMarkup } from "react-dom/server";

import { CodeBlock } from "@/components/ui/code-block";
import { Page, START } from "./page";

export { DESCRIPTION, TITLE } from "./page";

/** The page's body markup. CodeBlock is async (Shiki), so it renders first and goes in as an element. */
export async function render(): Promise<string> {
  const start = await CodeBlock({ code: START, lang: "sh", className: "rounded-none border-0 [&_pre]:pt-1" });
  return renderToStaticMarkup(<Page start={start} />);
}
