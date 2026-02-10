const {
  PB_BASE,
  POSTS_COLLECTION,
  TEAM_COLLECTION,
  LINKS_COLLECTION,
  LOGOS_COLLECTION,
  SETTINGS_COLLECTION,
  DIMENSIONS_COLLECTION,
  PER_PAGE
} = window.APP_CONFIG;
const TOKEN_KEY = "pb_editor_token";
const ALLOWED_TAGS = ["Noticias e Informes", "Artículos", "Libros", "Revistas", "Enlaces", "Seminarios", "Formación"];

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const STRIP_EL = document.createElement("div");
function stripHtml(html) {
  STRIP_EL.innerHTML = String(html ?? "");
  return STRIP_EL.textContent || "";
}

function fileUrl(collection, record, filename) {
  return `${PB_BASE}/api/files/${collection}/${record.id}/${filename}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
}

async function fetchSettings() {
  const url = `${PB_BASE}/api/collections/${SETTINGS_COLLECTION}/records?perPage=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Settings error (${res.status})`);
  const data = await res.json();
  return data.items?.[0] || null;
}

async function fetchPosts() {
  const url = `${PB_BASE}/api/collections/${POSTS_COLLECTION}/records?perPage=${PER_PAGE}&sort=-published_at&expand=autor`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Posts error (${res.status})`);
  return res.json();
}
async function fetchLinksByMember(memberId) {
  const filter = encodeURIComponent(`miembro="${memberId}"`);
  const url = `${PB_BASE}/api/collections/${LINKS_COLLECTION}/records?perPage=50&filter=${filter}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Links error (${res.status})`);
  return res.json();
}

async function fetchTeam() {
  const url = `${PB_BASE}/api/collections/${TEAM_COLLECTION}/records?perPage=50&sort=${encodeURIComponent("order,name")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Team error (${res.status})`);
  return res.json();
}
async function fetchFooterLogos() {
  const url = `${PB_BASE}/api/collections/${LOGOS_COLLECTION}/records?perPage=50&sort=orden`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Footer logos error (${res.status})`);
  return res.json();
}

async function fetchDimensions() {
  const url = `${PB_BASE}/api/collections/${DIMENSIONS_COLLECTION}/records?perPage=10&sort=created`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dimensiones error (${res.status})`);
  return res.json();
}

let heroTimer = null;
function startHeroSlideshow(settings) {
  const heroBg = document.getElementById("heroBg");
  if (!heroBg) return;

  const imgs = (Array.isArray(settings?.hero_images) ? settings.hero_images : [])
    .map(fn => fileUrl(SETTINGS_COLLECTION, settings, fn));

  // fallback
  if (!imgs.length) {
    heroBg.style.backgroundImage = `url("https://picsum.photos/1600/700?random=11")`;
    return;
  }

  let idx = 0;
  function setBg(i) {
    heroBg.style.opacity = "0.2";
    setTimeout(() => {
      heroBg.style.backgroundImage = `url("${imgs[i]}")`;
      heroBg.style.opacity = "0.9";
    }, 250);
  }

  setBg(idx);
  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    idx = (idx + 1) % imgs.length;
    setBg(idx);
  }, 5000); // 5 segundos
}

function updateAdminLinks() {
  const isEditor = !!localStorage.getItem(TOKEN_KEY);
  const adminNav = document.getElementById("adminNavLink");
  const adminMenu = document.getElementById("adminMenuLink");
  if (adminNav) adminNav.style.display = isEditor ? "inline-flex" : "none";
  if (adminMenu) adminMenu.style.display = isEditor ? "block" : "none";
}

