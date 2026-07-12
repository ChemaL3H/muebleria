// ============================================
//  MUEBLERÍA GONZÁLEZ — SHARED JS
//  Firebase Firestore + Auth + Favoritos + Admin
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, addDoc,
  updateDoc, deleteDoc, doc, setDoc, getDoc, query, where,
  serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

// ── Config Firebase ──────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDowYWumEu2ZvhFDDqcLuhgzTkei0JRTmM",
  authDomain: "muebleria-gonzalez-ac6c5.firebaseapp.com",
  projectId: "muebleria-gonzalez-ac6c5",
  storageBucket: "muebleria-gonzalez-ac6c5.firebasestorage.app",
  messagingSenderId: "742642897921",
  appId: "1:742642897921:web:76bbe8c35ea33ded61dc00"
};

const app      = initializeApp(firebaseConfig);
const db       = getFirestore(app);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

const SUPABASE_URL ="https://awsqtceknrizszvnsgru.supabase.co";
const SUPABASE_ANON_KEY ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3c3F0Y2VrbnJpenN6dm5zZ3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTk0NjksImV4cCI6MjA5NzM3NTQ2OX0.k3QOOszP6VTnwEticn71kPmZoOG1s9xPCsvps9Q2kyQ";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function subirImagenSupabase(file){
 const nombreArchivo = Date.now()+"_"+file.name;
 const { error } = await supabase.storage.from("productos").upload(nombreArchivo,file);
 if(error) throw error;
 const { data } = supabase.storage.from("productos").getPublicUrl(nombreArchivo);
 return {url:data.publicUrl, archivo:nombreArchivo};
}

const SUPREMO_EMAIL = "muebleriagonzalez02@gmail.com";
const WA_NUMBER      = "5562890828";

// ── Estado global ────────────────────────────
window.MG = {
  productos: [],
  nav:       [],
  usuario:   null,
  favoritos: [],
  rolAdmin:  null,   // "supremo" | "admin" | null
  categorias: [],    // [{id, nombre, subcategorias:[{id,nombre}]}]
  banners:   [],
  db, auth, WA_NUMBER
};

// ── Datos default ────────────────────────────
const PRODUCTOS_DEFAULT = [
  { nombre:"Burós",      precio:10000, categoria:"recamaras", imagen:"muebles/Buros.webp",  descripcion:"Madera sólida, varios colores", destacado:false },
  { nombre:"Cabecera 1", precio:10000, categoria:"recamaras", imagen:"muebles/Cabe.webp",   descripcion:"Individual / Matrimonial",      destacado:false },
  { nombre:"Cabecera 2", precio:11000, categoria:"recamaras", imagen:"muebles/Cabe1.webp",  descripcion:"Diseño moderno",                destacado:false },
  { nombre:"Cuna",       precio:10000, categoria:"cunas",     imagen:"muebles/Cuna.webp",   descripcion:"Madera nogal, segura y durable",destacado:true  },
  { nombre:"Ropero 1",   precio:13000, categoria:"roperos",   imagen:"muebles/Rope.webp",   descripcion:"3 puertas, madera natural",     destacado:true  },
  { nombre:"Ropero 2",   precio:15000, categoria:"roperos",   imagen:"muebles/Rope1.webp",  descripcion:"4 puertas con espejo",          destacado:true  },
  { nombre:"Tocador",    precio:12000, categoria:"tocadores", imagen:"muebles/Toca.webp",   descripcion:"Con espejo y cajones",          destacado:false },
];

const NAV_DEFAULT = [
  { texto:"Inicio",     href:"index.html"     },
  { texto:"Roperos",    href:"index.html#roperos"   },
  { texto:"Tocadores",  href:"index.html#tocadores" },
  { texto:"Recámaras",  href:"index.html#recamaras" },
  { texto:"Cunas",      href:"index.html#cunas"     },
  { texto:"Contacto",   href:"contacto.html"  },
  { texto:"Preguntas",  href:"preguntas.html" },
];

// ============================================
//  INICIALIZACIÓN GLOBAL
// ============================================
window.addEventListener("DOMContentLoaded", async () => {
  await initFirestore();
  await cargarNav();
  await cargarCategorias();
  await cargarBanners();
  renderNav();
  initHamburger();
  initAuth();
  updateFavBadge();
  renderAnunciosPublico();

  // Llamar init de página si existe
  if (typeof window.initPage === "function") window.initPage();
});

// ── Inicializar Firestore con defaults ───────
async function initFirestore() {
  await recargarProductos();

  const navDoc = await getDoc(doc(db, "config", "navegacion"));
  MG.nav = navDoc.exists() ? (navDoc.data().links || []) : NAV_DEFAULT;
}

// ── Recargar productos ───────────────────────
export async function recargarProductos() {
  const snap = await getDocs(collection(db, "productos"));
  MG.productos = [];
  snap.forEach(d => MG.productos.push({ id: d.id, ...d.data() }));
  return MG.productos;
}
window.recargarProductos = recargarProductos;

// ============================================
//  CATEGORÍAS Y SUBCATEGORÍAS (dinámicas, gestionadas por admins)
// ============================================
// /categorias/{catId}                        → { nombre, nombreNormalizado, orden }
// /categorias/{catId}/subcategorias/{subId}   → { nombre, nombreNormalizado, orden }

