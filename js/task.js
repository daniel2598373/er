window.initTask = function(taskIdParam) {
  const usuario = getUsuario();
  if (!usuario) {
    showView('view-login');
    return;
  }
  
  const taskId = taskIdParam || (new URLSearchParams(window.location.search)).get('id');
  if (!taskId) return;

  const PRIORIDAD_LABEL = { alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja' };
  const ESTADO_LABEL = { 
    pendiente: 'Pendiente', 
    en_progreso: 'En progreso', 
    enviada: 'Enviada', 
    requiere_evidencia: 'Requiere Evidencia',
    revisada: 'Visto Bueno (Revisada)' 
  };

  const userNameEl = document.getElementById('task-user-name');
  if (userNameEl) userNameEl.textContent = usuario.nombre;
  
  document.getElementById('back-btn').addEventListener('click', () => {
    showView(usuario.rol === 'empleado' ? 'view-dashboard' : 'view-admin');
  });

// Inicializar Socket.io
let socket;
if (typeof io !== 'undefined') {
  socket = io(API_BASE);
  socket.on('task_updated', (data) => {
    if (data.taskId === taskId) {
      if (data.tipo === 'nuevo_reporte') {
        if (usuario.rol !== 'empleado') cargarHistorico();
      } else {
        cargarTarea();
        if (usuario.rol !== 'empleado') cargarHistorico();
      }
    }
  });
}

// Mostrar solo las secciones que le corresponden al rol
if (usuario.rol !== 'empleado') {
  document.getElementById('report-form-section').classList.add('hidden');
  
  if (usuario.rol === 'admin') {
    const btnEliminarTarea = document.getElementById('btn-eliminar-tarea');
    if (btnEliminarTarea) {
      btnEliminarTarea.classList.remove('hidden');
      // Clonar para evitar múltiples listeners si initTask se llama varias veces
      const newBtnElim = btnEliminarTarea.cloneNode(true);
      btnEliminarTarea.parentNode.replaceChild(newBtnElim, btnEliminarTarea);
      
      newBtnElim.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro de que deseas eliminar esta tarea? Esto liberará las bobinas asignadas y no se puede deshacer.')) return;
        newBtnElim.textContent = 'Eliminando...';
        newBtnElim.disabled = true;
        try {
          await apiFetch(`/admin/tasks/${taskId}`, { method: 'DELETE' });
          alert('Tarea eliminada correctamente');
          showView('view-admin');
        } catch (e) {
          alert(e.message);
          newBtnElim.textContent = 'Eliminar Tarea';
          newBtnElim.disabled = false;
        }
      });
    }
  }
} else {
  // El empleado no ve el histórico ni los botones de estado
  document.getElementById('status-section').classList.add('hidden');
  document.getElementById('historico-section').classList.add('hidden');
}

