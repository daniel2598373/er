window.initAdmin = function() {
  const usuario = getUsuario();
  if (!usuario || (usuario.rol !== 'admin' && usuario.rol !== 'dom')) {
    showView('view-login');
    return;
  }

  const nameEl = document.getElementById('admin-user-name');
  if (nameEl) nameEl.textContent = `${usuario.nombre} (${usuario.rol})`;

  // DOM solo revisa: oculta las secciones de creacion, que son exclusivas de admin
  if (usuario.rol !== 'admin') {
    const navCrear = document.getElementById('nav-crear-tarea');
    const navUsr = document.getElementById('nav-usuarios');
    if (navCrear) navCrear.classList.add('hidden');
    if (navUsr) navUsr.classList.add('hidden');
  }

// --- Navegacion entre vistas ---
document.querySelectorAll('.sidebar nav a').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.remove('active'));
    document.querySelectorAll('.admin-content section').forEach((s) => s.classList.add('hidden'));
    link.classList.add('active');
    document.getElementById(`view-${link.dataset.view}`).classList.remove('hidden');
    if (link.dataset.view === 'usuarios') cargarUsuarios();
    if (link.dataset.view === 'inventario') cargarInventario();
    if (link.dataset.view === 'historial') cargarHistorial();
  });
});

const ESTADO_LABEL = { 
  pendiente: 'Pendiente', 
  en_progreso: 'En progreso', 
  enviada: 'Enviada', 
  requiere_evidencia: 'Falta Evidencia',
  revisada: 'Revisada' 
};
const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 };

// Función para mostrar notificaciones flotantes (Toast)
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `alert-box ${type}`;
  toast.style.margin = '0';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-20px)';
  toast.style.transition = 'all 0.3s ease';
  toast.innerHTML = message;

  container.appendChild(toast);

  // Animar entrada
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Ocultar y remover después de 5s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

let socket;
if (typeof io !== 'undefined') {
  socket = io(API_BASE);
  socket.on('task_updated', (data) => {
    cargarTareas(); // recargar lista
  });

  socket.on('nueva_tirada_empleado', (data) => {
    showToast(`<strong>Nuevos Cortes (Algoritmo):</strong><br>El técnico <em>${data.usuario}</em> acaba de registrar y calcular tiradas en <strong>${data.tareaNombre}</strong>.`, 'success');
  });

  socket.on('nueva_bobina_empleado', (data) => {
    showToast(`<strong>Nueva Bobina Añadida:</strong><br>El técnico <em>${data.usuario}</em> añadió cable a <strong>${data.tareaNombre}</strong>.`, 'info');
  });
  socket.on('new_task', () => cargarTareas());
}

// --- Listado de tareas (todas, para admin y dom) ---
async function cargarTareas() {
  try {
    const tareas = await apiFetch('/tasks');
    tareas.sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]);
    const grid = document.getElementById('admin-task-grid');
    const empty = document.getElementById('tareas-empty');
    if (!grid) return;
    grid.innerHTML = '';

    if (tareas.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    tareas.forEach((tarea) => {
      const card = document.createElement('div');
      card.className = `task-card prioridad-${tarea.prioridad}`;
      card.innerHTML = `
        <h3><span class="priority-dot ${tarea.prioridad}"></span>${tarea.titulo}</h3>
        <div class="meta">Asignado a: ${tarea.asignadoA?.nombre || '—'}</div>
        <div class="meta" style="margin-top:8px;"><span class="badge">${ESTADO_LABEL[tarea.estado]}</span></div>
      `;
      card.addEventListener('click', () => {
        showView('view-task', tarea._id);
      });
      grid.appendChild(card);
    });
  } catch (err) {
    alert(err.message);
  }
}

