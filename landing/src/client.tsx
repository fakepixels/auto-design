import { hydrateRoot } from "react-dom/client";

import { Showcase } from "./showcase";

// The showcase is prerendered on its own, so it hydrates as its own root.
const root = document.getElementById("showcase");
if (root) hydrateRoot(root, <Showcase />);
