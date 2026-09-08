// SPA Router and App Initialization

// --- Custom non-blocking dialogs ---
window.appAlert = function(message) {
  if (window.showToast) {
    window.showToast(message, 'info');
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);';
    const box = document.createElement('div');
    box.style.cssText = 'background:white;padding:24px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-width:400px;width:90%;text-align:center;font-family:sans-serif;color:black;';
    const msgEl = document.createElement('p');
    msgEl.style.cssText = 'margin-bottom:20px;font-size:1.1rem;white-space:pre-wrap;';
    msgEl.textContent = message;
    const btnOk = document.createElement('button');
    btnOk.textContent = 'OK';
    btnOk.style.cssText = 'padding:8px 16px;border:none;background:#3b82f6;border-radius:6px;cursor:pointer;color:white;font-weight:bold;font-size:1rem;';
    btnOk.onclick = () => { overlay.remove(); resolve(); };
    box.appendChild(msgEl);
    box.appendChild(btnOk);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
};

window.appConfirm = function(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);';
    const box = document.createElement('div');
    box.style.cssText = 'background:white;padding:24px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-width:400px;width:90%;text-align:center;font-family:sans-serif;color:black;';
    const msgEl = document.createElement('p');
    msgEl.style.cssText = 'margin-bottom:20px;font-size:1.1rem;white-space:pre-wrap;';
    msgEl.textContent = message;
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:10px;justify-content:center;';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancelar';
    btnCancel.style.cssText = 'padding:8px 16px;border:1px solid #cbd5e1;background:white;border-radius:6px;cursor:pointer;color:#475569;font-weight:bold;font-size:1rem;flex:1;';
    const btnOk = document.createElement('button');
    btnOk.textContent = 'Confirmar';
    btnOk.style.cssText = 'padding:8px 16px;border:none;background:#ef4444;border-radius:6px;cursor:pointer;color:white;font-weight:bold;font-size:1rem;flex:1;';
    btnCancel.onclick = () => { overlay.remove(); resolve(false); };
    btnOk.onclick = () => { overlay.remove(); resolve(true); };
    btnGroup.appendChild(btnCancel);
    btnGroup.appendChild(btnOk);
    box.appendChild(msgEl);
    box.appendChild(btnGroup);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
};

window.appPrompt = function(message, defaultValue = '') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);';
    const box = document.createElement('div');
    box.style.cssText = 'background:white;padding:24px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-width:400px;width:90%;text-align:center;font-family:sans-serif;color:black;';
    const msgEl = document.createElement('p');
    msgEl.style.cssText = 'margin-bottom:15px;font-size:1.1rem;white-space:pre-wrap;';
    msgEl.textContent = message;
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.value = defaultValue;
    inputEl.style.cssText = 'width:100%;padding:10px;margin-bottom:20px;border:1px solid #cbd5e1;border-radius:6px;font-size:1rem;box-sizing:border-box;color:black;';
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:10px;justify-content:center;';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancelar';
    btnCancel.style.cssText = 'padding:8px 16px;border:1px solid #cbd5e1;background:white;border-radius:6px;cursor:pointer;color:#475569;font-weight:bold;font-size:1rem;flex:1;';
    const btnOk = document.createElement('button');
    btnOk.textContent = 'Aceptar';
    btnOk.style.cssText = 'padding:8px 16px;border:none;background:#3b82f6;border-radius:6px;cursor:pointer;color:white;font-weight:bold;font-size:1rem;flex:1;';
    btnCancel.onclick = () => { overlay.remove(); resolve(null); };
    btnOk.onclick = () => { overlay.remove(); resolve(inputEl.value); };
    inputEl.onkeydown = (e) => { if(e.key === 'Enter') btnOk.click(); };
    btnGroup.appendChild(btnCancel);
    btnGroup.appendChild(btnOk);
    box.appendChild(msgEl);
    box.appendChild(inputEl);
    box.appendChild(btnGroup);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => inputEl.focus(), 100);
  });
};

window.alert = function(msg) { window.appAlert(msg); };
// For confirm/prompt we can't override them cleanly since they are sync, so we must find/replace them in code.


// Guardas para evitar que los listeners se dupliquen al navegar entre vistas
const _viewInitialized = {};

function showView(viewId, param = null) {
  document.querySelectorAll('.view-container').forEach(el => el.classList.add('hidden'));
  const view = document.getElementById(viewId);
  if(view) view.classList.remove('hidden');

  // view-dashboard y view-admin: inicializar listeners solo UNA vez;
  // en visitas posteriores solo recargar datos (las funciones internas lo manejan).
  if (viewId === 'view-dashboard' && window.initDashboard) {
    if (!_viewInitialized['view-dashboard']) {
      _viewInitialized['view-dashboard'] = true;
      window.initDashboard();
    } else if (window._dashboardRefresh) {
      window._dashboardRefresh();
    }
  }

  if (viewId === 'view-admin' && window.initAdmin) {
    if (!_viewInitialized['view-admin']) {
      _viewInitialized['view-admin'] = true;
      window.initAdmin();
    } else if (window._adminRefresh) {
      window._adminRefresh();
    }
  }

  // view-task siempre se re-inicializa porque cada tarea es distinta,
  // pero la propia función clona botones para limpiar listeners anteriores.
  if (viewId === 'view-task' && window.initTask) window.initTask(param);
}

// Load Socket.io dynamically based on API_BASE
const socketScript = document.createElement('script');
socketScript.src = `${API_BASE}/socket.io/socket.io.js`;
document.head.appendChild(socketScript);

document.addEventListener('DOMContentLoaded', () => {
  // Setup global logout buttons
  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      showView('view-login');
    });
  });

  // Check auth state on load
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('usuario');
  if (token && userStr) {
    const user = JSON.parse(userStr);
    showView(user.rol === 'empleado' ? 'view-dashboard' : 'view-admin');
    if (window.subscribeToPush) setTimeout(window.subscribeToPush, 2000); // Wait 2s to not block initial render
  } else {
    showView('view-login');
  }
  
  if (window.initAuth) window.initAuth();

  // Lógica de instalación PWA
  let deferredPrompt;
  const installBtn = document.getElementById('pwa-install-btn');

  window.addEventListener('beforeinstallprompt', (e) => {
    // Evitar que Chrome muestre el mini-infobar automáticamente
    e.preventDefault();
    deferredPrompt = e;
    // Mostrar nuestro botón de instalar
    if (installBtn) installBtn.classList.remove('hidden');
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      // Ocultar botón después de hacer click
      installBtn.classList.add('hidden');
      // Mostrar el prompt nativo
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Decisión del usuario: ${outcome}`);
      deferredPrompt = null;
    });
  }

  // Register Service Worker for PWA (only if not on file:// protocol)
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
    });
  }
});

// PUSH NOTIFICATIONS
window.subscribeToPush = async function() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    const vapidResponse = await apiFetch('/push/vapidPublicKey');
    const vapidPublicKey = vapidResponse.publicKey;
    
    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    await apiFetch('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription)
    });
    console.log('Push subscription successful');
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
};
