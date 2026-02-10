const {
  PB_BASE,
  POSTS_COLLECTION,
  TEAM_COLLECTION,
  SETTINGS_COLLECTION,
  DIMENSIONS_COLLECTION,
  EDITORS_COLLECTION,
  LINKS_COLLECTION,
  LOGOS_COLLECTION
} = window.APP_CONFIG;

const TOKEN_KEY = "pb_editor_token";
const ALLOWED_TAGS = ["Noticias e Informes", "Artículos", "Libros", "Revistas", "Enlaces", "Seminarios", "Formación"];
let SETTINGS_ID = null;
let currentSettings = null;
let currentSection = "posts";
let CURRENT_DIMENSION_ID = null;
let CURRENT_EDITOR_ID = null;
let editorsCache = [];
let currentEditorTeamId = null;
let CURRENT_MEMBER_ID = null;
let CURRENT_POST_ID = null;
const ADMIN_PAGE_SIZE = 10;
let TEAM_PAGE = 1;
let POSTS_PAGE = 1;
const RTE_INSTANCES = [];
function setTeamSubmitLabel(){
  const btn = document.getElementById("teamSubmitBtn");
  if (!btn) return;
  btn.textContent = CURRENT_MEMBER_ID ? "Guardar cambios" : "Añadir miembro";
}
function setPostSubmitLabel(){
  const btn = document.getElementById("postSubmitBtn");
  if (!btn) return;
  btn.textContent = CURRENT_POST_ID ? "Guardar cambios" : "Publicar";
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function syncRtePair(textarea, editor) {
  textarea.value = (editor.innerHTML || "").trim();
}

function setRteContent(textarea, html) {
  textarea.value = html || "";
  const inst = RTE_INSTANCES.find(i => i.textarea === textarea);
  if (inst) inst.editor.innerHTML = html || "";
}

function createRteToolbar(textarea) {
  if (!textarea || textarea.dataset.rteReady === "1") return;
  textarea.dataset.rteReady = "1";

  const wrapper = document.createElement("div");
  wrapper.className = "rte-wrapper";

  const toolbar = document.createElement("div");
  toolbar.className = "rte-toolbar";

  const editor = document.createElement("div");
  editor.className = "rte-editor";
  editor.contentEditable = "true";
  editor.innerHTML = textarea.value || "";

  const cmds = [
    { label: "B", title: "Negrita", cmd: "bold" },
    { label: "I", title: "Cursiva", cmd: "italic" },
    { label: "P", title: "Párrafo", action: () => document.execCommand("formatBlock", false, "p") },
    { label: "Lista", title: "Lista con viñetas", cmd: "insertUnorderedList" },
    { label: "Cita", title: "Cita / bloque", action: () => document.execCommand("formatBlock", false, "blockquote") },
    {
      label: "Link",
      title: "Insertar enlace",
      action: () => {
        const url = prompt("URL del enlace:", "https://");
        if (!url) return;
        document.execCommand("createLink", false, escAttr(url));
      }
    },
    { label: "✕", title: "Quitar formato", cmd: "removeFormat" }
  ];

  cmds.forEach(cfg => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rte-btn";
    btn.title = cfg.title;
    btn.textContent = cfg.label;
    btn.addEventListener("click", () => {
      editor.focus();
      if (cfg.cmd) document.execCommand(cfg.cmd, false, null);
      if (cfg.action) cfg.action();
      syncRtePair(textarea, editor);
    });
    toolbar.appendChild(btn);
  });

  editor.addEventListener("input", () => syncRtePair(textarea, editor));
  editor.addEventListener("blur", () => syncRtePair(textarea, editor));

  // Montar en DOM: wrapper -> toolbar + editor, textarea queda oculto
  textarea.style.display = "none";
  const parent = textarea.parentNode;
  parent.insertBefore(wrapper, textarea);
  wrapper.appendChild(toolbar);
  wrapper.appendChild(editor);
  wrapper.appendChild(textarea); // mantenemos textarea para el form

  RTE_INSTANCES.push({ textarea, editor });
}

function setupRichTextEditors() {
  document.querySelectorAll("textarea[data-rte]").forEach(createRteToolbar);
  // Sincroniza antes de cada submit
  document.querySelectorAll("form").forEach(form => {
    form.addEventListener("submit", () => {
      RTE_INSTANCES.forEach(({ textarea, editor }) => syncRtePair(textarea, editor));
    });
  });
}

function fileUrl(collection, record, filename) {
  return `${PB_BASE}/api/files/${collection}/${record.id}/${filename}`;
}

function setBox(elId, html, kind="notice") {
  const el = document.getElementById(elId);
  el.innerHTML = `<div class="${kind}">${html}</div>`;
}

function slugify(str) {
  return String(str ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function token() { return localStorage.getItem(TOKEN_KEY); }
function logout() { localStorage.removeItem(TOKEN_KEY); CURRENT_EDITOR_ID = null; }
function currentUserEmail() {
  const me = editorsCache.find(e => e.id === CURRENT_EDITOR_ID);
  return me?.email || "";
}

async function pbLogin(email, password) {
  const url = `${PB_BASE}/api/collections/${EDITORS_COLLECTION}/auth-with-password`;
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ identity: email, password })
  });
  if (!res.ok) throw new Error(`Login falló (${res.status})`);
  const data = await res.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  CURRENT_EDITOR_ID = data?.record?.id || null;
  await pbAuthRefresh().catch(() => {}); // opcional, no bloquear login
  await setCurrentEditorTeamId();
  // cache email para mostrar en header
  if (data?.record) {
    editorsCache = editorsCache.filter(e => e.id !== data.record.id).concat(data.record);
    showEditorUI(true);
  }
  return data;
}

async function pbAuthRefresh() {
  const url = `${PB_BASE}/api/collections/${EDITORS_COLLECTION}/auth-refresh`;
  const res = await fetch(url, { method: "POST", headers: { "Authorization": `Bearer ${token()}` } });
  if (!res.ok) throw new Error(`Auth refresh falló (${res.status})`);
  const data = await res.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  CURRENT_EDITOR_ID = data?.record?.id || CURRENT_EDITOR_ID;
  // cache minimal editor record
  if (data?.record) {
    editorsCache = editorsCache.filter(e => e.id !== data.record.id).concat(data.record);
  }
  await setCurrentEditorTeamId();
  showEditorUI(!!token());
  return data;
}