async function cargarTarea() {
  try {
    const tarea = await apiFetch(`/tasks/${taskId}`);
    document.getElementById('task-title').textContent = tarea.titulo;
    document.getElementById('task-descripcion').textContent = tarea.descripcion;
    document.getElementById('task-prioridad').textContent = PRIORIDAD_LABEL[tarea.prioridad];
    
    const badgeEstado = document.getElementById('task-estado');
    badgeEstado.textContent = ESTADO_LABEL[tarea.estado];
    badgeEstado.className = `badge ${tarea.estado}`; // Aplica el color correspondiente

    document.getElementById('task-ubicacion').textContent = tarea.ubicacion || 'No especificada';
    document.getElementById('task-contacto').textContent = tarea.contacto || 'No especificado';

    // Ocultar o mostrar formulario/visto bueno para el empleado
    if (usuario.rol === 'empleado') {
      const formSection = document.getElementById('report-form-section');
      const vistoBuenoMsg = document.getElementById('msg-visto-bueno');
      const esperandoMsg = document.getElementById('msg-esperando-revision');
      const reqEvidenciaMsg = document.getElementById('msg-requiere-evidencia');
      
      // Reiniciar estado
      formSection.classList.add('hidden');
      vistoBuenoMsg.classList.add('hidden');
      if (esperandoMsg) esperandoMsg.classList.add('hidden');
      reqEvidenciaMsg.classList.add('hidden');

      if (tarea.estado === 'revisada') {
        vistoBuenoMsg.classList.remove('hidden');
      } else if (tarea.estado === 'enviada') {
        if (esperandoMsg) esperandoMsg.classList.remove('hidden');
      } else {
        formSection.classList.remove('hidden');
        if (tarea.estado === 'requiere_evidencia') {
          reqEvidenciaMsg.classList.remove('hidden');
        }
      }
    }

    const fotosDiv = document.getElementById('task-fotos-referencia');
    fotosDiv.innerHTML = '';
    
    if (tarea.tieneFotos) {
      const btnVerFotos = document.createElement('button');
      btnVerFotos.className = 'btn-secondary';
      btnVerFotos.style = 'font-size: 13px; padding: 6px 12px; margin-bottom: 10px;';
      btnVerFotos.textContent = '📷 Ver Archivos de Referencia';
      btnVerFotos.onclick = async () => {
        btnVerFotos.textContent = 'Cargando...';
        btnVerFotos.disabled = true;
        try {
          const fotos = await apiFetch(`/tasks/${taskId}/images`);
          btnVerFotos.remove();
          fotos.forEach((src) => {
            if (src.startsWith('data:application/pdf')) {
              const a = document.createElement('a');
              a.href = src;
              a.download = `documento_${Date.now()}.pdf`;
              a.className = 'btn-secondary';
              a.style = 'display: block; font-size: 13px; padding: 6px 12px; margin-bottom: 10px; width: fit-content; text-decoration: none;';
              a.innerHTML = '📄 Descargar Documento PDF';
              fotosDiv.appendChild(a);
            } else {
              const img = document.createElement('img');
              img.src = src;
              img.style.cursor = 'pointer';
              img.addEventListener('click', () => abrirVisorImagen(src));
              fotosDiv.appendChild(img);
            }
          });
        } catch (e) {
          btnVerFotos.textContent = 'Error al cargar';
          alert(e.message);
        }
      };
      fotosDiv.appendChild(btnVerFotos);
    }

    // --- Lógica de Tiradas ---
    const tiradas = tarea.tiradas || [];
    document.getElementById('tiradas-count').textContent = tiradas.length;
    
    // Si no hay tiradas y el usuario es empleado, ni siquiera mostrar la sección
    if (tiradas.length === 0 && usuario.rol === 'empleado') {
      document.getElementById('tiradas-section').classList.add('hidden');
    } else {
      document.getElementById('tiradas-section').classList.remove('hidden');
      renderTiradas(tiradas);
      renderBobinas(tarea.bobinas || []);
    }

    // Mostrar/ocultar formulario de gestión de tiradas (ahora para todos, excepto si está revisada)
    const manageForm = document.getElementById('manage-tiradas-form');
    if (manageForm) {
      if (tarea.estado === 'revisada') {
        manageForm.classList.add('hidden');
      } else {
        manageForm.classList.remove('hidden');
      }
    }

  } catch (err) {
    alert(err.message);
  }
}

