import { renderToStaticMarkup, renderToString } from "react-dom/server";

import { CodeBlock } from "@/components/ui/code-block";
import { Page, START } from "./page";
import { Showcase } from "./showcase";

export { DESCRIPTION, TITLE } from "./page";

/**
 * The page's body markup. The showcase renders as its own root, so the browser can hydrate it alone; the
 * rest of the page is static. CodeBlock is async (Shiki), so it renders first and goes in as an element.
 */
export async function render(): Promise<string> {
  const start = await CodeBlock({ code: START, lang: "sh", className: "rounded-none border-0 [&_pre]:pt-1" });
  const showcase = renderToString(<Showcase />);
  return renderToStaticMarkup(<Page start={start} showcase={showcase} />);
}