async function pbCreate(collection, formData) {
  const url = `${PB_BASE}/api/collections/${collection}/records`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token()}` },
    body: formData
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Error (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function pbUpdate(collection, id, formData) {
  const url = `${PB_BASE}/api/collections/${collection}/records/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token()}` },
    body: formData
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Error (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function pbDelete(collection, id) {
  const url = `${PB_BASE}/api/collections/${collection}/records/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token()}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete error (${res.status}): ${text}`);
  }
}

async function pbList(collection, perPage=50, sort="", filter="") {
  let url = `${PB_BASE}/api/collections/${collection}/records?perPage=${perPage}`;
  if (sort) url += `&sort=${encodeURIComponent(sort)}`;
  if (filter) url += `&filter=${encodeURIComponent(filter)}`;
  const res = await fetch(url, {
    headers: token() ? { "Authorization": `Bearer ${token()}` } : {}
  });
  if (!res.ok) throw new Error(`List error (${res.status})`);
  return res.json();
}

function showEditorUI(isLogged) {
  document.getElementById("loginBox").style.display = isLogged ? "none" : "block";
  document.getElementById("editorBox").style.display = isLogged ? "block" : "none";
  const state = document.getElementById("state");
  state.className = "notice";
  state.textContent = isLogged ? "Sesión activa. Puedes administrar contenido." : "Inicia sesión para administrar.";
  const loggedUser = document.getElementById("loggedUser");
  if (loggedUser) {
    loggedUser.style.display = isLogged ? "block" : "none";
    loggedUser.textContent = isLogged ? `Editor: ${esc(currentUserEmail() || "")}` : "";
  }
}

async function loadSettingsIntoForm() {
  // Cogemos el primer registro (idealmente solo hay uno)
  const data = await pbList(SETTINGS_COLLECTION, 1);
  const s = data.items?.[0] || null;
  if (!s) {
    // si no existe, lo creas vacío desde el panel o lo creamos aquí
    SETTINGS_ID = null;
    currentSettings = null;
    const descForm = document.getElementById("descriptionForm");
    if (descForm) {
      descForm.project_description.value = "";
      setRteContent(descForm.project_description, "");
    }
    renderSettingsUploads(null);
    return;
  }
  SETTINGS_ID = s.id;
  currentSettings = s;

  const form = document.getElementById("settingsForm");
  form.site_name.value = s.site_name || "";
  form.hero_title.value = s.hero_title || "";
  form.hero_subtitle.value = s.hero_subtitle || "";

  const descForm = document.getElementById("descriptionForm");
  if (descForm) {
    descForm.project_description.value = s.project_description || "";
    setRteContent(descForm.project_description, s.project_description || "");
  }

  renderSettingsUploads(s);
  const footerField = document.getElementById("footerContactField");
  if (footerField) setRteContent(footerField, s.contact_html || "");
}

function renderSettingsUploads(s) {
  const box = document.getElementById("settingsUploads");
  if (!box) return;

  if (!token()) {
    box.innerHTML = `<div class="notice">Inicia sesión para ver las imágenes subidas.</div>`;
    return;
  }

  if (!s) {
    box.innerHTML = `<div class="notice">Todavía no hay registro de portada. Guarda uno para empezar.</div>`;
    return;
  }

  const heroImgs = Array.isArray(s.hero_images) ? s.hero_images : [];
  const logoHtml = s.logo
    ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
         <img src="${fileUrl(SETTINGS_COLLECTION, s, s.logo)}" alt="Logo superior" style="width:70px;height:70px;object-fit:contain;border:1px solid var(--border);border-radius:10px;background:#fff;" />
         <div>
           <div class="small">Logo superior actual</div>
           <button class="btn" type="button" data-del-logo>Eliminar logo superior</button>
         </div>
       </div>`
    : `<div class="muted small">Sin logo superior cargado.</div>`;

  const heroHtml = heroImgs.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-top:10px;">
        ${heroImgs.map(fn => `
          <div style="border:1px solid var(--border);border-radius:10px;padding:6px;text-align:center;background:#fff;">
            <img src="${fileUrl(SETTINGS_COLLECTION, s, fn)}" alt="" style="width:100%;height:90px;object-fit:cover;border-radius:8px;border:1px solid #eee;">
            <button class="btn" type="button" data-del-hero="${esc(fn)}" style="margin-top:6px;width:100%;">Eliminar</button>
          </div>
        `).join("")}
       </div>`
    : `<div class="muted small">Sin imágenes de galería.</div>`;

  box.innerHTML = `
    <h3 style="margin:16px 0 8px;">Imágenes actuales</h3>
    <div class="notice">
      <div style="margin-bottom:8px;"><b>Logo superior</b></div>
      ${logoHtml}
      <hr />
      <div style="margin-bottom:8px;"><b>Galería / hero</b></div>
      ${heroHtml}
    </div>
  `;

  box.querySelector("[data-del-logo]")?.addEventListener("click", deleteLogo);
  box.querySelectorAll("[data-del-hero]").forEach(btn => {
    btn.addEventListener("click", () => deleteHeroImage(btn.getAttribute("data-del-hero")));
  });
}

async function saveProjectDescription(e) {
  e.preventDefault();
  if (!token()) return;
  const fd = new FormData(e.target);
  const payload = new FormData();
  payload.append("project_description", String(fd.get("project_description") || ""));

  try {
    if (!SETTINGS_ID) {
      const created = await pbCreate(SETTINGS_COLLECTION, payload);
      SETTINGS_ID = created.id;
      currentSettings = created;
    } else {
      const updated = await pbUpdate(SETTINGS_COLLECTION, SETTINGS_ID, payload);
      currentSettings = { ...currentSettings, ...updated };
    }
    setBox("descriptionResult", "Descripción guardada.", "success");
    await loadSettingsIntoForm();
  } catch (e) {
    setBox("descriptionResult", esc(e.message), "error");
  }
}

function setupSectionTabs() {
  const links = Array.from(document.querySelectorAll(".sidebar .menu a[data-section]"));
  const sections = Array.from(document.querySelectorAll(".admin-section"));
  if (!links.length || !sections.length) return;

  function show(sectionId) {
    currentSection = sectionId;
    sections.forEach(sec => sec.classList.toggle("active", sec.dataset.section === sectionId));
    links.forEach(a => a.classList.toggle("active", a.dataset.section === sectionId));
    if (sectionId === "editors" && token()) {
      refreshEditorsList();
    }
    if (sectionId === "team" && token()) {
      loadMembersDropdown();
      loadEditorsDropdownForTeam();
    }
  }

  links.forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      show(a.dataset.section);
    });
  });

  const initial = links.find(a => a.classList.contains("active"))?.dataset.section || sections[0].dataset.section;
  show(initial);
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

async function deleteLogo() {
  if (!SETTINGS_ID) {
    setBox("settingsResult", "No hay registro de portada para editar.", "error");
    return;
  }
  const fd = new FormData();
  fd.append("logo", "");
  try {
    await pbUpdate(SETTINGS_COLLECTION, SETTINGS_ID, fd);
    if (currentSettings) currentSettings.logo = null;
    setBox("settingsResult", "Logo eliminado.", "success");
    await loadSettingsIntoForm();
  } catch (e) {
    setBox("settingsResult", esc(e.message), "error");
  }
}

async function deleteHeroImage(filename) {
  if (!SETTINGS_ID || !filename) return;
  const keep = (currentSettings?.hero_images || []).filter(fn => fn !== filename);
  const fd = new FormData();
  for (const fn of keep) fd.append("hero_images", fn);

  try {
    await pbUpdate(SETTINGS_COLLECTION, SETTINGS_ID, fd);
    if (currentSettings) currentSettings.hero_images = keep;
    setBox("settingsResult", "Imagen eliminada.", "success");
    await loadSettingsIntoForm();
  } catch (e) {
    setBox("settingsResult", esc(e.message), "error");
  }
}

async function refreshTeamList() {
  const data = await pbList(TEAM_COLLECTION, 100, "order,name");
  const items = data.items || [];
  const box = document.getElementById("teamList");

  if (!items.length) {
    box.innerHTML = `<div class="notice">No hay miembros todavía.</div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(items.length / ADMIN_PAGE_SIZE));
  if (TEAM_PAGE > totalPages) TEAM_PAGE = totalPages;
  if (TEAM_PAGE < 1) TEAM_PAGE = 1;
  const start = (TEAM_PAGE - 1) * ADMIN_PAGE_SIZE;
  const pageItems = items.slice(start, start + ADMIN_PAGE_SIZE);

  box.innerHTML = `
    <div class="notice">
      ${pageItems.map(m => `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #e6e6e6">
          <div>
            <b>${esc(m.name)}</b> — <span class="small">${esc(m.role)}</span>
            <div class="small">order=${esc(m.order ?? "")} · active=${esc(m.active)}</div>
          </div>
          <button class="btn" data-del="${esc(m.id)}" type="button">Eliminar</button>
        </div>
      `).join("")}
    </div>
    ${renderPager(items.length, TEAM_PAGE, ADMIN_PAGE_SIZE, "team")}
  `;

  attachPagerHandlers(box, "team", (p) => {
    TEAM_PAGE = p;
    refreshTeamList();
  });

  box.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await pbDelete(TEAM_COLLECTION, btn.getAttribute("data-del"));
        if (CURRENT_MEMBER_ID === btn.getAttribute("data-del")) {
          CURRENT_MEMBER_ID = null;
          const form = document.getElementById("teamForm");
          form?.reset();
          if (form?.bio) setRteContent(form.bio, "");
          setTeamSubmitLabel();
        }
        await refreshTeamList();
        await loadMembersDropdown();
      } catch (e) {
        setBox("teamResult", esc(e.message), "error");
      }
    });
  });
}