function normalizarNombre(s) {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function cargarCategorias() {
  const snap = await getDocs(collection(db, "categorias"));
  const cats = [];
  for (const d of snap.docs) {
    const subSnap = await getDocs(collection(db, "categorias", d.id, "subcategorias"));
    const subs = [];
    subSnap.forEach(s => subs.push({ id: s.id, ...s.data() }));
    subs.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    cats.push({ id: d.id, ...d.data(), subcategorias: subs });
  }
  cats.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  MG.categorias = cats;
}
window.cargarCategorias = cargarCategorias;

function buscarCategoria(catId) {
  return MG.categorias.find(c => c.id === catId) || null;
}
function buscarSubcategoria(catId, subId) {
  const cat = buscarCategoria(catId);
  return cat ? (cat.subcategorias.find(s => s.id === subId) || null) : null;
}
window.buscarCategoria = buscarCategoria;
window.buscarSubcategoria = buscarSubcategoria;

window.crearCategoria = async function (nombre) {
  nombre = (nombre || "").trim();
  if (!nombre) { showToast("Escribe un nombre de categoría"); return; }
  const norm = normalizarNombre(nombre);
  if (MG.categorias.some(c => c.nombreNormalizado === norm)) {
    showToast("Ya existe una categoría con ese nombre");
    return;
  }
  await addDoc(collection(db, "categorias"), {
    nombre, nombreNormalizado: norm, orden: MG.categorias.length, createdAt: serverTimestamp()
  });
  await cargarCategorias();
  showToast("Categoría creada", "success");
};

window.renombrarCategoria = async function (catId, nuevoNombre) {
  nuevoNombre = (nuevoNombre || "").trim();
  if (!nuevoNombre) return;
  await updateDoc(doc(db, "categorias", catId), {
    nombre: nuevoNombre, nombreNormalizado: normalizarNombre(nuevoNombre)
  });
  await cargarCategorias();
  showToast("Categoría renombrada", "success");
  // No se tocan productos: guardan solo el ID, no el nombre.
};

window.crearSubcategoria = async function (catId, nombre) {
  nombre = (nombre || "").trim();
  if (!nombre) { showToast("Escribe un nombre de subcategoría"); return; }
  const cat = buscarCategoria(catId);
  if (!cat) return;
  const norm = normalizarNombre(nombre);
  if (cat.subcategorias.some(s => s.nombreNormalizado === norm)) {
    showToast("Ya existe esa subcategoría en esta categoría");
    return;
  }
  await addDoc(collection(db, "categorias", catId, "subcategorias"), {
    nombre, nombreNormalizado: norm, orden: cat.subcategorias.length, createdAt: serverTimestamp()
  });
  await cargarCategorias();
  showToast("Subcategoría creada", "success");
};

window.renombrarSubcategoria = async function (catId, subId, nuevoNombre) {
  nuevoNombre = (nuevoNombre || "").trim();
  if (!nuevoNombre) return;
  await updateDoc(doc(db, "categorias", catId, "subcategorias", subId), {
    nombre: nuevoNombre, nombreNormalizado: normalizarNombre(nuevoNombre)
  });
  await cargarCategorias();
  showToast("Subcategoría renombrada", "success");
};

// Cuenta productos que usan una categoría o subcategoría específica
async function contarProductosEn(categoriaId, subcategoriaId) {
  let q;
  if (subcategoriaId) {
    q = query(collection(db, "productos"), where("subcategoriaId", "==", subcategoriaId));
  } else {
    q = query(collection(db, "productos"), where("categoriaId", "==", categoriaId));
  }
  const snap = await getDocs(q);
  return snap.size;
}

// Elimina una subcategoría. Si tiene productos, bloquea y exige migrarlos primero.
window.eliminarSubcategoria = async function (catId, subId, destinoSubId) {
  const n = await contarProductosEn(catId, subId);
  if (n > 0 && !destinoSubId) {
    showToast(`No se puede eliminar: ${n} producto(s) usan esta subcategoría. Renómbrala o elige a dónde migrarlos.`);
    return { bloqueado: true, cantidad: n };
  }
  if (n > 0 && destinoSubId) {
    // Encontrar la categoría padre real del destino (puede ser distinta a catId)
    let catDestinoId = catId;
    for (const c of MG.categorias) {
      if (c.subcategorias.some(s => s.id === destinoSubId)) { catDestinoId = c.id; break; }
    }
    const q = query(collection(db, "productos"), where("subcategoriaId", "==", subId));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.update(d.ref, { subcategoriaId: destinoSubId, categoriaId: catDestinoId }));
    await batch.commit();
    await recargarProductos();
    if (typeof window.renderProductos === "function") window.renderProductos();
  }
  await deleteDoc(doc(db, "categorias", catId, "subcategorias", subId));
  await cargarCategorias();
  showToast("Subcategoría eliminada", "success");
  return { bloqueado: false };
};

// Elimina una categoría completa. Bloquea si tiene subcategorías o productos directos.
window.eliminarCategoria = async function (catId) {
  const cat = buscarCategoria(catId);
  if (!cat) return { bloqueado: true, cantidad: 0 };
  if (cat.subcategorias.length > 0) {
    showToast("Primero elimina o migra todas las subcategorías de esta categoría.");
    return { bloqueado: true, cantidad: cat.subcategorias.length, motivo: "subcategorias" };
  }
  const n = await contarProductosEn(catId, null);
  if (n > 0) {
    showToast(`No se puede eliminar: ${n} producto(s) usan esta categoría directamente.`);
    return { bloqueado: true, cantidad: n, motivo: "productos" };
  }
  await deleteDoc(doc(db, "categorias", catId));
  await cargarCategorias();
  showToast("Categoría eliminada", "success");
  return { bloqueado: false };
};

