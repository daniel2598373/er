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
  
  document.getElementById('back-btn').onclick = () => {
    showView(usuario.rol === 'empleado' ? 'view-dashboard' : 'view-admin');
  }

// Inicializar Socket.io
let socket;
if (typeof io !== 'undefined') {
  socket = io(API_BASE);
  socket.on('task_updated', (data) => {
    if (window.isDeletingTask) return; // Ignorar actualizaciones mientras eliminamos para evitar alertas dobles
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
      
      newBtnElim.onclick = async () => {
        if (!await window.appConfirm('¿Estás seguro de que deseas eliminar esta tarea? Esto liberará las bobinas asignadas y no se puede deshacer.')) return;
        newBtnElim.textContent = 'Eliminando...';
        newBtnElim.disabled = true;
        window.isDeletingTask = true;
        try {
          await apiFetch(`/admin/tasks/${taskId}`, { method: 'DELETE' });
          alert('Tarea eliminada correctamente');
          newBtnElim.textContent = 'Eliminar Tarea';
          newBtnElim.disabled = false;
          window.isDeletingTask = false;
          showView('view-admin');
        } catch (e) {
          alert(e.message);
          newBtnElim.textContent = 'Eliminar Tarea';
          newBtnElim.disabled = false;
          window.isDeletingTask = false;
        }
      }

    }
  }
} else {
  // El empleado no ve el histórico ni los botones de estado
  document.getElementById('status-section').classList.add('hidden');
  document.getElementById('historico-section').classList.add('hidden');
}