// ---------- Links de miembro ----------
function addLinkRow(title = "", link = "") {
  const container = document.getElementById("linkRows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "link-row";
  row.innerHTML = `
    <div>
      <label style="font-size:12px;color:#666;">Título</label>
      <input name="linkTitle" value="${escAttr(title)}" placeholder="Ej: ORCID, Web personal" />
    </div>
    <div>
      <label style="font-size:12px;color:#666;">URL</label>
      <input name="linkUrl" type="url" value="${escAttr(link)}" placeholder="https://..." />
    </div>
    <button class="btn" type="button" aria-label="Eliminar link">Eliminar</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  container.appendChild(row);
}

function setLinkRows(data = []) {
  const container = document.getElementById("linkRows");
  if (!container) return;
  container.innerHTML = "";
  if (!data.length) {
    addLinkRow();
    return;
  }
  data.forEach(l => addLinkRow(l.title || "", l.link || ""));
}

function collectLinkRows() {
  const container = document.getElementById("linkRows");
  if (!container) return [];
  const rows = Array.from(container.querySelectorAll(".link-row"));
  return rows
    .map(r => {
      const title = String(r.querySelector("input[name='linkTitle']")?.value || "").trim();
      const url = String(r.querySelector("input[name='linkUrl']")?.value || "").trim();
      return { title, link: url };
    })
    .filter(l => l.link);
}

async function deleteMemberLinks(memberId) {
  if (!memberId) return;
  try {
    let page = 1;
    while (true) {
      const url = `${PB_BASE}/api/collections/${LINKS_COLLECTION}/records?perPage=200&page=${page}&filter=${encodeURIComponent(`miembro="${memberId}"`)}`;
      const res = await fetch(url, { headers: token() ? { "Authorization": `Bearer ${token()}` } : {} });
      if (!res.ok) break;
      const data = await res.json();
      const items = data.items || [];
      if (!items.length) break;
      for (const l of items) {
        await pbDelete(LINKS_COLLECTION, l.id);
      }
      if (!data.totalItems || items.length < 200) break;
      page += 1;
    }
  } catch (e) {
    console.warn("No se pudieron borrar links previos", e);
  }
}

async function saveMemberLinks(memberId, links) {
  if (!memberId || !links?.length) return;
  for (const l of links) {
    const payload = new FormData();
    payload.append("miembro", memberId);
    payload.append("link", l.link);
    payload.append("title", l.title || l.link);
    await pbCreate(LINKS_COLLECTION, payload);
  }
}

function setPhotoPreview(url) {
  const box = document.getElementById("photoPreview");
  if (!box) return;
  if (url) {
    box.innerHTML = `<img src="${escAttr(url)}" alt="Foto actual"> <span class="small muted">Foto actual. Selecciona un archivo para reemplazarla.</span>`;
  } else {
    box.innerHTML = `Sin foto actual.`;
  }
}

function renderPager(totalItems, currentPage, perPage, dataKey) {
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  if (totalPages <= 1) return "";
  let buttons = "";
  for (let p = 1; p <= totalPages; p++) {
    const active = p === currentPage ? " active" : "";
    const aria = p === currentPage ? ` aria-current="page"` : "";
    buttons += `<button class="btn pager-btn${active}" type="button" data-${dataKey}-page="${p}"${aria}>${p}</button>`;
  }
  const prevDisabled = currentPage <= 1 ? " disabled" : "";
  const nextDisabled = currentPage >= totalPages ? " disabled" : "";
  return `
    <div class="pager">
      <button class="btn pager-nav" type="button" data-${dataKey}-page="${currentPage - 1}"${prevDisabled}>Anterior</button>
      ${buttons}
      <button class="btn pager-nav" type="button" data-${dataKey}-page="${currentPage + 1}"${nextDisabled}>Siguiente</button>
    </div>
  `;
}

function attachPagerHandlers(box, dataKey, onPage) {
  box.querySelectorAll(`[data-${dataKey}-page]`).forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const next = Number(btn.getAttribute(`data-${dataKey}-page`));
      if (!Number.isFinite(next) || next < 1) return;
      onPage(next);
    });
  });
}

// Footer helpers
async function refreshFooterLogosList() {
  const box = document.getElementById("footerLogosList");
  if (!box) return;
  try {
    const data = await pbList(LOGOS_COLLECTION, 200, "orden");
    const items = data.items || [];
    if (!items.length) {
      box.innerHTML = `<div class="notice">No hay logos en el footer.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="notice">
        ${items.map(l => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #e6e6e6;">
            <img src="${fileUrl(LOGOS_COLLECTION, l, l.logo)}" alt="" style="height:40px;width:auto;border:1px solid #ddd;border-radius:8px;padding:4px;background:#fff;">
            <div style="flex:1;">
              <div><b>Orden:</b> ${esc(l.orden ?? "")}</div>
              ${l.link ? `<div class="small muted">${esc(l.link)}</div>` : ""}
            </div>
            <button class="btn" type="button" data-del-footer-logo="${esc(l.id)}">Eliminar</button>
          </div>
        `).join("")}
      </div>
    `;
    box.querySelectorAll("[data-del-footer-logo]").forEach(btn => {
      btn.addEventListener("click", () => deleteFooterLogo(btn.getAttribute("data-del-footer-logo")));
    });
  } catch (e) {
    box.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

async function deleteFooterLogo(id) {
  if (!id) return;
  try {
    await pbDelete(LOGOS_COLLECTION, id);
    await refreshFooterLogosList();
    setBox("footerLogoResult", "Logo eliminado.", "success");
  } catch (e) {
    setBox("footerLogoResult", esc(e.message), "error");
  }
}

async function saveFooterLogo(e) {
  e.preventDefault();
  if (!token()) return;
  const fd = new FormData(e.target);
  const payload = new FormData();
  const orden = fd.get("orden");
  if (orden) payload.append("orden", orden);
  const link = fd.get("link");
  if (link) payload.append("link", link);
  const logo = fd.get("logo");
  if (logo && logo instanceof File && logo.size > 0) payload.append("logo", logo);

  try {
    await pbCreate(LOGOS_COLLECTION, payload);
    setBox("footerLogoResult", "Logo añadido.", "success");
    e.target.reset();
    await refreshFooterLogosList();
  } catch (err) {
    setBox("footerLogoResult", esc(err.message), "error");
  }
}

async function saveFooterContact(e) {
  e.preventDefault();
  if (!token()) return;
  const form = e.target;
  const fd = new FormData(form);
  const html = String(fd.get("contact_html") || "");
  const payload = new FormData();
  payload.append("contact_html", html);

  try {
    if (!SETTINGS_ID) {
      const created = await pbCreate(SETTINGS_COLLECTION, payload);
      SETTINGS_ID = created.id;
      currentSettings = created;
    } else {
      await pbUpdate(SETTINGS_COLLECTION, SETTINGS_ID, payload);
      if (currentSettings) currentSettings.contact_html = html;
    }
    setBox("footerContactResult", "Contacto guardado.", "success");
  } catch (err) {
    setBox("footerContactResult", esc(err.message), "error");
  }
}

async function loadMembersDropdown() {
  const select = document.getElementById("memberSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Cargando…</option>`;

  try {
    const url = `${PB_BASE}/api/collections/${TEAM_COLLECTION}/records?perPage=200&sort=${encodeURIComponent("order,name")}`;
    const res = await fetch(url, { headers: token() ? { "Authorization": `Bearer ${token()}` } : {} });
    if (!res.ok) throw new Error(`List error (${res.status})`);
    const data = await res.json();
    const items = data.items || [];

    if (!items.length) {
      select.innerHTML = `<option value="">(No hay miembros)</option>`;
      return;
    }

    select.innerHTML = `<option value="">Selecciona un miembro…</option>` + items
      .map(m => {
        const visible = !!m.active;
        const label = `${visible ? "Visible" : "No visible"} — ${m.name || "(sin nombre)"}${m.order != null ? ` (orden ${m.order})` : ""}`;
        return `<option value="${m.id}">${esc(label)}</option>`;
      })
      .join("");
    if (CURRENT_MEMBER_ID) {
      select.value = CURRENT_MEMBER_ID;
    }
  } catch (e) {
    select.innerHTML = `<option value="">(Error cargando miembros)</option>`;
    setBox("teamResult", esc(e.message), "error");
  }
  setTeamSubmitLabel();
}

async function loadMemberIntoForm(id) {
  const form = document.getElementById("teamForm");
  if (!form) return;
  if (!id) {
    setBox("teamResult", "Selecciona un miembro primero.", "notice");
    CURRENT_MEMBER_ID = null;
    setTeamSubmitLabel();
    setPhotoPreview(null);
    return;
  }
  try {
    const url = `${PB_BASE}/api/collections/${TEAM_COLLECTION}/records/${encodeURIComponent(id)}`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token()}` } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`No se pudo cargar (${res.status}): ${text}`);
    }
    const m = await res.json();
    CURRENT_MEMBER_ID = m.id;
    form.name.value = m.name || "";
    form.role.value = m.role || "";
    if (form.order) form.order.value = m.order ?? "";
    form.bio.value = m.bio || "";
    setRteContent(form.bio, m.bio || "");
    if (form.descripcion_corta) {
      form.descripcion_corta.value = m.descripcion_corta || "";
      setRteContent(form.descripcion_corta, m.descripcion_corta || "");
    }
    form.active.checked = !!m.active;
    const editorSel = document.getElementById("editorRefSelect");
    if (editorSel) editorSel.value = m.editor || "";
    try {
      const filter = `miembro="${m.id}"`;
      const linksData = await pbList(LINKS_COLLECTION, 200, "", filter);
      setLinkRows(linksData.items || []);
    } catch {
      setLinkRows([]);
    }
    setPhotoPreview(m.photo ? fileUrl(TEAM_COLLECTION, m, m.photo) : null);
    const select = document.getElementById("memberSelect");
    if (select) select.value = m.id;
    setTeamSubmitLabel();
    setBox("teamResult", `Cargado: ${esc(m.name || "")}`, "success");
  } catch (e) {
    setLinkRows([]);
    setTeamSubmitLabel();
    setPhotoPreview(null);
    setBox("teamResult", esc(e.message), "error");
  }
}

async function updateMember(id) {
  const form = document.getElementById("teamForm");
  if (!form) return;
  const memberId = id || CURRENT_MEMBER_ID;
  if (!memberId) {
    setBox("teamResult", "No hay miembro cargado para actualizar. Pulsa Cargar primero.", "notice");
    return;
  }

  const fd = new FormData(form);
  const payload = new FormData();
  payload.append("name", String(fd.get("name") || ""));
  payload.append("role", String(fd.get("role") || ""));
  const orderValue = String(fd.get("order") || "").trim();
  if (orderValue !== "") payload.append("order", orderValue);
  payload.append("bio", String(fd.get("bio") || ""));
  payload.append("descripcion_corta", String(fd.get("descripcion_corta") || ""));
  payload.append("active", String(!!fd.get("active")));
  const editorRef = String(fd.get("editorRef") || "");
  payload.append("editor", editorRef);

  const photo = fd.get("photo");
  if (photo && photo instanceof File && photo.size > 0) payload.append("photo", photo);

  try {
    const updated = await pbUpdate(TEAM_COLLECTION, memberId, payload);
    await deleteMemberLinks(memberId);
    const links = collectLinkRows();
    await saveMemberLinks(memberId, links);
    await loadMemberIntoForm(updated.id);
    CURRENT_MEMBER_ID = updated.id;
    setBox("teamResult", "Miembro actualizado.", "success");
    await refreshTeamList();
    await loadMembersDropdown();
    const select = document.getElementById("memberSelect");
    if (select) select.value = updated.id;
    setTeamSubmitLabel();
  } catch (e) {
    setBox("teamResult", esc(e.message), "error");
  }
}

async function setCurrentEditorTeamId() {
  currentEditorTeamId = null;
  if (!CURRENT_EDITOR_ID) return;
  try {
    const filter = encodeURIComponent(`editor="${CURRENT_EDITOR_ID}"`);
    const url = `${PB_BASE}/api/collections/${TEAM_COLLECTION}/records?perPage=1&filter=${filter}`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token()}` } });
    if (!res.ok) return;
    const data = await res.json();
    const item = data.items?.[0];
    if (item) currentEditorTeamId = item.id;
  } catch {}
}

async function loadEditorsDropdownForTeam() {
  const select = document.getElementById("editorRefSelect");
  if (!select) return;
  select.innerHTML = `<option value="">(Sin referencia)</option>`;
  try {
    const data = await pbList(EDITORS_COLLECTION, 200, "email");
    editorsCache = data.items || [];
    select.innerHTML = `<option value="">(Sin referencia)</option>` + editorsCache
      .map(e => `<option value="${esc(e.id)}">${esc(e.email || e.username || e.id)}</option>`)
      .join("");
  } catch (e) {
    select.innerHTML = `<option value="">(Error cargando)</option>`;
    setBox("teamResult", esc(e.message), "error");
  }
}

async function nextTeamOrder() {
  try {
    const data = await pbList(TEAM_COLLECTION, 1, "-order");
    const top = data.items?.[0];
    return typeof top?.order === "number" ? top.order : Number(top?.order) || 0;
  } catch {
    return 0;
  }
}

async function loadDimensionsDropdown() {
  const select = document.getElementById("dimensionSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Cargando…</option>`;

  try {
    const data = await pbList(DIMENSIONS_COLLECTION, 50, "created");
    const items = data.items || [];

    if (!items.length) {
      select.innerHTML = `<option value="">(No hay Dimensiones)</option>`;
      return;
    }

    items.sort((a, b) => (a.titulo || "").localeCompare(b.titulo || ""));
    select.innerHTML = `<option value="">Selecciona una dimensión…</option>` + items
      .map(d => `<option value="${esc(d.id)}">${esc(d.titulo || "(sin título)")}</option>`)
      .join("");
  } catch (e) {
    select.innerHTML = `<option value="">(Error cargando)</option>`;
    setBox("dimensionResult", esc(e.message), "error");
  }
}

async function refreshDimensionsList() {
  const box = document.getElementById("dimensionList");
  if (!box) return;
  try {
    const data = await pbList(DIMENSIONS_COLLECTION, 100, "-created");
    const items = data.items || [];
    if (!items.length) {
      box.innerHTML = `<div class="notice">Aún no hay Dimensiones creadas.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="notice">
        ${items.map(d => `
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #e6e6e6">
            <div>
              <b>${esc(d.titulo || "(sin título)")}</b>
              <div class="small muted">${esc(d.pregunta || "")}</div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn" type="button" data-edit="${esc(d.id)}">Editar</button>
              <button class="btn" type="button" data-del="${esc(d.id)}">Eliminar</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    box.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => loadDimensionIntoForm(btn.getAttribute("data-edit")));
    });
    box.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", () => deleteDimension(btn.getAttribute("data-del")));
    });
  } catch (e) {
    box.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

async function loadDimensionIntoForm(id) {
  const form = document.getElementById("dimensionForm");
  if (!form) return;
  if (!id) {
    setBox("dimensionResult", "Selecciona una dimensión primero.", "notice");
    return;
  }
  try {
    const url = `${PB_BASE}/api/collections/${DIMENSIONS_COLLECTION}/records/${encodeURIComponent(id)}`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token()}` } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`No se pudo cargar (${res.status}): ${text}`);
    }
    const d = await res.json();
    CURRENT_DIMENSION_ID = d.id;
    form.titulo.value = d.titulo || "";
    form.pregunta.value = d.pregunta || "";
    form.texto.value = d.texto || "";
    setRteContent(form.texto, d.texto || "");
    setBox("dimensionResult", `Cargada: ${esc(d.titulo || "")}`, "success");
    const select = document.getElementById("dimensionSelect");
    if (select) select.value = d.id;
  } catch (e) {
    setBox("dimensionResult", esc(e.message), "error");
  }
}

async function deleteDimension(id) {
  if (!id) return;
  try {
    await pbDelete(DIMENSIONS_COLLECTION, id);
    if (CURRENT_DIMENSION_ID === id) {
      CURRENT_DIMENSION_ID = null;
      document.getElementById("dimensionForm")?.reset();
    }
    await loadDimensionsDropdown();
    await refreshDimensionsList();
    setBox("dimensionResult", "Dimensión eliminada.", "success");
  } catch (e) {
    setBox("dimensionResult", esc(e.message), "error");
  }
}

async function refreshEditorsList() {
  const box = document.getElementById("editorList");
  if (!box) return;
  try {
    const data = await pbList(EDITORS_COLLECTION, 200, "email");
    const items = data.items || [];
    if (!items.length) {
      box.innerHTML = `<div class="notice">No hay editores configurados.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="notice">
        ${items.map(u => `
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #e6e6e6">
            <div>
              <b>${esc(u.email || "")}</b>
              ${u.username ? `<div class="small muted">${esc(u.username)}</div>` : ""}
            </div>
            <button class="btn" type="button" data-del-editor="${esc(u.id)}">Eliminar</button>
          </div>
        `).join("")}
      </div>
    `;
    box.querySelectorAll("[data-del-editor]").forEach(btn => {
      btn.addEventListener("click", () => deleteEditor(btn.getAttribute("data-del-editor")));
    });
  } catch (e) {
    box.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

async function saveEditor(e) {
  e.preventDefault();
  if (!token()) return;
  const fd = new FormData(e.target);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "").trim();
  const passwordConfirm = String(fd.get("passwordConfirm") || "").trim();
  const username = String(fd.get("username") || "").trim() || email;

  if (!email || !password || !passwordConfirm) {
    setBox("editorResult", "Email y contraseñas son obligatorios.", "error");
    return;
  }

  const payload = new FormData();
  payload.append("email", email);
  payload.append("password", password);
  payload.append("passwordConfirm", passwordConfirm);
  payload.append("username", username);
  payload.append("emailVisibility", "true");

  try {
    const created = await pbCreate(EDITORS_COLLECTION, payload);
    setBox("editorResult", "Editor creado.", "success");
    // crear entrada de equipo vinculada
    try {
      const teamPayload = new FormData();
      teamPayload.append("name", username || email);
      teamPayload.append("role", "Editor");
      teamPayload.append("bio", "");
      teamPayload.append("active", "true");
      teamPayload.append("editor", created.id);
      await pbCreate(TEAM_COLLECTION, teamPayload);
      await refreshTeamList();
      await loadMembersDropdown();
    } catch (err) {
      setBox("editorResult", `Editor creado, pero el alta en Equipo falló: ${esc(err.message)}`, "notice");
    }
    e.target.reset();
    await refreshEditorsList();
    await loadEditorsDropdownForTeam();
  } catch (err) {
    setBox("editorResult", esc(err.message), "error");
  }
}

async function deleteEditor(id) {
  if (!id) return;
  try {
    await pbDelete(EDITORS_COLLECTION, id);
    await refreshEditorsList();
    setBox("editorResult", "Editor eliminado.", "success");
  } catch (e) {
    setBox("editorResult", esc(e.message), "error");
  }
}

async function changeMyPassword(e) {
  e.preventDefault();
  if (!token() || !CURRENT_EDITOR_ID) {
    setBox("passwordResult", "Debes iniciar sesión para cambiar tu contraseña.", "error");
    return;
  }
  const fd = new FormData(e.target);
  const oldPassword = String(fd.get("oldPassword") || "");
  const newPassword = String(fd.get("newPassword") || "");
  const newPasswordConfirm = String(fd.get("newPasswordConfirm") || "");

  if (!oldPassword || !newPassword || !newPasswordConfirm) {
    setBox("passwordResult", "Todos los campos son obligatorios.", "error");
    return;
  }

  const payload = new FormData();
  payload.append("oldPassword", oldPassword);
  payload.append("password", newPassword);
  payload.append("passwordConfirm", newPasswordConfirm);

  try {
    await pbUpdate(EDITORS_COLLECTION, CURRENT_EDITOR_ID, payload);
    setBox("passwordResult", "Contraseña actualizada.", "success");
    e.target.reset();
  } catch (err) {
    setBox("passwordResult", esc(err.message), "error");
  }
}

(async function init(){
  showEditorUI(!!token());
  setupSectionTabs();
  setupBurgerMenu();
  setupRichTextEditors();

  document.getElementById("logoutBtn").addEventListener("click", () => {
    logout();
    showEditorUI(false);
  });

  setLinkRows([]);
  setTeamSubmitLabel();
  setPostSubmitLabel();
  setPhotoPreview(null);
  document.getElementById("addLinkRowBtn")?.addEventListener("click", () => addLinkRow());

  document.getElementById("descriptionForm")?.addEventListener("submit", saveProjectDescription);
  document.getElementById("footerContactForm")?.addEventListener("submit", saveFooterContact);
  document.getElementById("footerLogoForm")?.addEventListener("submit", saveFooterLogo);

  document.getElementById("dimensionForm")?.addEventListener("submit", saveDimension);
  document.getElementById("loadDimensionBtn")?.addEventListener("click", () => {
    const id = document.getElementById("dimensionSelect")?.value;
    loadDimensionIntoForm(id);
  });
  document.getElementById("newDimensionBtn")?.addEventListener("click", () => {
    CURRENT_DIMENSION_ID = null;
    document.getElementById("dimensionForm")?.reset();
    const select = document.getElementById("dimensionSelect");
    if (select) select.value = "";
    const form = document.getElementById("dimensionForm");
    if (form?.texto) setRteContent(form.texto, "");
    setBox("dimensionResult", "Formulario listo para crear nueva dimensión.", "notice");
  });

  document.getElementById("editorForm")?.addEventListener("submit", saveEditor);
  document.getElementById("passwordForm")?.addEventListener("submit", changeMyPassword);

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await pbLogin(fd.get("email"), fd.get("password"));
      showEditorUI(true);
      await loadPostsDropdown();
      await refreshPostsList();
      await loadSettingsIntoForm();
      await refreshTeamList();
      await loadMembersDropdown();
      await loadEditorsDropdownForTeam();
      await loadDimensionsDropdown();
      await refreshDimensionsList();
      await refreshEditorsList();
      await refreshFooterLogosList();
    } catch (err) {
      const state = document.getElementById("state");
      state.className = "error";
      state.textContent = err.message;
    }
  });

  // POSTS
  document.getElementById("postForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!token()) return;

    if (CURRENT_POST_ID) {
      await updatePost(CURRENT_POST_ID);
      setPostSubmitLabel();
      return;
    }

    const fd = new FormData(e.target);
    const title = String(fd.get("title") || "").trim();
    let slug = String(fd.get("slug") || "").trim();
    if (!slug) slug = slugify(title);

    const tagValues = fd.getAll("tags").filter(t => ALLOWED_TAGS.includes(t));

    const payload = new FormData();
    payload.append("title", title);
    payload.append("slug", slug);
    payload.append("summary", String(fd.get("summary") || ""));
    payload.append("content", String(fd.get("content") || ""));
    payload.append("tags", tagValues.join(", "));
    payload.append("published", String(!!fd.get("published")));
    payload.append("published_at", new Date().toISOString());
    if (currentEditorTeamId) payload.append("autor", currentEditorTeamId);

    const coverFile = fd.get("cover");
    if (coverFile && coverFile instanceof File && coverFile.size > 0) {
      payload.append("cover", coverFile);
    }

    try {
      const created = await pbCreate(POSTS_COLLECTION, payload);
      setBox("postResult", `Publicado. <a href="/post/?id=${encodeURIComponent(created.id)}">Ver artículo</a>`, "success");
      e.target.reset();
      document.getElementById("published").checked = true;
      if (e.target.content) setRteContent(e.target.content, "");
      CURRENT_POST_ID = null;
      setPostSubmitLabel();
      await loadPostsDropdown();
      await refreshPostsList();
    } catch (err) {
      setBox("postResult", esc(err.message), "error");
    }
  });

  // SETTINGS
  document.getElementById("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!token()) return;

    const fd = new FormData(e.target);
    const payload = new FormData();
    payload.append("site_name", String(fd.get("site_name") || ""));
    payload.append("hero_title", String(fd.get("hero_title") || ""));
    payload.append("hero_subtitle", String(fd.get("hero_subtitle") || ""));

    const logo = fd.get("logo");
    if (logo && logo instanceof File && logo.size > 0) payload.append("logo", logo);

    // Mantén las imágenes existentes y añade las nuevas (no sobreescribas)
    const heroImages = fd.getAll("hero_images");
    const existingHeroNames = (SETTINGS_ID && Array.isArray(currentSettings?.hero_images))
      ? currentSettings.hero_images
      : [];
    for (const name of existingHeroNames) {
      payload.append("hero_images", name);
    }
    // fd.getAll en inputs file multiple suele devolver File(s); metemos los no vacíos
    for (const f of heroImages) {
      if (f instanceof File && f.size > 0) payload.append("hero_images", f);
    }

    try {
      if (!SETTINGS_ID) {
        const created = await pbCreate(SETTINGS_COLLECTION, payload);
        SETTINGS_ID = created.id;
      } else {
        await pbUpdate(SETTINGS_COLLECTION, SETTINGS_ID, payload);
      }
      setBox("settingsResult", `Guardado. Revisa la portada (recarga /).`, "success");
      e.target.reset();
      await loadSettingsIntoForm();
    } catch (err) {
      setBox("settingsResult", esc(err.message), "error");
    }
  });

  // TEAM
  document.getElementById("teamForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!token()) return;

    if (CURRENT_MEMBER_ID) {
      await updateMember(CURRENT_MEMBER_ID);
      setTeamSubmitLabel();
      return;
    }

  const fd = new FormData(e.target);
  const orderValue = (await nextTeamOrder()) + 1;
  const orderInput = String(fd.get("order") || "").trim();

  const payload = new FormData();
  payload.append("name", String(fd.get("name") || ""));
  payload.append("role", String(fd.get("role") || ""));
  payload.append("order", orderInput !== "" ? orderInput : String(orderValue));
  payload.append("bio", String(fd.get("bio") || ""));
   payload.append("descripcion_corta", String(fd.get("descripcion_corta") || ""));
  payload.append("active", String(!!fd.get("active")));
  const editorRef = String(fd.get("editorRef") || "");
  if (editorRef) payload.append("editor", editorRef);

    const photo = fd.get("photo");
    if (photo && photo instanceof File && photo.size > 0) payload.append("photo", photo);

    try {
      const created = await pbCreate(TEAM_COLLECTION, payload);
      const links = collectLinkRows();
      await saveMemberLinks(created.id, links);
      setBox("teamResult", "Miembro añadido.", "success");
      e.target.reset();
      if (e.target.photo) e.target.photo.value = "";
      const editorRefSelect = e.target.editorRef || document.getElementById("editorRefSelect");
      if (editorRefSelect) editorRefSelect.value = "";
      document.getElementById("active").checked = true;
      if (e.target.bio) setRteContent(e.target.bio, "");
      if (e.target.descripcion_corta) setRteContent(e.target.descripcion_corta, "");
      setLinkRows([]);
      CURRENT_MEMBER_ID = null;
      setTeamSubmitLabel();
      setPhotoPreview(null);
      const select = document.getElementById("memberSelect");
      if (select) select.value = "";
      await refreshTeamList();
      await loadMembersDropdown();
    } catch (err) {
      setBox("teamResult", esc(err.message), "error");
    }
  });

  document.getElementById("loadMemberBtn")?.addEventListener("click", async () => {
    const id = document.getElementById("memberSelect")?.value;
    await loadMemberIntoForm(id);
  });

  document.getElementById("updateMemberBtn")?.addEventListener("click", async () => {
    const id = document.getElementById("memberSelect")?.value;
    await updateMember(id);
  });

// ------------------------- 
// POSTS: editar existentes
// -------------------------

function setPostResult(html, kind = "notice") {
  const el = document.getElementById("postResult");
  el.innerHTML = `<div class="${kind}">${html}</div>`;
}

// Opcional: si tu API te devuelve tags como string o null
function normalizeTags(t) {
  if (t == null) return [];
  if (Array.isArray(t)) return t.map(x => String(x).trim()).filter(Boolean);
  return String(t).split(",").map(x => x.trim()).filter(Boolean);
}

/**
 * loadPostsDropdown():
 * Lista posts (incluye no publicados) y llena el select
 */
async function loadPostsDropdown() {
  const select = document.getElementById("postSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Cargando…</option>`;

  try {
    // Requiere que en PB: list/view rule permitan a auth ver no publicados
    // ej: published = true || @request.auth.id != ""
    const url = `${PB_BASE}/api/collections/${POSTS_COLLECTION}/records?perPage=200&sort=-published_at`;
    const res = await fetch(url, { headers: token() ? { "Authorization": `Bearer ${token()}` } : {} });
    if (!res.ok) throw new Error(`List error (${res.status})`);
    const data = await res.json();
    const items = data.items || [];

    if (!items.length) {
      select.innerHTML = `<option value="">(No hay artículos)</option>`;
      return;
    }

    // Orden visual: publicados primero, luego borradores
    items.sort((a, b) => {
      const av = a.published ? 1 : 0;
      const bv = b.published ? 1 : 0;
      if (av !== bv) return av - bv; // no visibles primero
      const ad = new Date(a.published_at || 0).getTime();
      const bd = new Date(b.published_at || 0).getTime();
      return bd - ad;
    });

    select.innerHTML = `<option value="">Selecciona un artículo…</option>` + items
      .map(p => {
        const status = p.published ? "Visible" : "No visible";
        const label = `${status} — ${p.title || "(sin título)"} [${p.slug || "sin-slug"}]`;
        return `<option value="${p.id}">${label}</option>`;
      })
      .join("");

  } catch (e) {
    select.innerHTML = `<option value="">(Error cargando artículos)</option>`;
    setPostResult(esc(e.message), "error");
  }
  setPostSubmitLabel();
}

async function refreshPostsList() {
  const box = document.getElementById("postList");
  if (!box) return;
  if (!token()) {
    box.innerHTML = `<div class="notice">Inicia sesión para ver artículos.</div>`;
    return;
  }
  try {
    const data = await pbList(POSTS_COLLECTION, 200, "-published_at");
    const items = data.items || [];
    if (!items.length) {
      box.innerHTML = `<div class="notice">No hay artículos publicados todavía.</div>`;
      return;
    }

    items.sort((a, b) => {
      const ad = new Date(a.published_at || a.created || 0).getTime();
      const bd = new Date(b.published_at || b.created || 0).getTime();
      return bd - ad;
    });

    const totalPages = Math.max(1, Math.ceil(items.length / ADMIN_PAGE_SIZE));
    if (POSTS_PAGE > totalPages) POSTS_PAGE = totalPages;
    if (POSTS_PAGE < 1) POSTS_PAGE = 1;
    const start = (POSTS_PAGE - 1) * ADMIN_PAGE_SIZE;
    const pageItems = items.slice(start, start + ADMIN_PAGE_SIZE);

    box.innerHTML = `
      <div class="notice">
        ${pageItems.map(p => `
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #e6e6e6">
            <div>
              <b>${esc(p.title || "(sin título)")}</b>
              <div class="small muted">${esc(p.slug || "sin-slug")} · ${p.published ? "Visible" : "No visible"}</div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn" type="button" data-edit-post="${esc(p.id)}">Editar</button>
              <button class="btn" type="button" data-del-post="${esc(p.id)}">Eliminar</button>
            </div>
          </div>
        `).join("")}
      </div>
      ${renderPager(items.length, POSTS_PAGE, ADMIN_PAGE_SIZE, "post")}
    `;

    attachPagerHandlers(box, "post", (p) => {
      POSTS_PAGE = p;
      refreshPostsList();
    });

    box.querySelectorAll("[data-edit-post]").forEach(btn => {
      btn.addEventListener("click", () => loadPostIntoForm(btn.getAttribute("data-edit-post")));
    });
    box.querySelectorAll("[data-del-post]").forEach(btn => {
      btn.addEventListener("click", () => deletePost(btn.getAttribute("data-del-post")));
    });
  } catch (e) {
    box.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

/**
 * loadPostIntoForm(id):
 * Pide /records/{id} y rellena inputs del form
 */
async function loadPostIntoForm(id) {
  const form = document.getElementById("postForm");
  if (!form) return;

  if (!id) {
    setPostResult("Selecciona un artículo primero.", "notice");
    CURRENT_POST_ID = null;
    setPostSubmitLabel();
    return;
  }

  try {
    // GET directo del record
    const url = `${PB_BASE}/api/collections/${POSTS_COLLECTION}/records/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token()}` }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`No se pudo cargar (${res.status}): ${text}`);
    }
    const p = await res.json();

    CURRENT_POST_ID = p.id;
    const select = document.getElementById("postSelect");
    if (select) select.value = p.id;

    // Rellenar inputs
    form.title.value = p.title || "";
    form.slug.value = p.slug || "";
    form.summary.value = p.summary || "";
    form.content.value = p.content || "";
    setRteContent(form.content, p.content || "");
    const tagsArray = normalizeTags(p.tags);
    document.querySelectorAll("input[name='tags']").forEach(cb => {
      cb.checked = tagsArray.includes(cb.value);
    });
    form.published.checked = !!p.published;

    // No se puede autocompletar input file por seguridad del navegador.
    // Aviso útil:
    setPostResult(
      `Cargado: <b>${esc(p.title)}</b>. (La portada no se puede precargar; si subes una nueva, reemplazará la anterior.)`,
      "success"
    );
    setPostSubmitLabel();

  } catch (e) {
    setPostResult(esc(e.message), "error");
    setPostSubmitLabel();
  }
}