// ============================================
//  ANUNCIOS / BANNER PROMOCIONAL
// ============================================
// /banners/{id} → { imagen, texto, link, orden, createdAt }

async function cargarBanners() {
  const snap = await getDocs(collection(db, "banners"));
  const banners = [];
  snap.forEach(d => banners.push({ id: d.id, ...d.data() }));
  banners.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  MG.banners = banners;
}
window.cargarBanners = cargarBanners;

window.agregarAnuncio = async function () {
  const archivo = document.getElementById("nuevoAnuncioImg").files[0];
  const texto   = document.getElementById("nuevoAnuncioTexto").value.trim();
  const link    = document.getElementById("nuevoAnuncioLink").value.trim();
  const msg     = document.getElementById("anuncioMsg");

  if (!archivo) { msg.style.color = "red"; msg.textContent = "Selecciona una imagen"; return; }

  try {
    const resultado = await subirImagenSupabase(archivo);
    const nuevo = { imagen: resultado.url, texto, link, orden: MG.banners.length, createdAt: serverTimestamp() };
    const ref = await addDoc(collection(db, "banners"), nuevo);
    MG.banners.push({ id: ref.id, ...nuevo });
    msg.style.color = "green";
    msg.textContent = "Anuncio agregado";
    document.getElementById("nuevoAnuncioImg").value = "";
    document.getElementById("nuevoAnuncioTexto").value = "";
    document.getElementById("nuevoAnuncioLink").value = "";
    renderAdminAnuncios();
    renderAnunciosPublico();
  } catch (e) {
    msg.style.color = "red";
    msg.textContent = "Error: " + e.message;
  }
};

window.eliminarAnuncio = async function (id) {
  if (!confirm("¿Eliminar este anuncio?")) return;
  await deleteDoc(doc(db, "banners", id));
  MG.banners = MG.banners.filter(b => b.id !== id);
  renderAdminAnuncios();
  renderAnunciosPublico();
};

function renderAdminAnuncios() {
  const list = document.getElementById("adminAnunciosList");
  if (!list) return;
  if (!MG.banners.length) { list.innerHTML = '<p class="admin-nota">No hay anuncios todavía.</p>'; return; }
  list.innerHTML = MG.banners.map(b => `
    <div class="admin-prod-row">
      <img src="${b.imagen}" alt="anuncio" onerror="this.style.opacity='0.15'">
      <div class="admin-prod-fields">
        <span>${b.texto || "(sin texto)"}</span>
        <span style="font-size:12px;color:var(--texto-claro)">${b.link || "(sin link)"}</span>
      </div>
      <div class="admin-prod-btns">
        <button class="btn-eliminar-prod" onclick="eliminarAnuncio('${b.id}')">✕</button>
      </div>
    </div>
  `).join("");
}

// Render público: slider deslizable con scroll-snap (el usuario lo mueve, no cambia solo)
function renderAnunciosPublico() {
  const section = document.getElementById("anuncios");
  const track = document.getElementById("anunciosTrack");
  if (!section || !track) return;

  if (!MG.banners.length) { section.style.display = "none"; return; }
  section.style.display = "block";

  track.innerHTML = MG.banners.map(b => {
    const contenido = `
      <img src="${b.imagen}" alt="${b.texto || 'Anuncio'}" onerror="this.style.opacity='0.15'">
      ${b.texto ? `<span class="anuncio-texto">${b.texto}</span>` : ""}
    `;
    return b.link
      ? `<a class="anuncio-slide" href="${b.link}" target="_blank" rel="noopener">${contenido}</a>`
      : `<div class="anuncio-slide">${contenido}</div>`;
  }).join("");

  const prevBtn = document.getElementById("anunciosPrev");
  const nextBtn = document.getElementById("anunciosNext");
  if (prevBtn) prevBtn.onclick = () => track.scrollBy({ left: -track.clientWidth, behavior: "smooth" });
  if (nextBtn) nextBtn.onclick = () => track.scrollBy({ left: track.clientWidth, behavior: "smooth" });
}

// ============================================
//  NAVEGACIÓN / DRAWER
// ============================================
async function cargarNav() {
  const navDoc = await getDoc(doc(db, "config", "navegacion"));
  if (navDoc.exists()) MG.nav = navDoc.data().links || [];
}

function renderNav() {
  const submenu = document.getElementById("drawerCatSubmenu");
  if (!submenu) return;
  if (!MG.categorias.length) { submenu.innerHTML = ""; return; }
  submenu.innerHTML = MG.categorias.map(cat => `
    <div class="drawer-cat-group">
      <button class="drawer-cat-header" onclick="toggleGrupoCategoria(this)">
        <span>${cat.nombre}</span>
        <svg class="drawer-cat-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="drawer-subcat-list">
        ${cat.subcategorias.map(sub =>
          `<a href="javascript:void(0)" onclick="irACategoria('${cat.id}')">${sub.nombre}</a>`
        ).join("") || `<a href="javascript:void(0)" onclick="irACategoria('${cat.id}')">Ver todo</a>`}
      </div>
    </div>
  `).join("");
}

window.toggleGrupoCategoria = function (btn) {
  const grupo = btn.parentElement;
  grupo.classList.toggle("open");
};

// Nota: hoy filtra por la categoría padre completa. El filtro fino por
// subcategoría específica ya está disponible desde los desplegables de
// la barra de filtros; este acceso desde el drawer manda a la categoría completa.
window.irACategoria = function (catId) {
  document.getElementById("navDrawer")?.classList.remove("open");
  document.getElementById("navOverlay")?.classList.remove("open");
  document.body.style.overflow = "";
  if (typeof window.filtrarCat === "function") {
    window.filtrarCat(catId, null, null);
  }
  document.getElementById("todos")?.scrollIntoView({ behavior: "smooth" });
};