let currentTareaObj = null;
async function cargarTarea() {
  try {
    const tarea = await apiFetch(`/tasks/${taskId}`);
    currentTareaObj = tarea;
    document.getElementById('task-title').textContent = tarea.titulo;
    document.getElementById('task-descripcion').textContent = tarea.descripcion;
    document.getElementById('task-prioridad').textContent = PRIORIDAD_LABEL[tarea.prioridad];

    // Auto-rellenar campos del entregable desde la tarea
    const eNombreTrabajo = document.getElementById('e-nombre-trabajo');
    const eDesc = document.getElementById('e-descripcion');
    const eFolio = document.getElementById('e-folio');
    // Si la tarea tiene cotizacionId (ya sea por la BD o incrustado en la descripcion), pre-llenar el folio del entregable
    let extractedCot = null;
    let cleanDesc = tarea.descripcion || '';
    
    let permitirExtras = false;
    const matchExtras = cleanDesc.match(/\[Permitir extras:\s*(.*?)\]/);
    if (matchExtras) {
      if (matchExtras[1] === 'SI') permitirExtras = true;
      cleanDesc = cleanDesc.replace(/\[Permitir extras:\s*.*?\]/, '').trim();
    }
    
    const match = cleanDesc.match(/\[Folio Cotización:\s*(.*?)\]/);
    if (match) {
        extractedCot = match[1];
        cleanDesc = cleanDesc.replace(/\[Folio Cotización:\s*.*?\]/, '').trim();
    }
    
    // Guardar si se permiten extras en el objeto global de la tarea para usarlo después
    tarea.permitirExtras = permitirExtras;
    
    if (eNombreTrabajo && !eNombreTrabajo.value) eNombreTrabajo.value = tarea.titulo || '';
    if (eDesc && !eDesc.value) eDesc.value = cleanDesc;
    
    const finalCot = tarea.cotizacionId || extractedCot;
    if (eFolio && !eFolio.value && finalCot) {
        eFolio.value = finalCot;
    }
    
    // Y también limpiar la descripción visual de la tarea en la interfaz principal
    document.getElementById('task-descripcion').textContent = cleanDesc;
    
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
        // Para tareas creadas por el empleado (trabajo libre con bobinas), mostrar botón de Finalizar
        if (tarea.creadoPorEmpleado && tarea.estado === 'en_progreso') {
          // Mostrar botón de Finalizar Trabajo en lugar del formón normal
          let finalizarSection = document.getElementById('section-employee-finalize');
          if (!finalizarSection) {
            finalizarSection = document.createElement('div');
            finalizarSection.id = 'section-employee-finalize';
            finalizarSection.style.cssText = 'padding:16px;background:#f0fdf4;border-radius:8px;margin-bottom:16px;border:1px solid #bbf7d0;';
            formSection.parentNode.insertBefore(finalizarSection, formSection);
          }
          // Construir selección de bobinas (qué hacemos con cada una)
          const bobinas = tarea.bobinas || [];
          let bobinaHTML = '';
          if (bobinas.length > 0) {
            bobinaHTML = `<div style="margin-bottom:12px;"><strong style="font-size:13px;">¿Qué hago con las bobinas sobrantes?</strong>`;
            bobinas.forEach(b => {
              const nombre = b.nombre || b._id;
              bobinaHTML += `
                <div style="display:flex;align-items:center;gap:10px;margin-top:8px;font-size:13px;">
                  <span style="flex:1;">🔌 ${nombre} (${b.metrosRestantes}m restantes)</span>
                  <select data-bobina-id="${b._id}" style="padding:5px;border:1px solid #cbd5e1;border-radius:5px;">
                    <option value="regresar">↩️ Regresar al Almacén</option>
                    <option value="desecho">🗑️ Marcar como Desecho</option>
                  </select>
                </div>`;
            });
            bobinaHTML += `</div>`;
          }
          finalizarSection.innerHTML = `
            <h3 style="margin:0 0 10px;font-size:1rem;color:#065f46;">✅ Finalizar Trabajo</h3>
            ${bobinaHTML}
            <textarea id="emp-fin-comentario" rows="3" placeholder="Comentario final (opcional)" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;box-sizing:border-box;margin-bottom:10px;"></textarea>
            <button id="btn-finalizar-trabajo-emp" class="btn-primary" style="width:100%;background:#10b981;">Marcar como Terminado y Enviar a Revisión</button>
            <div id="emp-fin-error" style="color:red;font-size:12px;margin-top:6px;"></div>
          `;
          document.getElementById('btn-finalizar-trabajo-emp').onclick = async () => {
            const comentarioCierre = document.getElementById('emp-fin-comentario').value.trim();
            const decisiones = {};
            document.querySelectorAll('[data-bobina-id]').forEach(sel => {
              decisiones[sel.dataset.bobinaId] = sel.value;
            });
            const btn = document.getElementById('btn-finalizar-trabajo-emp');
            btn.disabled = true; btn.textContent = 'Finalizando...';
            try {
              await apiFetch(`/tasks/${taskId}/employee-finalize`, {
                method: 'POST',
                body: JSON.stringify({ decisiones, comentarioCierre })
              });
              if (window.showToast) showToast('✅ Trabajo enviado a revisión del administrador.', 'success');
              else alert('✅ Trabajo enviado a revisión.');
              cargarTarea();
            } catch(e) {
              document.getElementById('emp-fin-error').textContent = '❌ ' + e.message;
              btn.disabled = false; btn.textContent = 'Marcar como Terminado y Enviar a Revisión';
            }
          }
          finalizarSection.classList.remove('hidden');
        } else {
          formSection.classList.remove('hidden');
          // Ocultar sección de finalizar si existe
          const ef = document.getElementById('section-employee-finalize');
          if (ef) ef.classList.add('hidden');
        }
        if (tarea.estado === 'requiere_evidencia') {
          reqEvidenciaMsg.classList.remove('hidden');
          formSection.classList.remove('hidden');
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
      } else if (usuario.rol === 'empleado' && !tarea.permitirExtras) {
        manageForm.classList.add('hidden');
      } else {
        manageForm.classList.remove('hidden');
      }
    }

    // Ocultar opciones de admin (entregable, aprobar, rechazar) si la tarea ya está cerrada
    const eFormSec = document.getElementById('entregable-form-section');
    const statusSec = document.getElementById('status-section');
    
    if (tarea.estado === 'revisada') {
      if (eFormSec) eFormSec.classList.add('hidden');
      if (statusSec) statusSec.classList.add('hidden');
    } else {
      // Mostrar entregable-form-section a todos (admin y empleado) si la tarea está abierta
      if (eFormSec) {
        eFormSec.classList.remove('hidden');
        
        const genMsg = document.getElementById('entregable-generado-msg');
        const toggleBtn = document.getElementById('toggle-entregable');
        const contentDiv = document.getElementById('entregable-content');

        if (tarea.entregableGenerado) {
          if (genMsg) genMsg.classList.remove('hidden');
          if (toggleBtn) toggleBtn.classList.add('hidden');
          if (contentDiv) contentDiv.classList.add('hidden');
        } else {
          if (genMsg) genMsg.classList.add('hidden');
          if (toggleBtn) toggleBtn.classList.remove('hidden');
        }
      }
      
      // Solo mostrar status-section si es admin
      if (usuario.rol !== 'empleado') {
        if (statusSec) statusSec.classList.remove('hidden');
      } else {
        if (statusSec) statusSec.classList.add('hidden');
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
    alert('Esta tarea no existe o fue eliminada.');
    if (typeof showView === 'function') {
      const u = typeof getUsuario === 'function' ? getUsuario() : (typeof usuario !== 'undefined' ? usuario : null);
      if (u && u.rol !== 'empleado') {
        showView('view-admin');
      } else {
        showView('view-dashboard');
      }
    }
  }
}

// Empleado: enviar reporte de avance
const reportForm = document.getElementById('report-form');
if (reportForm) {
  let reportFotosFiles = [];

  function renderReportFotosPreviews() {
    const preview = document.getElementById('fotos-preview');
    if (!preview) return;
    preview.innerHTML = '';
    reportFotosFiles.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const div = document.createElement('div');
      div.style.cssText = 'position:relative; width:72px; height:72px;';
      div.innerHTML = `<img src="${url}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;">
        <button type="button" style="position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;" data-idx="${i}">✕</button>`;
      div.querySelector('button').onclick = () => {
        URL.revokeObjectURL(url);
        reportFotosFiles.splice(i, 1);
        document.getElementById('fotos-count').textContent = `${reportFotosFiles.length} archivo(s)`;
        renderReportFotosPreviews();
      }
      preview.appendChild(div);
    });
  }

  const fotosInput = document.getElementById('fotos');
  if (fotosInput) {
    fotosInput.onchange = (ev) => {
      const incoming = [...ev.target.files];
      const available = Math.max(0, 15 - reportFotosFiles.length);
      reportFotosFiles.push(...incoming.slice(0, available));
      if (incoming.length > available) alert('Solo se permiten hasta 15 archivos en total.');
      document.getElementById('fotos-count').textContent = `${reportFotosFiles.length} archivo(s)`;
      renderReportFotosPreviews();
      ev.target.value = '';
    }
  }

  reportForm.onsubmit = async (e) => {
    e.preventDefault();
    const btn = reportForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Enviando...';
    btn.disabled = true;

    const comentario = document.getElementById('comentario').value.trim();
    const fotos = reportFotosFiles.length ? await filesToBase64(reportFotosFiles) : [];

    try {
      await apiFetch(`/tasks/${taskId}/reports`, {
        method: 'POST',
        body: JSON.stringify({ comentario, fotos }),
      });
      reportForm.reset();
      reportFotosFiles = [];
      document.getElementById('fotos-count').textContent = `0 archivo(s)`;
      renderReportFotosPreviews();
      
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
  }
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
  btn.onclick = async (e) => {
    const estado = e.target.getAttribute('data-estado');
    
    // Si es "revisada", verificar inventario sobrante primero
    if (estado === 'revisada') {
      try {
        const tarea = await apiFetch(`/tasks/${taskId}`);
    currentTareaObj = tarea;
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
  }
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
  toggleTiradas.onclick = () => {
    tiradasContent.classList.toggle('hidden');
    tiradasIcon.textContent = tiradasContent.classList.contains('hidden') ? '▼' : '▲';
  }
}

// --- Acordeón para Entregable ---
const toggleEntregable = document.getElementById('toggle-entregable');
const entregableContent = document.getElementById('entregable-content');
const entregableIcon = document.getElementById('entregable-icon');

if (toggleEntregable) {
  toggleEntregable.onclick = () => {
    entregableContent.classList.toggle('hidden');
    entregableIcon.textContent = entregableContent.classList.contains('hidden') ? '▼' : '▲';
  }
}

// --- Toggle Custom Bobina Input ---
const bobinaMetrosSelect = document.getElementById('bobina-metros');
const bobinaMetrosCustom = document.getElementById('bobina-metros-custom');
if (bobinaMetrosSelect && bobinaMetrosCustom) {
  bobinaMetrosSelect.onchange = (e) => {
    if (e.target.value === 'custom') {
      bobinaMetrosCustom.style.display = 'inline-block';
      bobinaMetrosCustom.required = true;
    } else {
      bobinaMetrosCustom.style.display = 'none';
      bobinaMetrosCustom.required = false;
    }
  }
}

// --- Agregar Bobina (Admin / Empleado) ---
const addBobinaForm = document.getElementById('add-bobina-form');
if (addBobinaForm) {
  addBobinaForm.onsubmit = async (e) => {
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
  }
}

// --- Agregar Tirada (Admin / Empleado) ---
const addTiradaForm = document.getElementById('add-tirada-form');
if (addTiradaForm) {
  addTiradaForm.onsubmit = async (e) => {
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
          const res = await window.appConfirm(`⚠️ ALERTA DE CABLE:\n\nNo hay cable suficiente para esta tirada de ${metrosEstimados}m.\nFaltarán ${result.stats.metrosFaltantes}m en total.\n\n¿Estás seguro de querer guardar esta tirada de todas formas (quedará marcada "Sin cable")?`);
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
  }
}

// --- Simulador Local para Empleado ---
const btnSimularTask = document.getElementById('btn-simular-cables-task');
const simuladorResTask = document.getElementById('simulador-resultados-task');

if (btnSimularTask && simuladorResTask) {
  btnSimularTask.onclick = async () => {
    btnSimularTask.textContent = 'Calculando...';
    try {
      const tarea = await apiFetch(`/tasks/${taskId}`);
    currentTareaObj = tarea;
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
  }
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
    if (!await window.appConfirm('¿Seguro que deseas eliminar esta tirada de cable?')) return;
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
      input.onchange = async (e) => {
        const tiradaId = e.target.getAttribute('data-id');
        const metrosReales = Number(e.target.value);
        try {
          await apiFetch(`/tasks/${taskId}/tiradas/${tiradaId}`, {
            method: 'PATCH',
            body: JSON.stringify({ metrosReales }),
          });
        } catch (err) { alert(err.message); }
      }
    });

    // Escuchar cambios en el checkbox
    document.querySelectorAll('.cortado-checkbox').forEach(checkbox => {
      checkbox.onchange = async (e) => {
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
      }
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

closeBtn.onclick = () => {
  modalVisor.classList.add('hidden');
  modalImg.src = '';
}

// Cerrar también si hace clic fuera de la imagen
modalVisor.onclick = (e) => {
  if (e.target === modalVisor) {
    modalVisor.classList.add('hidden');
    modalImg.src = '';
  }
}

  // =========================================================
  // MÓDULO ENTREGABLE FINAL — espejo de entregables.js
  // =========================================================
  const entregableForm = document.getElementById('entregable-form');
  if (entregableForm) {
    const EMAIL_API_URL = window.location.protocol === 'file:'
      ? 'https://server-respaldo-email.onrender.com'
      : 'https://email.naisata.com';

    let evidenceFiles = [];

    // --- Función helper para setup de canvas ---
    function setupEntregableCanvas(canvasEl) {
      const ctx = canvasEl.getContext('2d');
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
      let drawing = false;
      const getPos = (ev) => {
        const rect = canvasEl.getBoundingClientRect();
        const src = ev.touches ? ev.touches[0] : ev;
        return {
          x: (src.clientX - rect.left) * (canvasEl.width / rect.width),
          y: (src.clientY - rect.top)  * (canvasEl.height / rect.height)
        };
      };
      const begin = (ev) => { ev.preventDefault(); drawing = true; ctx.beginPath(); const p = getPos(ev); ctx.moveTo(p.x, p.y); };
      const draw  = (ev) => { if (!drawing) return; ev.preventDefault(); const p = getPos(ev); ctx.lineTo(p.x, p.y); ctx.stroke(); canvasEl.dataset.touched = 'true'; };
      const stop  = () => { drawing = false; };
      canvasEl.addEventListener('mousedown', begin); canvasEl.addEventListener('mousemove', draw); canvasEl.addEventListener('mouseup', stop); canvasEl.addEventListener('mouseleave', stop);
      canvasEl.addEventListener('touchstart', begin, { passive: false }); canvasEl.addEventListener('touchmove', draw, { passive: false }); canvasEl.addEventListener('touchend', stop);
      return { ctx, canvas: canvasEl };
    }

    const canvasTec = setupEntregableCanvas(document.getElementById('e-canvas-tecnico'));
    const canvasCli = setupEntregableCanvas(document.getElementById('e-canvas-cliente'));

    document.getElementById('btn-limpiar-firma-tec').onclick = () => {
      canvasTec.ctx.clearRect(0, 0, canvasTec.canvas.width, canvasTec.canvas.height);
      canvasTec.canvas.dataset.touched = 'false';
    }
    document.getElementById('btn-limpiar-firma-cli').onclick = () => {
      canvasCli.ctx.clearRect(0, 0, canvasCli.canvas.width, canvasCli.canvas.height);
      canvasCli.canvas.dataset.touched = 'false';
    }

    // --- Cargar clientes (sites) ---
    async function cargarSitesParaEntregable() {
      try {
        const res = await fetch(`${EMAIL_API_URL}/api/sites`);
        if (!res.ok) throw new Error('no sites');
        const sites = await res.json();
        const sel = document.getElementById('e-site-id');
        sel.innerHTML = '<option value="">-- Selecciona un cliente --</option>' +
          sites.map(s => `<option value="${s.id}">${s.nombre || 'Sin nombre'}</option>`).join('');
      } catch { document.getElementById('e-site-id').innerHTML = '<option value="">Error al cargar clientes</option>'; }
    }

    // --- Cargar empresas ---
    async function cargarEmpresasParaEntregable() {
      try {
        const res = await fetch(`${EMAIL_API_URL}/api/companies`);
        if (!res.ok) throw new Error('no companies');
        const companies = await res.json();
        const sel = document.getElementById('e-empresa-id');
        sel.innerHTML = '<option value="">Naisata (por defecto)</option>' +
          companies.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
      } catch { /* queda el default */ }
    }

    cargarSitesParaEntregable();
    cargarEmpresasParaEntregable();

    // Auto-rellenar nombre de técnico con el usuario actual
    const inputTec = document.getElementById('e-tecnico');
    if (inputTec && usuario) inputTec.value = `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim();

    // Auto-rellenar título y descripción desde la tarea cuando se cargue
    const origCargarTarea = typeof cargarTarea === 'function' ? cargarTarea : null;
    // (El llenado se hace en cargarTarea cuando currentTareaObj esté disponible)

    // --- Fotos: preview y manejo ---
    function renderEvidencePreviews() {
      const preview = document.getElementById('e-fotos-preview');
      preview.innerHTML = '';
      evidenceFiles.forEach((file, i) => {
        const url = URL.createObjectURL(file);
        const div = document.createElement('div');
        div.style.cssText = 'position:relative; width:72px; height:72px;';
        div.innerHTML = `<img src="${url}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;">
          <button type="button" style="position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;" data-idx="${i}">✕</button>`;
        div.querySelector('button').onclick = () => {
          URL.revokeObjectURL(url);
          evidenceFiles.splice(i, 1);
          document.getElementById('e-fotos-count').textContent = `${evidenceFiles.length} foto(s)`;
          renderEvidencePreviews();
        }
        preview.appendChild(div);
      });
    }

    document.getElementById('e-fotos').onchange = async (ev) => {
      const incoming = [...ev.target.files];
      const available = Math.max(0, 15 - evidenceFiles.length);
      evidenceFiles.push(...incoming.slice(0, available));
      if (incoming.length > available) alert('Solo se permiten hasta 15 fotos en total.');
      document.getElementById('e-fotos-count').textContent = `${evidenceFiles.length} foto(s)`;
      renderEvidencePreviews();
      ev.target.value = '';
    }

    // --- Submit ---
    entregableForm.onsubmit = async (ev) => {
      ev.preventDefault();

      const siteId       = document.getElementById('e-site-id').value;
      const folio        = document.getElementById('e-folio').value.trim();
      const nombreTrabajo = document.getElementById('e-nombre-trabajo').value.trim();
      const descripcion  = document.getElementById('e-descripcion').value.trim();

      if (!siteId || !folio || !nombreTrabajo || !descripcion) {
        alert('Cliente, Folio, Título y Descripción son obligatorios.');
        return;
      }

      const btn = document.getElementById('btn-enviar-entregable');
      const originalLabel = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

      const formData = new FormData();
      formData.append('siteId',       siteId);
      formData.append('folio',        folio);
      formData.append('nombreTrabajo', nombreTrabajo);
      formData.append('descripcion',  descripcion);
      formData.append('vendedor',     document.getElementById('e-vendedor').value.trim());
      formData.append('ordenCompra',  document.getElementById('e-orden').value.trim());
      formData.append('nombreTecnico', document.getElementById('e-tecnico').value.trim());
      if (document.getElementById('e-empresa-id').value)
        formData.append('empresaId', document.getElementById('e-empresa-id').value);

      // Firmas
      if (canvasTec.canvas.dataset.touched === 'true')
        formData.append('firmaTecnico', canvasTec.canvas.toDataURL('image/png'));
      if (canvasCli.canvas.dataset.touched === 'true')
        formData.append('firmaCliente', canvasCli.canvas.toDataURL('image/png'));

      // Fotos
      evidenceFiles.forEach(file => formData.append('fotos', file));

      // Etiqueta de cotización (heredada de la tarea)
      if (currentTareaObj?.cotizacionId)
        formData.append('cotizacionId', currentTareaObj.cotizacionId);

      try {
        const res = await fetch(`${EMAIL_API_URL}/api/tickets`, { method: 'POST', body: formData });
        if (!res.ok) {
          let msg = `Error ${res.status}`;
          try { msg = (await res.json()).error || msg; } catch { /* */ }
          throw new Error(msg);
        }
        
        // Marcar en nuestro backend que ya se hizo
        await apiFetch(`/tasks/${taskId}/entregable`, { method: 'PATCH' });

        alert('✅ Entregable generado y enviado correctamente.');
        entregableForm.reset();
        evidenceFiles = [];
        document.getElementById('e-fotos-count').textContent = '0 foto(s)';
        document.getElementById('e-fotos-preview').innerHTML = '';
        canvasTec.ctx.clearRect(0, 0, canvasTec.canvas.width, canvasTec.canvas.height);
        canvasCli.ctx.clearRect(0, 0, canvasCli.canvas.width, canvasCli.canvas.height);
        // Volver a rellenar nombre técnico
        if (inputTec && usuario) inputTec.value = `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim();
        
        // Recargar tarea para que desaparezca el formulario
        if (!socket) cargarTarea();

      } catch (err) {
        alert('❌ ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalLabel;
      }
    }
  }
};