async function deletePost(id) {
  if (!id) return;
  if (!confirm("¿Eliminar este artículo? Esta acción no se puede deshacer.")) return;
  try {
    await pbDelete(POSTS_COLLECTION, id);

    if (CURRENT_POST_ID === id) {
      CURRENT_POST_ID = null;
      const form = document.getElementById("postForm");
      if (form) {
        form.reset();
        if (form.content) setRteContent(form.content, "");
      }
      const published = document.getElementById("published");
      if (published) published.checked = true;
      const select = document.getElementById("postSelect");
      if (select) select.value = "";
      setPostSubmitLabel();
    }

    await loadPostsDropdown();
    await refreshPostsList();
    setPostResult("Artículo eliminado.", "success");
  } catch (e) {
    setPostResult(esc(e.message), "error");
  }
}

/**
 * updatePost(id):
 * Hace PATCH con FormData para actualizar el post seleccionado
 */
async function updatePost(id) {
  const form = document.getElementById("postForm");
  if (!form) return;

  const postId = id || CURRENT_POST_ID;
  if (!postId) {
    setPostResult("No hay artículo cargado para actualizar. Selecciona uno y pulsa Cargar.", "notice");
    return;
  }

  try {
    const fd = new FormData(form);

    const title = String(fd.get("title") || "").trim();
    if (!title) {
      setPostResult("El título es obligatorio.", "error");
      return;
    }

    let slug = String(fd.get("slug") || "").trim();
    if (!slug) slug = slugify(title);

  const payload = new FormData();
  payload.append("title", title);
  payload.append("slug", slug);
  payload.append("summary", String(fd.get("summary") || ""));
  payload.append("content", String(fd.get("content") || ""));
  const tagValues = fd.getAll("tags").filter(t => ALLOWED_TAGS.includes(t));
  payload.append("tags", tagValues.join(", "));
  payload.append("published", String(!!fd.get("published")));
  if (currentEditorTeamId) payload.append("autor", currentEditorTeamId);

    // Mantén/actualiza published_at solo si está marcado publicado
    // (si quieres que al editar se cambie la fecha, descomenta la línea)
    if (!!fd.get("published")) {
      // payload.append("published_at", new Date().toISOString());
    }

    // Cover (si eliges archivo, reemplaza)
    const coverFile = fd.get("cover");
    if (coverFile && coverFile instanceof File && coverFile.size > 0) {
      payload.append("cover", coverFile);
    }

    const updated = await pbUpdate(POSTS_COLLECTION, postId, payload);

    CURRENT_POST_ID = updated.id;
    setPostResult(
      `Cambios guardados. <a href="/post/?id=${encodeURIComponent(updated.id)}">Ver artículo</a>`,
      "success"
    );

    // Refresca el dropdown para reflejar estado/título
    await loadPostsDropdown();
    await refreshPostsList();

    // Mantén seleccionado el post editado
    const select = document.getElementById("postSelect");
    if (select) select.value = updated.id;
    setPostSubmitLabel();

  } catch (e) {
    setPostResult(esc(e.message), "error");
  }
}