async function cargarHistorico() {
  if (usuario.rol === 'empleado') return; // Seguridad extra: no cargarlo si es empleado

  try {
    const reportes = await apiFetch(`/tasks/${taskId}/reports`);
    const list = document.getElementById('reports-list');
    const empty = document.getElementById('reports-empty');
    list.innerHTML = '';

    if (reportes.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    reportes.forEach((r) => {
      const fecha = new Date(r.createdAt).toLocaleString();
      const entry = document.createElement('div');
      entry.className = 'report-entry';
      
      let html = `
        <div class="report-meta">${r.autor?.nombre || 'Usuario'} (${r.autor?.rol || ''}) — ${fecha}</div>
        <p>${r.comentario}</p>
        <div class="photo-strip" id="photos-report-${r._id}"></div>
      `;
      entry.innerHTML = html;

      if (r.tieneFotos) {
        const strip = entry.querySelector('.photo-strip');
        const btn = document.createElement('button');
        btn.className = 'btn-secondary';
        btn.style = 'font-size: 11px; padding: 4px 8px; margin-top: 5px;';
        btn.textContent = '📷 Ver Evidencias';
        btn.onclick = async () => {
          btn.textContent = 'Cargando...';
          btn.disabled = true;
          try {
            const fotos = await apiFetch(`/tasks/${taskId}/reports/${r._id}/images`);
            btn.remove();
            fotos.forEach((src) => {
              if (src.startsWith('data:application/pdf')) {
                const a = document.createElement('a');
                a.href = src;
                a.download = `evidencia_${Date.now()}.pdf`;
                a.className = 'btn-secondary';
                a.style = 'display: inline-block; font-size: 11px; padding: 4px 8px; margin: 2px; text-decoration: none;';
                a.innerHTML = '📄 Descargar PDF';
                strip.appendChild(a);
              } else {
                const img = document.createElement('img');
                img.src = src;
                img.style.cursor = 'pointer';
                img.addEventListener('click', () => abrirVisorImagen(src));
                strip.appendChild(img);
              }
            });
          } catch(e) {
            btn.textContent = 'Error';
          }
        };
        strip.appendChild(btn);
      }
      list.appendChild(entry);
    });
  } catch (err) {
    alert(err.message);
  }
}

// Empleado: enviar reporte de avance
const reportForm = document.getElementById('report-form');
if (reportForm) {
  reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = reportForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Enviando...';
    btn.disabled = true;

    const comentario = document.getElementById('comentario').value.trim();
    const fotosInput = document.getElementById('fotos');
    const fotos = fotosInput.files.length ? await filesToBase64(fotosInput.files) : [];

    try {
      await apiFetch(`/tasks/${taskId}/reports`, {
        method: 'POST',
        body: JSON.stringify({ comentario, fotos }),
      });
      reportForm.reset();
      
      // Mostrar feedback visual
      btn.textContent = '¡Reporte Enviado!';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);

      // Si no hay sockets, recargar manual
      if (!socket) {
        cargarTarea();
      }
    } catch (err) {
      alert(err.message);
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

async function cargarBobinasDisponibles() {
  const select = document.getElementById('bobina-id');
  if(!select) return;
  try {
    const bobinas = await apiFetch('/inventory?estado=disponible');
    let html = '<option value="">Selecciona del Inventario...</option>';
    bobinas.forEach(b => {
      html += `<option value="${b._id}">[${b.metrosRestantes}m] ${b.nombre}</option>`;
    });
    select.innerHTML = html;
  } catch(e) { console.error(e); }
}

// Admin/dom: cambiar estado usando los nuevos botones
const botonesEstado = document.querySelectorAll('.btn-estado');
botonesEstado.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const estado = e.target.getAttribute('data-estado');
    
    // Si es "revisada", verificar inventario sobrante primero
    if (estado === 'revisada') {
      try {
        const tarea = await apiFetch(`/tasks/${taskId}`);
        if (tarea.bobinas && tarea.bobinas.length > 0) {
          const bobinasSobrantes = tarea.bobinas.filter(b => b.metrosRestantes > 0);
          if (bobinasSobrantes.length > 0) {
            mostrarModalFinalizacion(bobinasSobrantes, e.target);
            return; // Abort standard flow until confirmed in modal
          }
        }
      } catch(err) { console.error(err); }
    }

    ejecutarCambioEstado(estado, e.target);
  });
});