function renderSettings(s) {
  if (!s) return;

  // logo + nombre
  const siteName = document.getElementById("siteName");
  if (siteName && s.site_name) siteName.textContent = s.site_name;

  const logo = document.getElementById("logo");
  if (logo && s.logo) {
    logo.src = fileUrl(SETTINGS_COLLECTION, s, s.logo);
    logo.style.display = "block";
    logo.closest(".brand-badge")?.classList.add("has-logo");
  }

  // hero textos
  const heroTitle = document.getElementById("heroTitle");
  if (heroTitle) {
    if (s.hero_title) heroTitle.textContent = s.hero_title;
    heroTitle.classList.remove("hero-title-animate");
    void heroTitle.offsetWidth;
    heroTitle.classList.add("hero-title-animate");
  }
  if (s.hero_subtitle) {
    const heroSubtitle = document.getElementById("heroSubtitle");
    if (heroSubtitle) heroSubtitle.textContent = s.hero_subtitle;
  }

  // slideshow
  startHeroSlideshow(s);

  // descripción proyecto (HTML)
  const projectDesc = document.getElementById("projectDesc");
  if (projectDesc) projectDesc.innerHTML = s.project_description ?? `<p class="muted">Añade la descripción del proyecto desde Admin.</p>`;

  // contacto (HTML)
  const contact = document.getElementById("contact");
  if (contact) contact.innerHTML = s.contact_html ?? `<p class="muted">Añade la info de contacto desde Admin.</p>`;
}

function renderFooter(settings, logos) {
  const contactBox = document.getElementById("footerContact");
  const logosBox = document.getElementById("footerLogos");
  if (!contactBox && !logosBox) return;

  if (contactBox) {
    const html = settings?.contact_html ?? `<p class="muted">Añade la info de contacto desde Admin.</p>`;
    contactBox.innerHTML = highlightFooterProject(html);
  }

  if (logosBox) {
    logosBox.innerHTML = "";
    if (!logos?.length) {
      logosBox.innerHTML = `<div class="muted small">Sin logos.</div>`;
      return;
    }
    for (const l of logos) {
      if (!l.logo) continue;
      const src = fileUrl(LOGOS_COLLECTION, l, l.logo);
      const open = l.link ? `<a href="${esc(l.link)}" target="_blank" rel="noopener">` : `<span>`;
      const close = l.link ? `</a>` : `</span>`;
      logosBox.insertAdjacentHTML("beforeend", `${open}<img src="${src}" alt="Logo">${close}`);
    }
  }
}

function highlightFooterProject(html) {
  if (!html || html.includes("footer-project-title")) return html;
  const re = /Influencia de las nuevas formas de persuasión encubierta en Internet sobre la(?:\s|<br\s*\/?>)+conducta de los jóvenes e intervención educativa \(PERENED\)\./gi;
  return html.replace(re, match => `<span class="footer-project-title">${match}</span>`);
}

