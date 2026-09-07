// URL del servidor: detecta si estas en local o en produccion (GitHub Pages)
// TODO: Reemplaza "https://tu-backend-real.com" con la URL de tu servidor en Render/Heroku/DigitalOcean
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
  ? 'http://localhost:3009' 
  : 'https://tu-backend-real.com';

function getToken() {
  return localStorage.getItem('token');
}

function getUsuario() {
  const raw = localStorage.getItem('usuario');
  return raw ? JSON.parse(raw) : null;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  if (typeof showView === 'function') showView('view-login');
}

// Wrapper de fetch que agrega el token de sesion y maneja errores comunes
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  // Solo consideramos la sesion expirada si recibimos 401 y NO estamos intentando hacer login
  if (res.status === 401 && path !== '/auth/login') {
    logout();
    throw new Error('Tu sesion expiro, inicia sesion de nuevo');
  }

  if (!res.ok) throw new Error(data.error || 'Ocurrio un error al conectar con el servidor');
  return data;
}

// Protege una pagina: exige sesion activa y, opcionalmente, un rol especifico
function requireAuth(rolesPermitidos) {
  const usuario = getUsuario();
  if (!getToken() || !usuario) {
    if (typeof showView === 'function') showView('view-login');
    return null;
  }
  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    if (typeof showView === 'function') showView(usuario.rol === 'empleado' ? 'view-dashboard' : 'view-admin');
    return null;
  }
  return usuario;
}

// Convierte un archivo de imagen seleccionado en un input a base64,
// para enviarlo directo en el JSON (sin necesidad de un servicio aparte de archivos)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1080;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Comprimir a JPEG 70% calidad
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function filesToBase64(fileList) {
  return Promise.all(Array.from(fileList).map(fileToBase64));
}
