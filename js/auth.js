window.initAuth = function() {
  const form = document.getElementById('login-form');
  if (!form) return;
  
  // Clone to remove previous listeners
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));

      if (typeof showView === 'function') {
        showView(data.usuario.rol === 'empleado' ? 'view-dashboard' : 'view-admin');
        if (window.subscribeToPush) window.subscribeToPush();
      }
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
};
