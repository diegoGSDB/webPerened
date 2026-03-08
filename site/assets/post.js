(() => {
const { PB_BASE, POSTS_COLLECTION } = window.APP_CONFIG;

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function fileUrl(record, filename) {
  return `${PB_BASE}/api/files/${POSTS_COLLECTION}/${record.id}/${filename}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
}

function normalizeExternalUrl(raw) {
  const input = String(raw ?? "").trim();
  if (!input) return "";
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(withProtocol, window.location.origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

function getPostExternalUrl(post) {
  const candidates = [post?.url, post?.link, post?.external_url, post?.article_url];
  for (const value of candidates) {
    const normalized = normalizeExternalUrl(value);
    if (normalized) return normalized;
  }
  return "";
}

function bindOpenInNewTab(el, href, ariaLabel) {
  if (!el || !href) return;
  const openTarget = () => window.open(href, "_blank", "noopener,noreferrer");
  el.classList.add("newtab-linkable");
  el.setAttribute("role", "link");
  el.setAttribute("tabindex", "0");
  if (ariaLabel) el.setAttribute("aria-label", ariaLabel);
  el.addEventListener("click", openTarget);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openTarget();
    }
  });
}

async function fetchById(id) {
  const url = `${PB_BASE}/api/collections/${POSTS_COLLECTION}/records/${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error API (${res.status})`);
  return res.json();
}

function setupBurgerMenu() {
  const burger = document.getElementById("burgerToggle");
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (!burger || !sidebar || !overlay) return;

  burger.setAttribute("aria-expanded", "false");

  const close = () => {
    document.body.classList.remove("sidebar-open");
    burger.setAttribute("aria-expanded", "false");
  };

  burger.addEventListener("click", () => {
    const opened = document.body.classList.toggle("sidebar-open");
    burger.setAttribute("aria-expanded", opened ? "true" : "false");
  });
  overlay.addEventListener("click", close);
  sidebar.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
}

function forceLinksInNewTab(root) {
  if (!root) return;
  root.querySelectorAll("a[href]").forEach(a => {
    a.setAttribute("target", "_blank");
    const rel = new Set(String(a.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
    rel.add("noopener");
    rel.add("noreferrer");
    a.setAttribute("rel", Array.from(rel).join(" "));
  });
}

async function init() {
  const id = getParam("id");
  const msg = document.getElementById("msg");
  const body = document.getElementById("body");
  const cover = document.getElementById("cover");

  setupBurgerMenu();

  if (!id) {
    msg.innerHTML = `<div class="error">Falta el parámetro <b>id</b>.</div>`;
    return;
  }

  try {
    const p = await fetchById(id);

    if (!p?.published) {
      msg.innerHTML = `<div class="error">Artículo no publicado.</div>`;
      return;
    }

    const title = p.title || "Artículo";
    const detailUrl = `/post/?id=${encodeURIComponent(p.id)}`;
    const openUrl = getPostExternalUrl(p) || detailUrl;

    document.title = title;
    document.getElementById("subtitle").textContent = title;
    const h1 = document.getElementById("h1");
    h1.textContent = title;
    document.getElementById("crumb").textContent = p.title || "Detalle";
    bindOpenInNewTab(h1, openUrl, "Abrir enlace del artículo en una nueva pestaña");

    if (p.cover) {
      cover.src = fileUrl(p, p.cover);
      cover.style.display = "block";
      bindOpenInNewTab(cover, openUrl, "Abrir enlace del artículo en una nueva pestaña");
    }

    document.getElementById("meta").textContent = fmtDate(p.published_at);
    // content aquí viene como HTML (rich text). Si lo guardas como markdown, habría que convertirlo.
    const content = document.getElementById("content");
    content.innerHTML = p.content ?? "";
    forceLinksInNewTab(content);

    msg.innerHTML = "";
    body.style.display = "block";
    setupBurgerMenu();
  } catch (e) {
    msg.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

init();
})();
