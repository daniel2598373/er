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
  } else {
    showView('view-login');
  }
  
  if (window.initAuth) window.initAuth();

  // Register Service Worker for PWA (only if not on file:// protocol)
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
    });
  }
});