function initHamburger() {
  const btn     = document.getElementById("hamburgerBtn");
  const drawer  = document.getElementById("navDrawer");
  const overlay = document.getElementById("navOverlay");
  const closeBtn= document.getElementById("drawerClose");
  const catToggle = document.getElementById("drawerCatToggle");
  const catSub    = document.getElementById("drawerCatSubmenu");

  if (!btn) return;

  const openDrawer  = () => { drawer.classList.add("open"); overlay.classList.add("open"); btn.classList.add("open"); document.body.style.overflow = "hidden"; };
  const closeDrawer = () => { drawer.classList.remove("open"); overlay.classList.remove("open"); btn.classList.remove("open"); document.body.style.overflow = ""; };

  btn.addEventListener("click", openDrawer);
  overlay.addEventListener("click", closeDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);

  if (catToggle && catSub) {
    catToggle.addEventListener("click", () => {
      catToggle.classList.toggle("open");
      catSub.classList.toggle("open");
    });
  }

  // Cerrar drawer al navegar
  drawer.querySelectorAll("a").forEach(a => a.addEventListener("click", closeDrawer));

  // Marcar página activa
  const current = window.location.pathname.split("/").pop() || "index.html";
  drawer.querySelectorAll("a[href]").forEach(a => {
    if (a.getAttribute("href") === current) a.classList.add("active");
  });
}

// ============================================
//  AUTH — GOOGLE LOGIN
// ============================================
function initAuth() {
  // Al volver del redirect de Google, esto resuelve con el usuario recién logueado
  getRedirectResult(auth).then(result => {
    if (result?.user) showToast("¡Bienvenido! Sesión iniciada", "success");
  }).catch(() => {
    showToast("No se pudo iniciar sesión", "error");
  });

  onAuthStateChanged(auth, async (user) => {
    MG.usuario = user;
    renderAuthBtn();
    if (user) {
      await cargarFavoritos(user.uid);
      updateFavBadge();
      await revisarYMigrarRolAdmin(user);
    } else {
      MG.favoritos = [];
      MG.rolAdmin  = null;
      updateFavBadge();
    }
    // Refrescar botones fav si la página los tiene
    if (typeof window.refreshFavButtons === "function") window.refreshFavButtons();
  });
}

// ============================================
//  ROLES DE ADMINISTRADOR
// ============================================
// admins_roles/{uid}      → { email, role: "supremo"|"admin", active, addedBy, addedAt }
// invitaciones_admin/{email} → { role, invitedBy, invitedAt }  (solo el supremo puede escribir aquí)
// admin_actions/{autoId}  → bitácora de quién otorgó/quitó permisos a quién

async function revisarYMigrarRolAdmin(user) {
  try {
    const rolRef  = doc(db, "admins_roles", user.uid);
    const rolSnap = await getDoc(rolRef);

    if (rolSnap.exists()) {
      const data = rolSnap.data();
      MG.rolAdmin = data.active ? data.role : null;
      return;
    }

    // No tiene rol todavía. ¿Es el correo supremo (bootstrap único)?
    if (user.email === SUPREMO_EMAIL) {
      await setDoc(rolRef, {
        email: user.email,
        role: "supremo",
        active: true,
        addedBy: null,
        addedAt: serverTimestamp()
      });
      MG.rolAdmin = "supremo";
      return;
    }

    // ¿Tiene una invitación pendiente del supremo?
    const invRef  = doc(db, "invitaciones_admin", user.email);
    const invSnap = await getDoc(invRef);
    if (invSnap.exists()) {
      const inv = invSnap.data();
      await setDoc(rolRef, {
        email: user.email,
        role: inv.role === "supremo" ? "supremo" : "admin",
        active: true,
        addedBy: inv.invitedBy || null,
        addedAt: serverTimestamp()
      });
      MG.rolAdmin = inv.role === "supremo" ? "supremo" : "admin";
      return;
    }

    MG.rolAdmin = null; // no es admin
  } catch (e) {
    console.error("Error revisando rol de admin:", e);
    MG.rolAdmin = null;
  }
}

async function registrarAccionAdmin(action, targetUid, targetEmail) {
  try {
    await addDoc(collection(db, "admin_actions"), {
      actorUid: MG.usuario?.uid || null,
      actorEmail: MG.usuario?.email || null,
      targetUid: targetUid || null,
      targetEmail: targetEmail || null,
      action,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("No se pudo registrar la acción:", e);
  }
}

function renderAuthBtn() {
  const btn = document.getElementById("authBtn");
  if (!btn) return;
  if (MG.usuario) {
    btn.title = `Sesión: ${MG.usuario.displayName || MG.usuario.email}\nClic para cerrar sesión`;
    btn.querySelector("svg")?.setAttribute("data-logged", "true");
  } else {
    btn.title = "Iniciar sesión con Google para guardar favoritos";
  }
}

window.toggleAuth = async function () {
  if (MG.usuario) {
    if (confirm(`¿Cerrar sesión de ${MG.usuario.displayName || MG.usuario.email}?`)) {
      await signOut(auth);
      showToast("Sesión cerrada");
    }
    return;
  }

  try {
    await signInWithPopup(auth, provider);
    showToast("¡Bienvenido! Sesión iniciada", "success");
  } catch (e) {
    // Si el usuario cerró el popup a propósito, no hacer nada (no es un error real).
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") {
      return;
    }
    // Si el navegador BLOQUEÓ el popup (común en PWA instalada o navegadores
    // restrictivos), ahí sí caer a redirect como plan B.
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      try {
        await signInWithRedirect(auth, provider);
      } catch (e2) {
        showToast("No se pudo iniciar sesión", "error");
      }
      return;
    }
    showToast("No se pudo iniciar sesión", "error");
  }
};