async function ejecutarCambioEstado(estado, btnElement) {
  const originalText = btnElement.textContent;
  btnElement.textContent = 'Procesando...';
  btnElement.disabled = true;

  try {
    await apiFetch(`/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ estado }),
    });
    if (!socket) cargarTarea();
  } catch (err) {
    alert(err.message);
  } finally {
    btnElement.textContent = originalText;
    btnElement.disabled = false;
  }
}

function mostrarModalFinalizacion(bobinas, botonOriginal) {
  const modal = document.getElementById('finalize-task-modal');
  const list = document.getElementById('finalize-bobinas-list');
  if (!modal || !list) return ejecutarCambioEstado('revisada', botonOriginal); // Fallback if modal missing

  list.innerHTML = '';
  
  bobinas.forEach(b => {
    list.innerHTML += `
      <div style="background: rgba(0,0,0,0.03); padding: 10px; margin-bottom: 10px; border-radius: 5px;">
        <strong>${b.nombre}</strong> (${b.metrosRestantes}m sobrantes)<br>
        <select data-bobina-id="${b._id}" class="finalize-decision" style="margin-top: 5px; width: 100%;">
          <option value="regresar">Regresar al Inventario (Disponible)</option>
          <option value="desecho">Marcar como Desecho</option>
        </select>
      </div>
    `;
  });
  
  modal.classList.remove('hidden');

  document.getElementById('btn-cancel-finalize').onclick = () => {
    modal.classList.add('hidden');
  };

  document.getElementById('btn-confirm-finalize').onclick = async (e) => {
    const btn = e.target;
    btn.textContent = 'Procesando...';
    btn.disabled = true;

    const decisiones = {};
    document.querySelectorAll('.finalize-decision').forEach(sel => {
      decisiones[sel.getAttribute('data-bobina-id')] = sel.value;
    });

    try {
      await apiFetch(`/tasks/${taskId}/finalize`, {
        method: 'POST',
        body: JSON.stringify({ decisiones })
      });
      modal.classList.add('hidden');
      if (!socket) cargarTarea();
    } catch(err) {
      alert(err.message);
    } finally {
      btn.textContent = 'Confirmar y Aprobar Tarea';
      btn.disabled = false;
    }
  };
}

if (usuario && taskId) {
  cargarBobinasDisponibles();
  cargarTarea();
  if (usuario.rol !== 'empleado') {
    cargarHistorico();
  }
}

// --- Acordeón para Tiradas ---
const toggleTiradas = document.getElementById('toggle-tiradas');
const tiradasContent = document.getElementById('tiradas-content');
const tiradasIcon = document.getElementById('tiradas-icon');

if (toggleTiradas) {
  toggleTiradas.addEventListener('click', () => {
    tiradasContent.classList.toggle('hidden');
    tiradasIcon.textContent = tiradasContent.classList.contains('hidden') ? '▼' : '▲';
  });
}

// --- Toggle Custom Bobina Input ---
const bobinaMetrosSelect = document.getElementById('bobina-metros');
const bobinaMetrosCustom = document.getElementById('bobina-metros-custom');
if (bobinaMetrosSelect && bobinaMetrosCustom) {
  bobinaMetrosSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      bobinaMetrosCustom.style.display = 'inline-block';
      bobinaMetrosCustom.required = true;
    } else {
      bobinaMetrosCustom.style.display = 'none';
      bobinaMetrosCustom.required = false;
    }
  });
}

// --- Agregar Bobina (Admin / Empleado) ---
const addBobinaForm = document.getElementById('add-bobina-form');
if (addBobinaForm) {
  addBobinaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = addBobinaForm.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = 'Agregando...';
    btn.disabled = true;

    const bobinaId = document.getElementById('bobina-id').value;

    try {
      await apiFetch(`/tasks/${taskId}/bobinas`, {
        method: 'POST',
        body: JSON.stringify({ bobinaId }),
      });
      addBobinaForm.reset();
      cargarBobinasDisponibles(); // update dropdown
      if (!socket) cargarTarea(); // recarga si no hay socket
    } catch (err) {
      alert(err.message);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

// --- Agregar Tirada (Admin / Empleado) ---
const addTiradaForm = document.getElementById('add-tirada-form');
if (addTiradaForm) {
  addTiradaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Obtener los valores a agregar
    const nombre = document.getElementById('tirada-nombre').value.trim();
    const categoria = document.getElementById('tirada-categoria').value;
    const metrosEstimados = Number(document.getElementById('tirada-metros-est').value);

    // FOOLPROOF CHECK: Simulación local rápida antes de enviar
    if (typeof optimizarCortes !== 'undefined') {
      // Usar un fetch o guardar la última tarea globalmente para obtener las bobinas y tiradas actuales
      // Como esto puede ser complejo, si falla el optimizador que sea en el servidor, pero intentaremos una validación básica si tenemos las variables:
      // Vamos a recuperar la tarea directamente para la validación:
      try {
        const tareaActual = await apiFetch(`/tasks/${taskId}`);
        const fakeTirada = { nombre, categoria, metrosEstimados, cortado: false };
        const result = optimizarCortes(tareaActual.bobinas || [], [...(tareaActual.tiradas || []), fakeTirada]);
        
        if (!result.stats.esSuficiente) {
          const res = confirm(`⚠️ ALERTA DE CABLE:\n\nNo hay cable suficiente para esta tirada de ${metrosEstimados}m.\nFaltarán ${result.stats.metrosFaltantes}m en total.\n\n¿Estás seguro de querer guardar esta tirada de todas formas (quedará marcada "Sin cable")?`);
          if (!res) return; // Abortar
        }
      } catch (err) {
        console.warn("No se pudo hacer simulación foolproof local", err);
      }
    }

    const btn = addTiradaForm.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = 'Agregando...';
    btn.disabled = true;

    try {
      await apiFetch(`/tasks/${taskId}/tiradas`, {
        method: 'POST',
        body: JSON.stringify({ nombre, categoria, metrosEstimados }),
      });
      addTiradaForm.reset();
      if (!socket) cargarTarea();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

// --- Simulador Local para Empleado ---
const btnSimularTask = document.getElementById('btn-simular-cables-task');
const simuladorResTask = document.getElementById('simulador-resultados-task');

if (btnSimularTask && simuladorResTask) {
  btnSimularTask.addEventListener('click', async () => {
    btnSimularTask.textContent = 'Calculando...';
    try {
      const tarea = await apiFetch(`/tasks/${taskId}`);
      const result = optimizarCortes(tarea.bobinas || [], tarea.tiradas || []);
      const stats = result.stats;

      let html = '';
      if (stats.esSuficiente) {
        simuladorResTask.className = 'alert-box success';
        html += `<strong>✅ Cable Suficiente</strong><br>`;
        html += `Al terminar todas las tiradas, sobrarán <strong>${stats.totalSobrante}m</strong>.<br>`;
      } else {
        simuladorResTask.className = 'alert-box danger';
        html += `<strong>❌ Falta Cable</strong><br>`;
        html += `Te faltan <strong>${stats.metrosFaltantes}m</strong>.<br>`;
        if (stats.tiradasSinCable.length > 0) {
          html += `Tiradas sin cable asignado:<br>`;
          stats.tiradasSinCable.forEach(t => html += `- ${t.nombre} (${t.metrosEstimados}m)<br>`);
        }
      }

      simuladorResTask.innerHTML = html;
      simuladorResTask.classList.remove('hidden');
    } catch (err) {
      alert("Error al simular: " + err.message);
    } finally {
      btnSimularTask.textContent = '⚡ Simular Asignación Actual';
    }
  });
}

// --- Renderizar y Editar Tiradas ---
function renderTiradas(tiradas) {
  const list = document.getElementById('tiradas-list');
  list.innerHTML = '';

  if (tiradas.length === 0) {
    list.innerHTML = '<p class="empty-state">No hay tiradas agregadas a esta tarea.</p>';
    return;
  }

  tiradas.forEach((t, index) => {
    const isEmpleado = usuario.rol === 'empleado';
    const card = document.createElement('div');
    card.className = `tirada-card ${t.cortado ? 'cortado' : ''}`;
    
    // Categoría a Color/Texto
    const catLabels = { camaras: 'Cámara', aps: 'Access Point', nodos: 'Nodo', control_acceso: 'Ctrl. Acceso' };
    const catLabel = catLabels[t.categoria] || t.categoria;

    // Delete button logic (only if task is not closed and we have manageForm)
    const canManage = document.getElementById('manage-tiradas-form') && !document.getElementById('manage-tiradas-form').classList.contains('hidden');
    const deleteBtnHtml = canManage ? `<button class="btn-danger" style="font-size: 10px; padding: 2px 6px; margin-left: 10px;" onclick="eliminarTirada(${index})">X</button>` : '';

    let contentHtml = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <strong style="font-size: 16px;">${t.nombre} ${deleteBtnHtml}</strong>
          <span style="font-size: 12px; color: var(--text-muted);">${catLabel}</span>
          ${t.bobinaAsignada ? `<span style="font-size: 12px; color: var(--accent-primary); font-weight: 500;">🔌 Cortar de: ${t.bobinaAsignada}</span>` : ''}
        </div>
    `;

    if (isEmpleado) {
      // Vista Empleado: Checkbox y Input para editar metros
      contentHtml += `
        <div style="display: flex; align-items: center; gap: 15px;">
          <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-muted);">
            Real (m):
            <input type="number" class="metros-input" data-id="${t._id}" value="${t.metrosReales || t.metrosEstimados}" style="width: 70px; padding: 4px; border-radius: 4px; border: 1px solid var(--border-color);">
          </label>
          <label class="custom-checkbox">
            <input type="checkbox" class="cortado-checkbox" data-id="${t._id}" ${t.cortado ? 'checked' : ''}>
            <span class="checkmark"></span>
            Cortado
          </label>
        </div>
      `;
    } else {
      // Vista Admin: Solo mostrar status y metros
      const metrosText = t.cortado ? `<span style="color: var(--success); font-weight: bold;">Real: ${t.metrosReales}m</span> (Est: ${t.metrosEstimados}m)` : `Estimado: ${t.metrosEstimados}m`;
      const statusBadge = t.cortado ? `<span class="badge revisada">Cortado</span>` : `<span class="badge pendiente">Pendiente</span>`;
      contentHtml += `
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          ${statusBadge}
          <span style="font-size: 13px; color: var(--text-muted);">${metrosText}</span>
        </div>
      `;
    }

    contentHtml += `</div>`;
    card.innerHTML = contentHtml;
    list.appendChild(card);
  });

  window.eliminarTirada = async function(index) {
    if (!confirm('¿Seguro que deseas eliminar esta tirada de cable?')) return;
    try {
      await apiFetch(`/tasks/${taskId}/tiradas/${index}`, { method: 'DELETE' });
      if (!socket) cargarTarea();
    } catch (err) {
      alert(err.message);
    }
  };

  // Agregar Event Listeners para empleado
  if (usuario.rol === 'empleado') {
    // Escuchar cambios en los inputs de metros
    document.querySelectorAll('.metros-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const tiradaId = e.target.getAttribute('data-id');
        const metrosReales = Number(e.target.value);
        try {
          await apiFetch(`/tasks/${taskId}/tiradas/${tiradaId}`, {
            method: 'PATCH',
            body: JSON.stringify({ metrosReales }),
          });
        } catch (err) { alert(err.message); }
      });
    });

    // Escuchar cambios en el checkbox
    document.querySelectorAll('.cortado-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const tiradaId = e.target.getAttribute('data-id');
        const cortado = e.target.checked;
        const card = e.target.closest('.tirada-card');
        
        // Efecto visual inmediato
        if (cortado) card.classList.add('cortado');
        else card.classList.remove('cortado');

        // Leer el input actual de metros para guardarlo también
        const inputMetros = card.querySelector('.metros-input');
        const metrosReales = inputMetros ? Number(inputMetros.value) : undefined;

        try {
          await apiFetch(`/tasks/${taskId}/tiradas/${tiradaId}`, {
            method: 'PATCH',
            body: JSON.stringify({ cortado, metrosReales }),
          });
          if (!socket) cargarTarea();
        } catch (err) { 
          alert(err.message); 
          e.target.checked = !cortado; // revertir
        }
      });
    });
  }
}

