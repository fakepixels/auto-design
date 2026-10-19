// The design site's own behavior: copy buttons, tabs, color mode, search, the
// mobile menu and the motion demos. Plain DOM, no framework: live component
// examples hydrate separately from previews.js.
const html = document.documentElement;
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

// Commands show this site's own address, so they work wherever it's hosted.
const origin = new URL(html.dataset.root || "./", location.href).href.replace(/\/$/, "");
for (const el of $$("[data-origin]")) el.textContent = origin;
for (const el of $$("[data-copy]")) el.dataset.copy = el.dataset.copy.split("{origin}").join(origin);
for (const a of $$("a[href*='{root}']")) a.setAttribute("href", a.getAttribute("href").split("{root}").join(html.dataset.root || "./"));

const ICON_COPY = $$("[data-copy]")[0]?.innerHTML;
const ICON_DONE =
  '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

document.addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      copy.innerHTML = ICON_DONE;
      copy.setAttribute("aria-label", "Copied");
      setTimeout(() => {
        copy.innerHTML = ICON_COPY;
        copy.setAttribute("aria-label", "Copy");
      }, 1500);
    } catch {
      // Clipboard needs a secure context; the text stays selectable.
    }
    return;
  }

  const tab = e.target.closest("[data-tab]");
  if (tab) {
    const root = tab.closest("[data-tabs]");
    for (const t of $$(":scope > [role=tablist] > [data-tab]", root)) t.setAttribute("aria-selected", String(t === tab));
    for (const panel of $$(":scope > [data-panel]", root)) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    return;
  }

  if (e.target.closest("[data-theme]")) {
    const cls = html.dataset.modeClass;
    const on = html.classList.toggle(cls);
    const mode = on ? cls : html.dataset.defaultMode;
    try {
      localStorage.setItem(html.dataset.storageKey, mode);
    } catch {
      // Private windows can refuse storage; the mode still switches for this page.
    }
    return;
  }

  if (e.target.closest("[data-menu]")) return toggleSheet(true);
  if (e.target.closest("[data-sheet-close]")) return toggleSheet(false);
  if (e.target.closest("[data-search]")) return openPalette();
  if (e.target.closest("[data-palette-close]")) return closePalette();

  const demo = e.target.closest("[data-motion-demo]");
  if (demo) {
    const dot = demo.querySelector("[data-dot]");
    const track = dot.parentElement;
    const moved = dot.dataset.moved === "1";
    dot.style.transform = moved ? "" : `translateX(${track.clientWidth - dot.offsetWidth - 8}px)`;
    dot.dataset.moved = moved ? "0" : "1";
    return;
  }

  if (e.target.closest("[data-replay]")) {
    const target = document.querySelector("[data-replay-target]");
    target.classList.remove("animate-enter");
    void target.offsetWidth;
    target.classList.add("animate-enter");
  }
});

/* ---------- Mobile menu ---------- */

const sheet = document.querySelector("[data-sheet]");
function toggleSheet(open) {
  if (!sheet) return;
  sheet.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
}

/* ---------- Search ---------- */

const palette = document.querySelector("[data-palette]");
const input = document.querySelector("[data-palette-input]");
const list = document.querySelector("[data-palette-list]");
const empty = document.querySelector("[data-palette-empty]");
let index = [];
try {
  index = JSON.parse(document.getElementById("search-index").textContent);
} catch {
  index = [];
}
let active = 0;
let results = [];

function draw() {
  const q = input.value.trim().toLowerCase();
  results = index.filter((i) => !q || i.title.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)).slice(0, 50);
  active = Math.min(active, Math.max(0, results.length - 1));
  empty.hidden = results.length > 0;
  list.innerHTML = "";
  let group = "";
  results.forEach((r, i) => {
    if (r.group !== group) {
      group = r.group;
      const h = document.createElement("li");
      h.className = "px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground first:pt-1";
      h.textContent = group;
      h.setAttribute("role", "presentation");
      list.append(h);
    }
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = (html.dataset.root || "./") + r.path;
    a.textContent = r.title;
    a.setAttribute("role", "option");
    a.setAttribute("aria-selected", String(i === active));
    a.className = "block rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground";
    a.addEventListener("mousemove", () => {
      if (active !== i) {
        active = i;
        mark();
      }
    });
    li.append(a);
    list.append(li);
  });
}

function mark() {
  $$("[role=option]", list).forEach((a, i) => a.setAttribute("aria-selected", String(i === active)));
  $$("[role=option]", list)[active]?.scrollIntoView({ block: "nearest" });
}

function openPalette() {
  if (!palette) return;
  palette.hidden = false;
  input.value = "";
  active = 0;
  draw();
  input.focus();
}

function closePalette() {
  if (palette) palette.hidden = true;
}

input?.addEventListener("input", () => {
  active = 0;
  draw();
});

document.addEventListener("keydown", (e) => {
  if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName ?? "") && !document.activeElement?.isContentEditable)) {
    e.preventDefault();
    palette?.hidden ? openPalette() : closePalette();
    return;
  }
  if (e.key === "Escape") {
    closePalette();
    toggleSheet(false);
    return;
  }
  if (palette && !palette.hidden) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(1, results.length);
      mark();
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      location.href = (html.dataset.root || "./") + results[active].path;
    }
  }
});

/* ---------- On this page ---------- */

const tocLinks = $$("[data-toc]");
if (tocLinks.length && "IntersectionObserver" in window) {
  const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.getAttribute("href").slice(1)), a]));
  const visible = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) en.isIntersecting ? visible.add(en.target.id) : visible.delete(en.target.id);
      const first = [...byId.keys()].find((id) => visible.has(id));
      if (!first) return;
      for (const [id, a] of byId) {
        a.classList.toggle("text-foreground", id === first);
        a.classList.toggle("text-muted-foreground", id !== first);
      }
    },
    { rootMargin: "-64px 0px -60% 0px" },
  );
  for (const id of byId.keys()) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
}