// ============================================
//  FAVORITOS
// ============================================
async function cargarFavoritos(uid) {
  const ref = doc(db, "favoritos", uid);
  const snap = await getDoc(ref);
  MG.favoritos = snap.exists() ? (snap.data().ids || []) : [];
}

async function guardarFavoritos(uid) {
  await setDoc(doc(db, "favoritos", uid), { ids: MG.favoritos });
}

window.toggleFavorito = async function (productoId) {
  if (!MG.usuario) {
    showToast("Inicia sesión con Google para guardar favoritos");
    return;
  }
  const idx = MG.favoritos.indexOf(productoId);
  if (idx === -1) {
    MG.favoritos.push(productoId);
    showToast("Agregado a favoritos ❤️", "success");
  } else {
    MG.favoritos.splice(idx, 1);
    showToast("Eliminado de favoritos");
  }
  await guardarFavoritos(MG.usuario.uid);
  updateFavBadge();
  if (typeof window.refreshFavButtons === "function") window.refreshFavButtons();
};

function updateFavBadge() {
  const badge = document.getElementById("favBadge");
  if (!badge) return;
  const n = MG.favoritos.length;
  badge.textContent = n > 9 ? "9+" : n;
  badge.classList.toggle("visible", n > 0);
}

// ============================================
//  WHATSAPP HELPERS
// ============================================
window.abrirWAContacto = function (nombre, telefono, mensaje) {
  const text = encodeURIComponent(
    `Hola, me contacto desde el sitio web de Mueblería González.\n\n` +
    `Nombre: ${nombre}\nTeléfono: ${telefono}\nMensaje: ${mensaje}`
  );
  window.open(`https://wa.me/${WA_NUMBER}?text=${text}`, "_blank");
};

window.abrirWAPedido = function (producto, precio, descripcion) {
  const text = encodeURIComponent(
    `Hola, me interesa realizar un pedido:\n\n` +
    `🪑 Producto: ${producto}\n` +
    `💰 Precio: $${Number(precio).toLocaleString("es-MX")} MXN\n` +
    `📋 Descripción: ${descripcion || "N/A"}\n\n` +
    `¿Podría darme más información?`
  );
  window.open(`https://wa.me/${WA_NUMBER}?text=${text}`, "_blank");
};

// ============================================
//  ADMIN
// ============================================
window.abrirLogin = async function () {
  if (!MG.usuario) {
    showToast("Inicia sesión con Google primero");
    return;
  }
  if (!MG.rolAdmin) {
    showToast("No tienes permisos de administrador");
    return;
  }
  abrirAdmin();
};

window.cerrarLogin = function () {
  document.getElementById("modalLogin").style.display = "none";
  if (document.getElementById("loginError"))
    document.getElementById("loginError").textContent = "";
};

window.verificarLogin = function () {
  showToast("El acceso ahora es por correo de Google, no por contraseña");
  cerrarLogin();
};

function abrirAdmin() {
  document.getElementById("panelAdmin").style.display = "block";
  document.body.style.overflow = "hidden";
  renderAdminProductos();
  renderNavEditor();
  renderCategoriasPanel();
  renderAdminAnuncios();
  llenarSelectsCategoria();

  const tabSupremo = document.getElementById("tabBtnAdmins");
  if (tabSupremo) {
    tabSupremo.style.display = MG.rolAdmin === "supremo" ? "inline-block" : "none";
    if (MG.rolAdmin === "supremo") renderAdminsPanel();
  }
}

// ============================================
//  GESTIÓN DE CATEGORÍAS/SUBCATEGORÍAS (panel admin)
// ============================================
function renderCategoriasPanel() {
  const cont = document.getElementById("categoriasList");
  if (!cont) return;
  if (!MG.categorias.length) {
    cont.innerHTML = '<p class="admin-nota">Aún no hay categorías. Crea la primera abajo.</p>';
  } else {
    cont.innerHTML = MG.categorias.map(cat => `
      <div class="admin-prod-row" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <input type="text" value="${cat.nombre}" id="catnombre-${cat.id}" style="font-weight:600">
          <div style="display:flex;gap:6px">
            <button class="btn-guardar-prod" onclick="renombrarCategoria('${cat.id}', document.getElementById('catnombre-${cat.id}').value)">💾</button>
            <button class="btn-eliminar-prod" onclick="confirmarEliminarCategoria('${cat.id}')">✕ Categoría</button>
          </div>
        </div>
        <div style="margin-left:16px;display:flex;flex-direction:column;gap:6px">
          ${cat.subcategorias.map(sub => `
            <div style="display:flex;gap:6px;align-items:center">
              <input type="text" value="${sub.nombre}" id="subnombre-${cat.id}-${sub.id}" style="flex:1">
              <button class="btn-guardar-prod" onclick="renombrarSubcategoria('${cat.id}','${sub.id}', document.getElementById('subnombre-${cat.id}-${sub.id}').value)">💾</button>
              <button class="btn-eliminar-prod" onclick="confirmarEliminarSubcategoria('${cat.id}','${sub.id}')">✕</button>
            </div>
          `).join("")}
          <div style="display:flex;gap:6px;margin-top:4px">
            <input type="text" id="nuevaSub-${cat.id}" placeholder="Nueva subcategoría">
            <button class="btn-guardar-prod" onclick="crearSubcategoria('${cat.id}', document.getElementById('nuevaSub-${cat.id}').value).then(() => renderCategoriasYSelects())">➕</button>
          </div>
        </div>
      </div>
    `).join("");
  }

  const addCatHtml = `
    <div style="display:flex;gap:6px;margin-top:16px">
      <input type="text" id="nuevaCatNombre" placeholder="Nueva categoría (ej: Oficina)">
      <button class="btn-guardar" onclick="crearCategoria(document.getElementById('nuevaCatNombre').value).then(() => renderCategoriasYSelects())">➕ Crear categoría</button>
    </div>
  `;
  cont.insertAdjacentHTML("afterend", addCatHtml);
}