// --- Historial de tareas cerradas ---
async function cargarHistorial() {
  try {
    const tareas = await apiFetch('/tasks/historical');
    const list = document.getElementById('historial-list');
    const empty = document.getElementById('historial-empty');
    if (!list) return;
    list.innerHTML = '';

    if (tareas.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    tareas.forEach((tarea) => {
      const item = document.createElement('div');
      item.className = 'report-entry';
      item.style.cursor = 'pointer';
      const fechaStr = tarea.completedAt ? new Date(tarea.completedAt).toLocaleString() : 'Fecha desconocida';
      item.innerHTML = `<strong>${tarea.titulo}</strong> — Cerrada el: ${fechaStr}`;
      item.addEventListener('click', () => {
        showView('view-task', tarea._id);
      });
      list.appendChild(item);
    });
  } catch (err) {
    alert(err.message);
  }
}

// --- Crear tarea (solo admin) ---
const taskForm = document.getElementById('task-form');
if (taskForm) {
  cargarEmpleadosParaSelect();

  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fotosInput = document.getElementById('fotosReferencia');
    const fotosReferencia = fotosInput.files.length ? await filesToBase64(fotosInput.files) : [];

    // Recolectar bobinas dinámicas (IDs de inventario)
    const bobinaIds = [];
    document.querySelectorAll('.bobina-row').forEach(row => {
      const select = row.querySelector('.b-select');
      if (select) {
        const selectedOpt = select.options[select.selectedIndex];
        if (selectedOpt && selectedOpt.value) {
          bobinaIds.push(selectedOpt.value);
        }
      }
    });

    // Recolectar tiradas dinámicas
    const tiradas = [];
    document.querySelectorAll('.tirada-row').forEach(row => {
      const nombre = row.querySelector('.t-nombre').value.trim();
      const categoria = row.querySelector('.t-categoria').value;
      const metrosEstimados = Number(row.querySelector('.t-metros').value);
      if (nombre && metrosEstimados > 0) {
        tiradas.push({ nombre, categoria, metrosEstimados });
      }
    });

    const body = {
      titulo: document.getElementById('titulo').value.trim(),
      descripcion: document.getElementById('descripcion').value.trim(),
      prioridad: document.getElementById('prioridad').value,
      ubicacion: document.getElementById('ubicacion').value.trim(),
      contacto: document.getElementById('contacto').value.trim(),
      asignadoA: document.getElementById('asignadoA').value,
      fotosReferencia,
      bobinaIds,
      tiradas,
    };

    try {
      await apiFetch('/admin/tasks', { method: 'POST', body: JSON.stringify(body) });
      taskForm.reset();
      alert('Tarea creada correctamente');
      cargarTareas();
    } catch (err) {
      alert(err.message);
    }
  });

  // Logica para agregar filas de tiradas dinámicamente
  const btnAddTiradaRow = document.getElementById('btn-add-tirada-row');
  const createTiradasList = document.getElementById('create-tiradas-list');
  
  if (btnAddTiradaRow && createTiradasList) {
    btnAddTiradaRow.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'tirada-row';
      row.style = 'display: grid; grid-template-columns: 2fr 2fr 1fr 40px; gap: 10px; align-items: center; margin-bottom: 5px;';
      row.innerHTML = `
        <input type="text" class="t-nombre" placeholder="Nombre (ej. C-1)" required style="width:100%; font-size: 13px;">
        <select class="t-categoria" required style="width:100%; font-size: 13px;">
          <option value="camaras">Cámaras</option>
          <option value="aps">APs</option>
          <option value="nodos">Nodos</option>
          <option value="control_acceso">Ctrl. Acceso</option>
        </select>
        <input type="number" class="t-metros" placeholder="Metros" required style="width:100%; font-size: 13px;">
        <button type="button" class="btn-danger" onclick="this.parentElement.remove()" style="padding: 8px;">X</button>
      `;
      createTiradasList.appendChild(row);
    });
  }

  // Logica para agregar filas de bobinas dinámicamente
  const btnAddBobinaRow = document.getElementById('btn-add-bobina-row');
  const createBobinasList = document.getElementById('create-bobinas-list');
  
  if (btnAddBobinaRow && createBobinasList) {
    btnAddBobinaRow.addEventListener('click', async () => {
      // Fetch available inventory
      const bobinasDisponibles = await apiFetch('/inventory?estado=disponible');
      if (bobinasDisponibles.length === 0) {
        alert('No hay bobinas disponibles en el inventario. Registra nuevas en la pestaña Inventario.');
        return;
      }

      const row = document.createElement('div');
      row.className = 'bobina-row';
      row.style = 'display: grid; grid-template-columns: 3fr 40px; gap: 10px; align-items: center; margin-bottom: 5px;';
      
      let optionsHtml = '<option value="">Selecciona una bobina...</option>';
      bobinasDisponibles.forEach(b => {
        optionsHtml += `<option value="${b._id}" data-nombre="${b.nombre}" data-metros="${b.metrosRestantes}">[${b.metrosRestantes}m] ${b.nombre}</option>`;
      });

      row.innerHTML = `
        <select class="b-select" required style="width:100%; font-size: 13px;">
          ${optionsHtml}
        </select>
        <button type="button" class="btn-danger" onclick="this.parentElement.remove()" style="padding: 8px;">X</button>
      `;
      createBobinasList.appendChild(row);
    });
  }

  // Lógica del simulador
  const btnSimular = document.getElementById('btn-simular-cables');
  const simuladorResultados = document.getElementById('simulador-resultados');
  
  if (btnSimular && simuladorResultados) {
    btnSimular.addEventListener('click', () => {
      // 1. Leer estado actual
      const bobinas = [];
      document.querySelectorAll('.bobina-row').forEach(row => {
        const select = row.querySelector('.b-select');
        const selectedOpt = select.options[select.selectedIndex];
        if (selectedOpt.value) {
          bobinas.push({ 
            nombre: selectedOpt.dataset.nombre, 
            metrosIniciales: Number(selectedOpt.dataset.metros),
            bobinaId: selectedOpt.value 
          });
        }
      });

      const tiradas = [];
      document.querySelectorAll('.tirada-row').forEach(row => {
        const nombre = row.querySelector('.t-nombre').value.trim();
        const metrosEstimados = Number(row.querySelector('.t-metros').value);
        // fake obj para el optimizador
        if (nombre && metrosEstimados > 0) tiradas.push({ nombre, metrosEstimados, cortado: false });
      });

      if (tiradas.length === 0) {
        simuladorResultados.className = 'alert-box warning';
        simuladorResultados.innerHTML = 'Agrega al menos una tirada para simular.';
        simuladorResultados.classList.remove('hidden');
        return;
      }

      // 2. Correr optimizador
      const result = optimizarCortes(bobinas, tiradas);
      const stats = result.stats;

      // 3. Renderizar resultados
      let html = '';
      if (stats.esSuficiente) {
        simuladorResultados.className = 'alert-box success';
        html += `<strong>✅ Cable Suficiente</strong><br>`;
        html += `Sobrarán en total: <strong>${stats.totalSobrante}m</strong> (de las bobinas abiertas).<br>`;
        
        if (stats.bobinasSinUsar.length > 0) {
          html += `<div style="margin-top: 8px;"><strong>📦 Cajas Intactas (puedes dejarlas en almacén):</strong><br>`;
          stats.bobinasSinUsar.forEach(b => html += `- ${b.nombre} (${b.metrosIniciales}m)<br>`);
          html += `</div>`;
        }
      } else {
        simuladorResultados.className = 'alert-box danger';
        html += `<strong>❌ Falta Cable</strong><br>`;
        html += `Te faltan <strong>${stats.metrosFaltantes}m</strong> para completar el trabajo.<br>`;
        
        html += `<div style="margin-top: 8px;"><strong>⚠️ Tiradas que no caben:</strong><br>`;
        stats.tiradasSinCable.forEach(t => html += `- ${t.nombre} (${t.metrosEstimados}m)<br>`);
        html += `</div>`;
      }

      // Mostrar resumen de asignación rápida
      html += `<hr style="border-color: rgba(0,0,0,0.1); margin: 10px 0;">`;
      html += `<strong>Vista Previa de Asignación:</strong><ul style="margin: 5px 0; padding-left: 20px;">`;
      result.tiradas.forEach(t => {
        html += `<li>${t.nombre} (${t.metrosEstimados}m) ➔ ${t.bobinaAsignada || '---'}</li>`;
      });
      html += `</ul>`;

      simuladorResultados.innerHTML = html;
      simuladorResultados.classList.remove('hidden');
    });
  }
}

