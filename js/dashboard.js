window.initDashboard = function() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'empleado') {
    showView('view-login');
    return;
  }

  const nameEl = document.getElementById('dashboard-user-name');
  if (nameEl) nameEl.textContent = usuario.nombre;
  
  // logout handled globally in app.js now, no need to add event listener here unless missing

  const ESTADO_LABEL = {
    pendiente: 'Pendiente',
    en_progreso: 'En progreso',
    enviada: 'Enviada',
    requiere_evidencia: 'Requiere Evidencia',
    revisada: 'Visto Bueno',
  };

  const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 };

  let socket;
  if (typeof io !== 'undefined') {
    socket = io(API_BASE);
    socket.on('task_updated', () => cargarTareas());
    socket.on('new_task', () => cargarTareas());
  }

  async function cargarTareas() {
    try {
      const tareas = await apiFetch('/tasks');
      tareas.sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]);
      renderTareas(tareas);
    } catch (err) {
      alert(err.message);
    }
  }

  function renderTareas(tareas) {
    const grid = document.getElementById('dashboard-task-grid');
    const emptyState = document.getElementById('dashboard-empty-state');
    if (!grid) return;
    grid.innerHTML = '';

    if (tareas.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    tareas.forEach((tarea) => {
      const card = document.createElement('div');
      card.className = `task-card prioridad-${tarea.prioridad}`;
      card.innerHTML = `
        <h3><span class="priority-dot ${tarea.prioridad}"></span>${tarea.titulo}</h3>
        <div class="meta">${tarea.ubicacion || 'Sin ubicacion'}</div>
        <div class="meta" style="margin-top:8px;"><span class="badge">${ESTADO_LABEL[tarea.estado]}</span></div>
      `;
      card.addEventListener('click', () => {
        showView('view-task', tarea._id);
      });
      grid.appendChild(card);
    });
  }

  cargarTareas();
};