async function renderCategoriasYSelects() {
  renderCategoriasPanel();
  llenarSelectsCategoria();
  renderNav();
  if (typeof window.renderProductos === "function") window.renderProductos();
}
window.renderCategoriasYSelects = renderCategoriasYSelects;

window.confirmarEliminarSubcategoria = async function (catId, subId) {
  const sub = buscarSubcategoria(catId, subId);
  if (!confirm(`¿Eliminar la subcategoría "${sub?.nombre}"?`)) return;
  const resultado = await eliminarSubcategoria(catId, subId);
  if (resultado.bloqueado) {
    const otras = MG.categorias.flatMap(c => c.subcategorias.map(s => ({ label: `${c.nombre} > ${s.nombre}`, id: s.id })))
      .filter(s => s.id !== subId);
    if (otras.length === 0) {
      alert(`Hay ${resultado.cantidad} producto(s) usando esta subcategoría y no existe otra a donde migrarlos. Renómbrala en vez de borrarla, o crea primero otra subcategoría destino.`);
      return;
    }
    const opciones = otras.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
    const sel = prompt(`Hay ${resultado.cantidad} producto(s) usando esta subcategoría.\nElige el número de la subcategoría destino para migrarlos, o cancela:\n\n${opciones}`);
    const idx = parseInt(sel, 10) - 1;
    if (otras[idx]) {
      await eliminarSubcategoria(catId, subId, otras[idx].id);
      renderCategoriasYSelects();
    }
  } else {
    renderCategoriasYSelects();
  }
};

window.confirmarEliminarCategoria = async function (catId) {
  const cat = buscarCategoria(catId);
  if (!confirm(`¿Eliminar la categoría "${cat?.nombre}"?`)) return;
  const resultado = await eliminarCategoria(catId);
  if (resultado.bloqueado) {
    if (resultado.motivo === "subcategorias") {
      alert(`Esta categoría tiene ${resultado.cantidad} subcategoría(s). Elimínalas o migra sus productos primero.`);
    } else {
      alert(`Hay ${resultado.cantidad} producto(s) usando esta categoría directamente. Reasígnalos a otra categoría/subcategoría desde "Editar Productos" antes de borrarla.`);
    }
  } else {
    renderCategoriasYSelects();
  }
};

// Llena los <select> de categoría/subcategoría en los formularios de producto
function llenarSelectsCategoria() {
  const selectsCategoria = document.querySelectorAll(".select-categoria");
  selectsCategoria.forEach(sel => {
    const actual = sel.dataset.actual || "";
    sel.innerHTML = '<option value="">Selecciona categoría</option>' +
      MG.categorias.map(c => `<option value="${c.id}" ${c.id === actual ? "selected" : ""}>${c.nombre}</option>`).join("");
  });
  document.querySelectorAll(".select-subcategoria").forEach(sel => {
    actualizarSelectSubcategoria(sel);
  });
}

function actualizarSelectSubcategoria(selectSub) {
  const catId = document.getElementById(selectSub.dataset.catSelect)?.value;
  const cat = catId ? buscarCategoria(catId) : null;
  const actual = selectSub.dataset.actual || "";
  if (!cat || cat.subcategorias.length === 0) {
    selectSub.innerHTML = '<option value="">(sin subcategoría)</option>';
    return;
  }
  selectSub.innerHTML = '<option value="">(sin subcategoría)</option>' +
    cat.subcategorias.map(s => `<option value="${s.id}" ${s.id === actual ? "selected" : ""}>${s.nombre}</option>`).join("");
}
window.actualizarSelectSubcategoria = actualizarSelectSubcategoria;

