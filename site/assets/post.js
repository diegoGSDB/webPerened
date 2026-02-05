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

    document.title = p.title || "Artículo";
    document.getElementById("subtitle").textContent = p.title || "Artículo";
    document.getElementById("h1").textContent = p.title || "Artículo";
    document.getElementById("crumb").textContent = p.title || "Detalle";

    if (p.cover) {
      cover.src = fileUrl(p, p.cover);
      cover.style.display = "block";
    }

    document.getElementById("meta").textContent = fmtDate(p.published_at);
    // content aquí viene como HTML (rich text). Si lo guardas como markdown, habría que convertirlo.
    document.getElementById("content").innerHTML = p.content ?? "";

    msg.innerHTML = "";
    body.style.display = "block";
    setupBurgerMenu();
  } catch (e) {
    msg.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

init();
})();
