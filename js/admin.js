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
  link.onclick = (e) => {
    e.preventDefault();
    document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.remove('active'));
    document.querySelectorAll('.admin-content section').forEach((s) => s.classList.add('hidden'));
    link.classList.add('active');
    document.getElementById(`view-${link.dataset.view}`).classList.remove('hidden');
    if (link.dataset.view === 'usuarios') cargarUsuarios();
    if (link.dataset.view === 'inventario') cargarInventario();
    if (link.dataset.view === 'historial') cargarHistorial();
  }
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
window.showToast = function showToast(message, type = 'info') {
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
      card.onclick = () => {
        showView('view-task', tarea._id);
      }
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
      const badgeEmpleado = tarea.creadoPorEmpleado ? `<span style="font-size:10px;background:#6366f1;color:white;border-radius:4px;padding:2px 6px;margin-left:8px;">Creado por Empleado</span>` : '';
      const folioStr = tarea.cotizacionFolio ? `<span style="font-size:11px;background:#d1fae5;color:#065f46;border-radius:4px;padding:2px 6px;margin-left:8px;">Folio: ${tarea.cotizacionFolio}</span>` : '';
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <div>
            <strong>${tarea.titulo}</strong>${badgeEmpleado}${folioStr}
            <div style="font-size:12px;color:#64748b;margin-top:2px;">Cerrada el: ${fechaStr}</div>
          </div>
          <button class="btn-secondary" style="font-size:11px;padding:4px 10px;white-space:nowrap;" data-taskid="${tarea._id}" onclick="event.stopPropagation(); asignarFolioHistorial('${tarea._id}')">
            📎 Asignar Folio
          </button>
        </div>
      `;
      item.onclick = () => {
        showView('view-task', tarea._id);
      }
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
  cargarCotizacionesParaSelect();

  async function cargarCotizacionesParaSelect() {
    try {
      const CRM_URL = window.location.protocol === 'file:' ? 'https://server-respaldo.onrender.com' : 'https://crm.naisata.com';
      const res = await fetch(`${CRM_URL}/api/cotizaciones`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cots = Array.isArray(data) ? data : (data.cotizaciones || data.data || []);
      // Filtrar solo activas (excluir perdidas/cerradas)
      const estadosInactivos = ['Perdido', 'Perdida', 'Rechazado', 'Cerrada', 'Terminada'];
      const activas = cots.filter(c => !estadosInactivos.includes(c.estado));
      const select = document.getElementById('cotizacionId');
      if (select) {
        // Limpiar opciones anteriores (evitar duplicados)
        select.innerHTML = '<option value="">-- Sin cotización --</option>';
        activas.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.folio || c._id;
          opt.textContent = `${c.folio || 'Sin folio'} - ${c.descripcion || c.clienteNombre || 'Sin detalle'}`;
          select.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('No se pudieron cargar las cotizaciones:', err.message);
    }
  }

  let fotosReferenciaFiles = [];

  function renderFotosReferenciaPreviews() {
    const preview = document.getElementById('fotosReferencia-preview');
    if (!preview) return;
    preview.innerHTML = '';
    fotosReferenciaFiles.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const div = document.createElement('div');
      div.style.cssText = 'position:relative; width:72px; height:72px;';
      div.innerHTML = `<img src="${url}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;">
        <button type="button" style="position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;" data-idx="${i}">✕</button>`;
      div.querySelector('button').onclick = () => {
        URL.revokeObjectURL(url);
        fotosReferenciaFiles.splice(i, 1);
        document.getElementById('fotosReferencia-count').textContent = `${fotosReferenciaFiles.length} archivo(s)`;
        renderFotosReferenciaPreviews();
      }
      preview.appendChild(div);
    });
  }

  const fotosReferenciaInput = document.getElementById('fotosReferencia');
  if (fotosReferenciaInput) {
    fotosReferenciaInput.onchange = (ev) => {
      const incoming = [...ev.target.files];
      const available = Math.max(0, 15 - fotosReferenciaFiles.length);
      fotosReferenciaFiles.push(...incoming.slice(0, available));
      if (incoming.length > available) alert('Solo se permiten hasta 15 archivos en total.');
      document.getElementById('fotosReferencia-count').textContent = `${fotosReferenciaFiles.length} archivo(s)`;
      renderFotosReferenciaPreviews();
      ev.target.value = '';
    }
  }

  taskForm.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = taskForm.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : 'Crear Tarea';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando...';
    }

    try {
      const fotosReferencia = fotosReferenciaFiles.length ? await filesToBase64(fotosReferenciaFiles) : [];

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

      const cotValue = document.getElementById('cotizacionId') ? document.getElementById('cotizacionId').value : '';
      const permitirExtras = document.getElementById('permitir-extras') ? document.getElementById('permitir-extras').checked : false;
      let descValue = document.getElementById('descripcion').value.trim();
      
      if (cotValue) {
        descValue += `\n\n[Folio Cotización: ${cotValue}]`;
      }
      if (permitirExtras) {
        descValue += `\n\n[Permitir extras: SI]`;
      }

      const body = {
        titulo: document.getElementById('titulo').value.trim(),
        descripcion: descValue,
        prioridad: document.getElementById('prioridad').value,
        ubicacion: document.getElementById('ubicacion').value.trim(),
        contacto: document.getElementById('contacto').value.trim(),
        asignadoA: document.getElementById('asignadoA').value,
        cotizacionId: cotValue, // Send it anyway just in case the backend is updated later
        fotosReferencia,
        bobinaIds,
        tiradas,
      };

      await apiFetch('/admin/tasks', { method: 'POST', body: JSON.stringify(body) });
      taskForm.reset();
      fotosReferenciaFiles = [];
      document.getElementById('fotosReferencia-count').textContent = `0 archivo(s)`;
      renderFotosReferenciaPreviews();
      
      alert('Tarea creada correctamente');
      cargarTareas();
    } catch (err) {
      alert(err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }

  // Logica para agregar filas de tiradas dinámicamente
  const btnAddTiradaRow = document.getElementById('btn-add-tirada-row');
  const createTiradasList = document.getElementById('create-tiradas-list');
  
  if (btnAddTiradaRow && createTiradasList) {
    btnAddTiradaRow.onclick = () => {
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
    }
  }

  // Logica para agregar filas de bobinas dinámicamente
  const btnAddBobinaRow = document.getElementById('btn-add-bobina-row');
  const createBobinasList = document.getElementById('create-bobinas-list');
  
  if (btnAddBobinaRow && createBobinasList) {
    btnAddBobinaRow.onclick = async () => {
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
    }
  }

  // Lógica del simulador
  const btnSimular = document.getElementById('btn-simular-cables');
  const simuladorResultados = document.getElementById('simulador-resultados');
  
  if (btnSimular && simuladorResultados) {
    btnSimular.onclick = () => {
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
    }
  }
}

async function cargarEmpleadosParaSelect() {
  try {
    const users = await apiFetch('/admin/users');
    const select = document.getElementById('asignadoA');
    const selectAsignar = document.getElementById('asignar-empleado-id');
    if (select) select.innerHTML = '';
    if (selectAsignar) selectAsignar.innerHTML = '<option value="">Seleccionar Empleado...</option>';
    users
      .filter((u) => u.rol === 'empleado' || u.rol === 'user' || u.rol === 'Clase C')
      .forEach((u) => {
        if (select) {
          const opt = document.createElement('option');
          opt.value = u._id;
          opt.textContent = u.nombre;
          select.appendChild(opt);
        }
        if (selectAsignar) {
          const opt2 = document.createElement('option');
          opt2.value = u._id;
          opt2.textContent = u.nombre;
          selectAsignar.appendChild(opt2);
        }
      });
  } catch (err) {
    alert(err.message);
  }
}

// --- Crear usuario y listar usuarios (solo admin) ---
const userForm = document.getElementById('user-form');
if (userForm) {
  userForm.onsubmit = async (e) => {
    e.preventDefault();
    const btn = userForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Cargando...';
    btn.disabled = true;

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
      alert('Usuario creado correctamente');
    } catch (err) {
      alert(err.message);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

window.eliminarUsuario = async function(id) {
  if (!await window.appConfirm('¿Estás seguro de que deseas eliminar a este usuario? Esta acción no se puede deshacer.')) return;
  try {
    await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
    cargarUsuarios();
  } catch (err) {
    alert(err.message);
  }
};

window.editarUsuario = async function(id, nombreActual, rolActual) {
  const nuevoNombre = await window.appPrompt('Editar Nombre:', nombreActual);
  if (nuevoNombre === null) return; // Cancelado
  
  const nuevoRol = await window.appPrompt('Editar Rol (empleado, dom, admin):', rolActual);
  if (nuevoRol === null) return; // Cancelado
  
  const body = {};
  if (nuevoNombre.trim() !== '') body.nombre = nuevoNombre.trim();
  if (['empleado', 'dom', 'admin'].includes(nuevoRol.trim())) body.rol = nuevoRol.trim();
  else if (nuevoRol.trim() !== '') return alert('Rol inválido. Debe ser: empleado, dom o admin.');

  const nuevaPass = await window.appPrompt('Nueva contraseña (deja en blanco para no cambiar):');
  if (nuevaPass && nuevaPass.trim() !== '') {
    body.password = nuevaPass;
  }

  try {
    await apiFetch(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    cargarUsuarios();
  } catch (err) {
    alert(err.message);
  }
};

async function cargarUsuarios() {
  try {
    const users = await apiFetch('/admin/users');
    const list = document.getElementById('user-list');
    list.innerHTML = users
      .map((u) => `
        <div class="report-entry" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${u.nombre}</strong> — ${u.username} <span class="badge">${u.rol}</span>
          </div>
          <div>
            <button class="btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="editarUsuario('${u._id}', '${u.nombre}', '${u.rol}')">Editar</button>
            <button class="btn-danger" style="font-size: 11px; padding: 4px 8px; margin-left: 5px;" onclick="eliminarUsuario('${u._id}')">Borrar</button>
          </div>
        </div>
      `)
      .join('');
  } catch (err) {
    alert(err.message);
  }
}

// --- Inventario (Bobinas) ---

const asignarForm = document.getElementById('asignar-bobina-empleado-form');
if (asignarForm) {
  asignarForm.onsubmit = async (e) => {
    e.preventDefault();
    const bobinaId = document.getElementById('asignar-bobina-id').value;
    const empleadoId = document.getElementById('asignar-empleado-id').value;
    if (!bobinaId || !empleadoId) return alert('Selecciona bobina y empleado');
    
    const submitBtn = asignarForm.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : 'Asignar a Empleado';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Asignando...';
    }

    try {
      await apiFetch(`/inventory/${bobinaId}/asignar-empleado`, {
        method: 'POST',
        body: JSON.stringify({ empleadoId })
      });
      alert('Bobina asignada al empleado correctamente.');
      asignarForm.reset();
      cargarInventario();
    } catch(err) {
      alert(err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }
}

const bobinaForm = document.getElementById('bobina-form');
if (bobinaForm) {
  bobinaForm.onsubmit = async (e) => {
    e.preventDefault();
    const btn = bobinaForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Cargando...';
    btn.disabled = true;

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
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

window.eliminarBobina = async function(id) {
  if (!await window.appConfirm('¿Estás seguro de eliminar esta bobina del inventario?')) return;
  try {
    await apiFetch(`/inventory/${id}`, { method: 'DELETE' });
    cargarInventario();
  } catch (err) {
    alert(err.message);
  }
};

window.editarBobina = async function(id, nombreActual, metrosActuales) {
  const nuevoNombre = await window.appPrompt('Editar Nombre de la bobina:', nombreActual);
  if (nuevoNombre === null) return;
  
  const nuevosMetros = await window.appPrompt('Editar Metros Iniciales:', metrosActuales);
  if (nuevosMetros === null) return;

  const body = {};
  if (nuevoNombre.trim() !== '') body.nombre = nuevoNombre.trim();
  if (Number(nuevosMetros) > 0) body.metrosIniciales = Number(nuevosMetros);

  try {
    await apiFetch(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    cargarInventario();
  } catch (err) {
    alert(err.message);
  }
};

async function cargarInventario() {
  try {
    const bobinas = await apiFetch('/inventory');
    const list = document.getElementById('inventario-list');
        const selectBobina = document.getElementById('asignar-bobina-id');
    if (selectBobina) {
      selectBobina.innerHTML = '<option value="">Seleccionar Bobina...</option>' + bobinas.filter(b => b.estado === 'disponible').map(b => `<option value="${b._id}">${b.nombre} (${b.metrosRestantes}m)</option>`).join('');
    }
    list.innerHTML = bobinas
      .map((b) => {
        const statusColor = b.estado === 'disponible' ? 'var(--success)' : 
                            b.estado === 'asignada' ? 'var(--warning)' : 
                            'var(--danger)';
        const taskAsignada = b.tareaActual ? `(Tarea: ${b.tareaActual.titulo})` : '';
        const empleadoNombre = b.empleadoAsignado ? (b.empleadoAsignado.nombre || '') : '';
        const empleadoBadge = (b.estado === 'asignada' && !b.tareaActual && empleadoNombre) 
          ? `<span style="font-size:11px;color:#d97706;"> — Empleado: <strong>${empleadoNombre}</strong></span>` : '';
        
        let botonesStr = '';
        if (b.estado === 'disponible') {
          botonesStr = `
            <div>
              <button class="btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="editarBobina('${b._id}', '${b.nombre}', ${b.metrosIniciales})">Editar</button>
              <button class="btn-danger" style="font-size: 11px; padding: 4px 8px; margin-left: 5px;" onclick="eliminarBobina('${b._id}')">Borrar</button>
            </div>
          `;
        } else if (b.estado === 'asignada' && !b.tareaActual) {
          botonesStr = `
            <div>
              <button class="btn-secondary" style="font-size: 11px; padding: 4px 8px; border-color:#ef4444;color:#ef4444;" onclick="desasignarBobina('${b._id}')">✕ Cancelar Asignación</button>
            </div>
          `;
        }

        return `
          <div class="report-entry" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${b.nombre}</strong> — ${b.metrosRestantes}m restantes (de ${b.metrosIniciales}m)
              <br><span style="font-size: 11px; color: ${statusColor}; font-weight: bold;">[${b.estado.toUpperCase()}]</span> 
              <span style="font-size: 11px; color: var(--text-muted);">${taskAsignada}</span>${empleadoBadge}
            </div>
            ${botonesStr}
          </div>
        `;
      })
      .join('');
  } catch (err) {
    alert(err.message);
  }
}


async function desasignarBobina(bobinaId) {
  if (!await window.appConfirm('¿Cancelar la asignación de esta bobina? Regresará al almacén como disponible.')) return;
  try {
    await apiFetch(`/admin/bobina-desasignar/${bobinaId}`, { method: 'POST' });
    showToast('Bobina devuelta al almécen correctamente.', 'success');
    cargarInventario();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

window.desasignarBobina = desasignarBobina;

async function asignarFolioHistorial(taskId) {
  const folio = await window.appPrompt('Escribe el Folio de Cotización a asignar a este trabajo:');
  if (!folio) return;
  try {
    await apiFetch(`/admin/tasks/${taskId}/folio`, {
      method: 'PATCH',
      body: JSON.stringify({ cotizacionFolio: folio })
    });
    showToast(`Folio "${folio}" asignado correctamente.`, 'success');
    cargarHistorial();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

window.asignarFolioHistorial = asignarFolioHistorial;

  // Exponer función de refresco para cuando se regresa a esta vista sin re-inicializar
  window._adminRefresh = () => cargarTareas();

  cargarTareas();
};