// ============================================
//  GESTIÓN DE ADMINISTRADORES (solo supremo)
// ============================================
async function renderAdminsPanel() {
  const list = document.getElementById("adminsList");
  if (!list) return;
  list.innerHTML = '<p class="admin-nota">Cargando administradores...</p>';

  const snap = await getDocs(collection(db, "admins_roles"));
  const admins = [];
  snap.forEach(d => admins.push({ uid: d.id, ...d.data() }));

  if (admins.length === 0) {
    list.innerHTML = '<p class="admin-nota">Aún no hay administradores migrados.</p>';
  } else {
    list.innerHTML = admins.map(a => {
      const esYo = a.uid === MG.usuario.uid;
      const soyUnicoSupremo = a.role === "supremo" && admins.filter(x => x.role === "supremo" && x.active).length <= 1;
      return `
        <div class="admin-prod-row" id="admin-row-${a.uid}">
          <div class="admin-prod-fields">
            <span style="font-weight:600">${a.email}</span>
            <span style="font-size:12px;color:var(--texto-claro)">Rol: ${a.role === "supremo" ? "Supremo" : "Admin"} · ${a.active ? "Activo" : "Desactivado"}</span>
          </div>
          <div class="admin-prod-btns">
            ${a.role !== "supremo" ? `<button class="btn-guardar-prod" onclick="promoverASupremo('${a.uid}','${a.email}')">⬆️ Hacer supremo</button>` : ""}
            <button class="btn-eliminar-prod"
              onclick="cambiarEstadoAdmin('${a.uid}','${a.email}', ${!a.active})"
              ${esYo && a.active && soyUnicoSupremo ? "disabled title='No puedes desactivarte siendo el único supremo activo'" : ""}>
              ${a.active ? "🚫 Desactivar" : "✅ Reactivar"}
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  // Formulario de invitación
  const inviteHtml = `
    <div class="form-nuevo" style="margin-top:20px">
      <label>Correo Gmail a invitar *</label>
      <input type="email" id="invitarEmail" placeholder="correo@gmail.com">
      <label>Rol *</label>
      <select id="invitarRol">
        <option value="admin">Admin</option>
        <option value="supremo">Supremo</option>
      </select>
      <button class="btn-guardar" onclick="invitarAdmin()">➕ Invitar</button>
      <p id="invitarMsg" class="admin-msg"></p>
    </div>
  `;
  list.insertAdjacentHTML("afterend", inviteHtml);
}

window.invitarAdmin = async function () {
  const email = document.getElementById("invitarEmail").value.trim().toLowerCase();
  const role  = document.getElementById("invitarRol").value;
  const msg   = document.getElementById("invitarMsg");

  if (!email || !email.includes("@")) {
    msg.style.color = "red";
    msg.textContent = "Ingresa un correo válido";
    return;
  }

  try {
    await setDoc(doc(db, "invitaciones_admin", email), {
      role,
      invitedBy: MG.usuario.uid,
      invitedByEmail: MG.usuario.email,
      invitedAt: serverTimestamp()
    });
    await registrarAccionAdmin("invited", null, email);
    msg.style.color = "green";
    msg.textContent = `Invitación enviada. ${email} tendrá acceso de ${role === "supremo" ? "supremo" : "admin"} en cuanto inicie sesión con Google.`;
    document.getElementById("invitarEmail").value = "";
  } catch (e) {
    msg.style.color = "red";
    msg.textContent = "Error: " + e.message;
  }
};

window.cambiarEstadoAdmin = async function (uid, email, nuevoEstado) {
  if (uid === MG.usuario.uid && nuevoEstado === false) {
    const snap = await getDocs(collection(db, "admins_roles"));
    let supremosActivos = 0;
    snap.forEach(d => { if (d.data().role === "supremo" && d.data().active) supremosActivos++; });
    if (supremosActivos <= 1) {
      showToast("No puedes desactivarte: eres el único supremo activo. Pide a otro supremo que lo haga.");
      return;
    }
  }
  if (!confirm(`¿${nuevoEstado ? "Reactivar" : "Desactivar"} a ${email}?`)) return;

  await updateDoc(doc(db, "admins_roles", uid), { active: nuevoEstado });
  await registrarAccionAdmin(nuevoEstado ? "reactivated" : "revoked", uid, email);
  showToast(nuevoEstado ? "Administrador reactivado" : "Permisos revocados", "success");
  renderAdminsPanel();
};

window.promoverASupremo = async function (uid, email) {
  if (!confirm(`¿Convertir a ${email} en administrador supremo?`)) return;
  await updateDoc(doc(db, "admins_roles", uid), { role: "supremo" });
  await registrarAccionAdmin("promoted_supremo", uid, email);
  showToast("Ahora es administrador supremo", "success");
  renderAdminsPanel();
};

window.cerrarAdmin = function () {
  document.getElementById("panelAdmin").style.display = "none";
  document.body.style.overflow = "";
};

window.mostrarTab = function (tabId) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  event.target.classList.add("active");
};

function renderAdminProductos() {
  const list = document.getElementById("adminProductosList");
  if (!list) return;
  if (!MG.productos.length) { list.innerHTML = '<p class="admin-nota">No hay productos.</p>'; return; }
  list.innerHTML = MG.productos.map(p => {
    const imgs = p.imagenes && p.imagenes.length ? p.imagenes : (p.imagen ? [p.imagen] : []);
    return `
    <div class="admin-prod-row" id="row-${p.id}">
      <img src="${imgs[0] || ""}" alt="${p.nombre}" onerror="this.style.opacity='0.15'">
      <div class="admin-prod-fields">
        <input class="input-nombre" type="text"   id="n-${p.id}"  value="${p.nombre}"         placeholder="Nombre">
        <input class="input-precio" type="number" id="pr-${p.id}" value="${p.precio}"          placeholder="Precio">
        <select class="select-categoria" id="c-${p.id}" data-actual="${p.categoriaId || ''}" onchange="actualizarSelectSubcategoria(document.getElementById('sc-${p.id}'))"></select>
        <select class="select-subcategoria" id="sc-${p.id}" data-cat-select="c-${p.id}" data-actual="${p.subcategoriaId || ''}"></select>
        <input class="input-desc"   type="text"   id="d-${p.id}"  value="${p.descripcion||''}" placeholder="Descripción">
        <label style="font-size:12px;color:var(--texto-claro)">Reemplazar fotos (1 a 4, opcional)</label>
        <input class="input-img" type="file" id="i-${p.id}" accept="image/*" multiple>
        <label class="check-destacado">
          <input type="checkbox" id="dest-${p.id}" ${p.destacado ? "checked" : ""}> Destacado
        </label>
      </div>
      <div class="admin-prod-btns">
        <button class="btn-guardar-prod" onclick="guardarProducto('${p.id}')">💾 Guardar</button>
        <button class="btn-eliminar-prod" onclick="eliminarProducto('${p.id}')">✕</button>
      </div>
    </div>
  `;
  }).join("");
  llenarSelectsCategoria();
}

window.guardarProducto = async function (id) {
  const nombre        = document.getElementById(`n-${id}`).value.trim();
  const precio         = Number(document.getElementById(`pr-${id}`).value);
  const categoriaId    = document.getElementById(`c-${id}`).value;
  const subcategoriaId = document.getElementById(`sc-${id}`).value || null;
  const descripcion   = document.getElementById(`d-${id}`).value.trim();
  const destacado     = document.getElementById(`dest-${id}`).checked;
  const archivos      = Array.from(document.getElementById(`i-${id}`).files || []);

  if (!nombre || !precio || !categoriaId) { alert("Completa nombre, precio y categoría."); return; }
  if (archivos.length > 4) { alert("Máximo 4 fotos por producto."); return; }

  const cambios = { nombre, precio, categoriaId, subcategoriaId, descripcion, destacado };

  if (archivos.length > 0) {
    try {
      const subidas = await Promise.all(archivos.map(f => subirImagenSupabase(f)));
      cambios.imagenes = subidas.map(s => s.url);
    } catch (e) {
      alert("Error subiendo imágenes: " + e.message);
      return;
    }
  }

  await updateDoc(doc(db, "productos", id), cambios);
  const idx = MG.productos.findIndex(p => p.id === id);
  if (idx !== -1) MG.productos[idx] = { ...MG.productos[idx], ...cambios };

  const btn = document.querySelector(`#row-${id} .btn-guardar-prod`);
  btn.textContent = "✓ Guardado";
  btn.style.background = "#27ae60";
  setTimeout(() => { btn.textContent = "💾 Guardar"; btn.style.background = ""; }, 1500);

  renderAdminProductos();
  if (typeof window.renderProductos === "function") window.renderProductos();
};

window.eliminarProducto = async function (id) {
  if (!confirm("¿Eliminar este producto? No se puede deshacer.")) return;
  await deleteDoc(doc(db, "productos", id));
  MG.productos = MG.productos.filter(p => p.id !== id);
  renderAdminProductos();
  if (typeof window.renderProductos === "function") window.renderProductos();
};

window.agregarProducto = async function () {

  const nombre        = document.getElementById("nuevoNombre").value.trim();
  const precio         = Number(document.getElementById("nuevoPrecio").value);
  const categoriaId    = document.getElementById("nuevaCategoria").value;
  const subcategoriaId = document.getElementById("nuevaSubcategoria").value || null;

  const archivos = Array.from(document.getElementById("nuevaImagen").files || []);

  const descripcion = document.getElementById("nuevaDesc").value.trim();
  const destacado = document.getElementById("nuevoDestacado")?.checked || false;

  const msg = document.getElementById("nuevoMsg");

  if (!nombre || !precio || !categoriaId || archivos.length === 0) {
    msg.style.color = "red";
    msg.textContent = "Completa nombre, precio, categoría y al menos 1 foto";
    return;
  }
  if (archivos.length > 4) {
    msg.style.color = "red";
    msg.textContent = "Máximo 4 fotos por producto";
    return;
  }

  try {

    const subidas = await Promise.all(archivos.map(f => subirImagenSupabase(f)));
    const imagenes = subidas.map(s => s.url);

    const nuevoProducto = {
      nombre, precio, categoriaId, subcategoriaId,
      imagenes,
      descripcion, destacado
    };

    const ref = await addDoc(collection(db, "productos"), nuevoProducto);
    MG.productos.push({ id: ref.id, ...nuevoProducto });

    msg.style.color = "green";
    msg.textContent = `Producto agregado con ${imagenes.length} foto(s)`;
    document.getElementById("nuevaImagen").value = "";

  } catch(error) {

    console.error(error);

    msg.style.color = "red";
    msg.textContent = error.message;
  }
};

function renderNavEditor() {
  const editor = document.getElementById("navLinksEditor");
  if (!editor) return;
  editor.innerHTML = MG.nav.map((l, i) => `
    <div class="nav-link-row">
      <span style="font-size:12px;color:var(--texto-claro);min-width:20px">${i+1}.</span>
      <input type="text" id="nav-texto-${i}" value="${l.texto}" placeholder="Texto">
      <input type="text" id="nav-href-${i}"  value="${l.href}"  placeholder="URL o #ancla">
    </div>
  `).join("");
}

window.guardarNavLinks = async function () {
  const links = MG.nav.map((_, i) => ({
    texto: document.getElementById(`nav-texto-${i}`)?.value.trim(),
    href:  document.getElementById(`nav-href-${i}`)?.value.trim(),
  })).filter(l => l.texto && l.href);
  await setDoc(doc(db, "config", "navegacion"), { links });
  MG.nav = links;
  const btn = document.querySelector("#tabCategorias .btn-guardar");
  if (btn) { btn.textContent = "✓ Guardado"; btn.style.background = "#27ae60"; setTimeout(() => { btn.textContent = "💾 Guardar Navegación"; btn.style.background = ""; }, 2000); }
};

// ============================================
//  UTILIDADES
// ============================================
window.showToast = function (msg, type = "") {
  let toast = document.getElementById("toastGlobal");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toastGlobal";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add("show"); }); });
  setTimeout(() => toast.classList.remove("show"), 3000);
};

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
window.capitalize = capitalize;
