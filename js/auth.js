window.initAuth = async function() {
  const form = document.getElementById('login-form');
  if (!form) return;
  
  // Clone to remove previous listeners
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  // Load users into select
  const usernameSelect = document.getElementById('username');
  if (usernameSelect && usernameSelect.tagName === 'SELECT') {
    try {
      const res = await fetch(`${typeof API_BASE !== 'undefined' ? API_BASE : ''}/auth/users`);
      if (res.ok) {
        const users = await res.json();
        usernameSelect.innerHTML = '<option value="">Selecciona tu usuario...</option>';
        users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.loginId;
          opt.textContent = u.nombre;
          usernameSelect.appendChild(opt);
        });
      } else {
        usernameSelect.innerHTML = '<option value="">Error cargando usuarios</option>';
      }
    } catch (e) {
      usernameSelect.innerHTML = '<option value="">Error de conexión</option>';
    }
  }

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