async function saveDimension(e) {
  e.preventDefault();
  if (!token()) return;

  const form = e.target;
  const fd = new FormData(form);

  const payload = new FormData();
  payload.append("titulo", String(fd.get("titulo") || ""));
  payload.append("pregunta", String(fd.get("pregunta") || ""));
  payload.append("texto", String(fd.get("texto") || ""));

  try {
    if (CURRENT_DIMENSION_ID) {
      await pbUpdate(DIMENSIONS_COLLECTION, CURRENT_DIMENSION_ID, payload);
      setBox("dimensionResult", "Dimensión actualizada.", "success");
    } else {
      const created = await pbCreate(DIMENSIONS_COLLECTION, payload);
      CURRENT_DIMENSION_ID = created.id;
      setBox("dimensionResult", "Dimensión creada.", "success");
    }
    form.reset();
    if (form.texto) setRteContent(form.texto, "");
    CURRENT_DIMENSION_ID = null;
    const select = document.getElementById("dimensionSelect");
    if (select) select.value = "";
    await loadDimensionsDropdown();
    await refreshDimensionsList();
  } catch (err) {
    setBox("dimensionResult", esc(err.message), "error");
  }
}

// Al entrar (si ya hay token) o tras login
await loadPostsDropdown();
await refreshPostsList();

document.getElementById("loadPostBtn")?.addEventListener("click", async () => {
  const id = document.getElementById("postSelect")?.value;
  await loadPostIntoForm(id);
});

document.getElementById("updatePostBtn")?.addEventListener("click", async () => {
  const id = document.getElementById("postSelect")?.value;
  await updatePost(id);
});



  // Si ya hay token, precarga cosas
  if (token()) {
    try {
      await pbAuthRefresh();
      await loadPostsDropdown();
      await refreshPostsList();
      await loadSettingsIntoForm();
      await refreshTeamList();
      await loadMembersDropdown();
      await loadEditorsDropdownForTeam();
      await loadDimensionsDropdown();
      await refreshDimensionsList();
      await refreshEditorsList();
      await refreshFooterLogosList();
      showEditorUI(true);
    } catch {}
  }
})();