async function cargarEmpleadosParaSelect() {
  try {
    const users = await apiFetch('/admin/users');
    const select = document.getElementById('asignadoA');
    select.innerHTML = '';
    users
      .filter((u) => u.rol === 'empleado' || u.rol === 'user' || u.rol === 'Clase C')
      .forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u._id;
        opt.textContent = u.nombre;
        select.appendChild(opt);
      });
  } catch (err) {
    alert(err.message);
  }
}

// --- Crear usuario y listar usuarios (solo admin) ---
const userForm = document.getElementById('user-form');
if (userForm) {
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      nombre: document.getElementById('nombre').value.trim(),
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value,
      rol: document.getElementById('rol').value,
    };
    try {
      await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify(body) });
      userForm.reset();
      cargarUsuarios();
      cargarEmpleadosParaSelect();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function cargarUsuarios() {
  try {
    const users = await apiFetch('/admin/users');
    const list = document.getElementById('user-list');
    list.innerHTML = users
      .map((u) => `<div class="report-entry"><strong>${u.nombre}</strong> — ${u.username} <span class="badge">${u.rol}</span></div>`)
      .join('');
  } catch (err) {
    alert(err.message);
  }
}

// --- Inventario (Bobinas) ---
const bobinaForm = document.getElementById('bobina-form');
if (bobinaForm) {
  bobinaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      nombre: document.getElementById('bobina-nombre-inv').value.trim(),
      metrosIniciales: Number(document.getElementById('bobina-metros-inv').value),
    };
    try {
      await apiFetch('/inventory', { method: 'POST', body: JSON.stringify(body) });
      bobinaForm.reset();
      cargarInventario();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function cargarInventario() {
  try {
    const bobinas = await apiFetch('/inventory');
    const list = document.getElementById('inventario-list');
    list.innerHTML = bobinas
      .map((b) => {
        const statusColor = b.estado === 'disponible' ? 'var(--success)' : 
                            b.estado === 'asignada' ? 'var(--warning)' : 
                            'var(--danger)';
        const taskAsignada = b.tareaActual ? `(Asignada a: ${b.tareaActual.titulo})` : '';
        return `
          <div class="report-entry" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${b.nombre}</strong> — ${b.metrosRestantes}m restantes (de ${b.metrosIniciales}m)
              <br><span style="font-size: 11px; color: ${statusColor}; font-weight: bold;">[${b.estado.toUpperCase()}]</span> 
              <span style="font-size: 11px; color: var(--text-muted);">${taskAsignada}</span>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (err) {
    alert(err.message);
  }
}

  cargarTareas();
};
