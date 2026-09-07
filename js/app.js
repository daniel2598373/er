// SPA Router and App Initialization

function showView(viewId, param = null) {
  document.querySelectorAll('.view-container').forEach(el => el.classList.add('hidden'));
  const view = document.getElementById(viewId);
  if(view) view.classList.remove('hidden');

  // Trigger init functions if they exist
  if (viewId === 'view-dashboard' && window.initDashboard) window.initDashboard();
  if (viewId === 'view-admin' && window.initAdmin) window.initAdmin();
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