function renderPosts(items) {
  const posts = document.getElementById("posts");
  const count = document.getElementById("count");
  const msg = document.getElementById("msg");
  if (!posts || !msg) return;

  posts.innerHTML = "";
  msg.innerHTML = "";
  if (count) count.textContent = items.length ? `${items.length} artículo(s) publicados` : "";

  if (!items.length) {
    msg.innerHTML = `<div class="notice">No hay artículos publicados todavía.</div>`;
    return;
  }

  for (const p of items) {
    const coverUrl = p.cover
      ? fileUrl(POSTS_COLLECTION, p, p.cover)
      : "https://picsum.photos/800/600?random=25";
    const tags = normalizeTags(p.tags);
    const tagsHtml = tags.length
      ? `<div class="taglist">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
      : `<div class="muted small">Sin categoría</div>`;
    const dateIso = p.published_at || p.created;
    const author = p.expand?.autor?.name || p.expand?.autor?.role || p.expand?.autor?.id || "Sin autor";
    posts.insertAdjacentHTML("beforeend", `
      <article class="publication-card">
        <div class="publication-thumb">
          <img src="${coverUrl}" alt="${esc(p.title || "")}">
        </div>
        <div class="publication-body">
          <h3 class="publication-title">${esc(p.title || "Sin título")}</h3>
          <div class="publication-meta">${esc(fmtDate(dateIso))}</div>
          <div class="publication-meta">Autor: ${esc(author)}</div>
          ${tagsHtml}
          <div class="publication-actions">
            <a class="btn" href="/post/?id=${encodeURIComponent(p.id)}">Ver más</a>
          </div>
        </div>
      </article>
    `);
  }
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  return String(tags).split(",").map(t => t.trim()).filter(Boolean);
}

function filterPostsByCategory(items, category) {
  if (!category || category.toLowerCase() === "publicaciones") return items;
  return items.filter(p => {
    const tags = normalizeTags(p.tags);
    return tags.some(t => t.toLowerCase() === category.toLowerCase());
  });
}

function filterPostsByAuthor(items, authorId) {
  if (!authorId) return items;
  return items.filter(p => p.autor === authorId || p.expand?.autor?.id === authorId);
}

function renderTeam(items) {
  const team = document.getElementById("team");
  const teamMsg = document.getElementById("teamMsg");
  if (!team || !teamMsg) return;
  team.innerHTML = "";
  teamMsg.innerHTML = "";

  if (!items.length) {
    teamMsg.innerHTML = `<div class="notice">Aún no hay miembros añadidos.</div>`;
    return;
  }

  items = items.slice().sort((a, b) => {
    const ao = Number(a.order);
    const bo = Number(b.order);
    if (!Number.isNaN(ao) && !Number.isNaN(bo) && ao !== bo) return ao - bo;
    if (!Number.isNaN(ao) && Number.isNaN(bo)) return -1;
    if (Number.isNaN(ao) && !Number.isNaN(bo)) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  for (const m of items) {
    const imgUrl = m.photo
      ? fileUrl(TEAM_COLLECTION, m, m.photo)
      : "https://picsum.photos/900/600?random=7";

    const shortDesc = stripHtml(m.descripcion_corta || m.bio || "");
    const profileUrl = `/equipo/miembro/?id=${encodeURIComponent(m.id)}`;
    team.insertAdjacentHTML("beforeend", `
      <a class="person" href="${profileUrl}" aria-label="Ver perfil de ${esc(m.name)}">
        <img alt="${esc(m.name)}" src="${imgUrl}">
        <div class="overlay">
          <p class="bio">${esc(shortDesc)}</p>
        </div>
        <div class="info">
          <div class="name">${esc(m.name)}</div>
          <div class="role">${esc(m.role)}</div>
        </div>
      </a>
    `);
  }
}

function renderMemberProfile(member, links, box) {
  if (!box) return;
  const name = member?.name || "Miembro";
  const role = member?.role || "";
  const imgUrl = member?.photo
    ? fileUrl(TEAM_COLLECTION, member, member.photo)
    : "https://picsum.photos/900/600?random=7";
  let bioHtml = "";
  if (member?.bio) {
    bioHtml = member.bio;
  } else if (member?.descripcion_corta) {
    bioHtml = `<p>${esc(stripHtml(member.descripcion_corta))}</p>`;
  }
  const linksHtml = links.length
    ? `<ul>${links.map(l => `<li><a href="${esc(l.link)}" target="_blank" rel="noopener">${esc(l.title || l.link)}</a></li>`).join("")}</ul>`
    : `<div class="muted small">Sin links.</div>`;

  box.innerHTML = `
    <div class="member-profile">
      <div class="member-photo">
        <img src="${imgUrl}" alt="${esc(name)}">
      </div>
      <div class="member-info">
        <span class="kicker">Equipo</span>
        <h2 class="member-name">${esc(name)}</h2>
        ${role ? `<div class="member-role">${esc(role)}</div>` : ""}
        ${bioHtml ? `<div class="member-bio">${bioHtml}</div>` : `<div class="muted">Sin biografía disponible.</div>`}
        <div class="member-links">
          <h4>Links</h4>
          ${linksHtml}
        </div>
      </div>
    </div>
  `;
}

function renderDimensions(items) {
  const list = document.getElementById("dimensions");
  const msg = document.getElementById("dimensionsMsg");
  if (!list || !msg) return;

  list.innerHTML = "";
  msg.innerHTML = "";

  if (!items.length) {
    msg.innerHTML = `<div class="notice">Aún no hay Dimensiones cargadas.</div>`;
    return;
  }

  let openCard = null;
  for (const d of items) {
    const title = d.titulo || "Sin título";
    const question = d.pregunta || "";
    const body = d.texto || "";
    list.insertAdjacentHTML("beforeend", `
      <article class="post-card no-cover" data-id="${esc(d.id)}">
        <div class="post-header">
          <div>
            <h3 class="post-title">${esc(title)}</h3>
            ${question ? `<div class="small muted">${esc(question)}</div>` : ""}
          </div>
          <span class="chevron" aria-hidden="true">›</span>
        </div>
        <div class="post-body">
          <div class="post-summary">${body}</div>
        </div>
      </article>
    `);
  }

  list.querySelectorAll(".post-card").forEach(card => {
    card.addEventListener("click", () => {
      if (openCard && openCard !== card) openCard.classList.remove("expanded");
      const isOpen = card.classList.toggle("expanded");
      openCard = isOpen ? card : null;
    });
  });
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

(async function init() {
  try {
    setupBurgerMenu();
    updateAdminLinks();
    window.addEventListener("storage", (e) => {
      if (e.key === TOKEN_KEY) updateAdminLinks();
    });

    const [settings, postsData, teamData, dimensionsData, logosData] = await Promise.all([
      fetchSettings(),
      fetchPosts(),
      fetchTeam(),
      fetchDimensions(),
      fetchFooterLogos()
    ]);
    window.ALL_POSTS = postsData.items || [];

    renderSettings(settings);
    const allPosts = postsData.items || [];
    const params = new URLSearchParams(window.location.search);
    const profileBox = document.getElementById("memberProfile");
    const profileMsg = document.getElementById("memberMsg");
    let category = params.get("categoria") || "";
    let authorId = params.get("autor") || "";
    let profileId = "";
    if (profileBox) {
      profileId = params.get("id") || params.get("autor") || "";
      authorId = profileId || "__missing__";
      category = "";
    }
    const heroKicker = document.getElementById("heroKicker");
    if (heroKicker && window.location.pathname.includes("/publicaciones")) {
      if (category && category.toLowerCase() !== "publicaciones") {
        heroKicker.textContent = category;
      } else {
        heroKicker.textContent = "Publicaciones";
      }
    }
    const filteredByCategory = filterPostsByCategory(allPosts, category);
    const filteredPosts = filterPostsByAuthor(filteredByCategory, authorId);
    renderPosts(filteredPosts);
    renderTeam(teamData.items || []);
    renderDimensions(dimensionsData.items || []);
    renderFooter(settings, logosData.items || []);
    if (profileBox) {
      if (!profileId) {
        if (profileMsg) profileMsg.innerHTML = `<div class="error">No se encontró el miembro solicitado.</div>`;
      } else {
        const member = (teamData.items || []).find(m => m.id === profileId);
        if (!member) {
          if (profileMsg) profileMsg.innerHTML = `<div class="error">No se encontró el miembro solicitado.</div>`;
        } else {
          let links = [];
          try {
            const linksData = await fetchLinksByMember(profileId);
            links = linksData.items || [];
          } catch (err) {
            if (profileMsg) profileMsg.innerHTML = `<div class="error">No se pudieron cargar los links del miembro.</div>`;
          }
          renderMemberProfile(member, links, profileBox);
          const crumb = document.getElementById("crumb");
          const h1 = document.getElementById("h1");
          if (crumb) crumb.textContent = member.name || "Perfil";
          if (h1) h1.textContent = member.name || "Perfil";
          if (member.name) document.title = `${member.name} - Equipo`;
        }
      }
    }
  } catch (e) {
    const msg = document.getElementById("msg");
    if (msg) msg.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
})();
