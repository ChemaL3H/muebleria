// ============================================
//  MUEBLERÍA GONZÁLEZ — SHARED JS
//  Firebase Firestore + Auth + Favoritos + Admin
// ============================================


import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, addDoc,
  updateDoc, deleteDoc, doc, setDoc, getDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  signInWithPopup,
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

async function esAdmin(email) {
  if (!email) return false;
  try {
    const snap = await getDoc(doc(db, "admins", email));
    return snap.exists();
  } catch (e) {
    return false; // permission-denied u otro error → tratar como no-admin
  }
}
const WA_NUMBER   = "527791023240";

// ── Estado global ────────────────────────────
window.MG = {
  productos: [],
  nav:       [],
  usuario:   null,
  favoritos: [],
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
  renderNav();
  initHamburger();
  initAuth();
  updateFavBadge();

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
//  NAVEGACIÓN / DRAWER
// ============================================
async function cargarNav() {
  const navDoc = await getDoc(doc(db, "config", "navegacion"));
  if (navDoc.exists()) MG.nav = navDoc.data().links || [];
}

function renderNav() {
  const submenu = document.getElementById("drawerCatSubmenu");
  if (!submenu) return;
  // Llenar categorías únicas desde productos
  const cats = [...new Set(MG.productos.map(p => p.categoria))];
  submenu.innerHTML = cats.map(c =>
    `<a href="index.html#${c}">${capitalize(c)}</a>`
  ).join("");
}

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
  onAuthStateChanged(auth, async (user) => {
    MG.usuario = user;
    renderAuthBtn();
    if (user) {
      await cargarFavoritos(user.uid);
      updateFavBadge();
    } else {
      MG.favoritos = [];
      updateFavBadge();
    }
    // Refrescar botones fav si la página los tiene
    if (typeof window.refreshFavButtons === "function") window.refreshFavButtons();
  });
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
  } else {
    try {
      await signInWithPopup(auth, provider);
      showToast("¡Bienvenido! Sesión iniciada", "success");
    } catch (e) {
      showToast("No se pudo iniciar sesión", "error");
    }
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
  const admin = await esAdmin(MG.usuario.email);
  if (!admin) {
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
}

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
  list.innerHTML = MG.productos.map(p => `
    <div class="admin-prod-row" id="row-${p.id}">
      <img src="${p.imagen}" alt="${p.nombre}" onerror="this.style.opacity='0.15'">
      <div class="admin-prod-fields">
        <input class="input-nombre" type="text"   id="n-${p.id}"  value="${p.nombre}"         placeholder="Nombre">
        <input class="input-precio" type="number" id="pr-${p.id}" value="${p.precio}"          placeholder="Precio">
        <input class="input-cat"    type="text"   id="c-${p.id}"  value="${p.categoria}"       placeholder="Categoría">
        <input class="input-img"    type="text"   id="i-${p.id}"  value="${p.imagen}"          placeholder="muebles/img.webp">
        <input class="input-desc"   type="text"   id="d-${p.id}"  value="${p.descripcion||''}" placeholder="Descripción">
        <label class="check-destacado">
          <input type="checkbox" id="dest-${p.id}" ${p.destacado ? "checked" : ""}> Destacado
        </label>
      </div>
      <div class="admin-prod-btns">
        <button class="btn-guardar-prod" onclick="guardarProducto('${p.id}')">💾 Guardar</button>
        <button class="btn-eliminar-prod" onclick="eliminarProducto('${p.id}')">✕</button>
      </div>
    </div>
  `).join("");
}

window.guardarProducto = async function (id) {
  const nombre      = document.getElementById(`n-${id}`).value.trim();
  const precio      = Number(document.getElementById(`pr-${id}`).value);
  const categoria   = document.getElementById(`c-${id}`).value.trim();
  const imagen      = document.getElementById(`i-${id}`).value.trim();
  const descripcion = document.getElementById(`d-${id}`).value.trim();
  const destacado   = document.getElementById(`dest-${id}`).checked;

  if (!nombre || !precio || !categoria || !imagen) { alert("Completa los campos obligatorios."); return; }

  await updateDoc(doc(db, "productos", id), { nombre, precio, categoria, imagen, descripcion, destacado });
  const idx = MG.productos.findIndex(p => p.id === id);
  if (idx !== -1) MG.productos[idx] = { id, nombre, precio, categoria, imagen, descripcion, destacado };

  const btn = document.querySelector(`#row-${id} .btn-guardar-prod`);
  btn.textContent = "✓ Guardado";
  btn.style.background = "#27ae60";
  setTimeout(() => { btn.textContent = "💾 Guardar"; btn.style.background = ""; }, 1500);

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

  const nombre = document.getElementById("nuevoNombre").value.trim();
  const precio = Number(document.getElementById("nuevoPrecio").value);
  const categoria = document.getElementById("nuevaCategoria").value.trim();

  const archivo = document.getElementById("nuevaImagen").files[0];

  const descripcion = document.getElementById("nuevaDesc").value.trim();
  const destacado = document.getElementById("nuevoDestacado")?.checked || false;

  const msg = document.getElementById("nuevoMsg");

  if (!nombre || !precio || !categoria || !archivo) {
    msg.style.color = "red";
    msg.textContent = "Completa todos los campos";
    return;
  }

  try {

    const resultado = await subirImagenSupabase(archivo);

    const ref = await addDoc(collection(db, "productos"), {
      nombre,
      precio,
      categoria,
      imagen: resultado.url,
      descripcion,
      destacado
    });

    MG.productos.push({
      id: ref.id,
      nombre,
      precio,
      categoria,
      imagen: resultado.url,
      descripcion,
      destacado
    });

    msg.style.color = "green";
    msg.textContent = "Producto agregado";

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


window.moverCarrusel=function(dir){

const c=document.getElementById("destacadosGrid");

c.scrollBy({

left:dir*350,

behavior:"smooth"

});

}