// --- Renderizar Bobinas ---
function renderBobinas(bobinas) {
  const container = document.getElementById('bobinas-container');
  if (!container) return; // Por si task.html no tiene el div aún

  if (bobinas.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  const list = document.getElementById('bobinas-list');
  list.innerHTML = '';
  
  bobinas.forEach(b => {
    // Calcular porcentaje restante para una barrita de progreso visual
    const porcentaje = Math.max(0, (b.metrosRestantes / b.metrosIniciales) * 100);
    const colorBarra = porcentaje > 20 ? 'var(--accent-primary)' : 'var(--danger)';
    
    list.innerHTML += `
      <div style="background: var(--surface); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px;">
          <strong>${b.nombre}</strong>
          <span>${b.metrosRestantes}m restantes (de ${b.metrosIniciales}m)</span>
        </div>
        <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.1); border-radius: 3px; overflow: hidden;">
          <div style="width: ${porcentaje}%; height: 100%; background: ${colorBarra}; transition: width 0.3s ease;"></div>
        </div>
      </div>
    `;
  });
}


// ---- Lógica del Visor de Imágenes Modal ----
const modalVisor = document.getElementById('image-viewer-modal');
const modalImg = document.getElementById('image-viewer-img');
const downloadBtn = document.getElementById('download-image-link');
const closeBtn = document.getElementById('close-image-modal');

window.abrirVisorImagen = function(src) {
  modalImg.src = src;
  downloadBtn.href = src;
  modalVisor.classList.remove('hidden');
};

closeBtn.addEventListener('click', () => {
  modalVisor.classList.add('hidden');
  modalImg.src = '';
});

// Cerrar también si hace clic fuera de la imagen
modalVisor.addEventListener('click', (e) => {
  if (e.target === modalVisor) {
    modalVisor.classList.add('hidden');
    modalImg.src = '';
  }
});
};
