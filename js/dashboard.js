window.initDashboard = function() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'empleado') {
    showView('view-login');
    return;
  }

  const nameEl = document.getElementById('dashboard-user-name');
  if (nameEl) nameEl.textContent = usuario.nombre;

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

  // ──── TAREAS ────────────────────────────────────────────────────────────
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

  // ──── BOBINAS ASIGNADAS ──────────────────────────────────────────────────
  let _misBobinas = [];

  async function cargarMisBobinas() {
    try {
      const bobinas = await apiFetch('/tasks/mis-bobinas');
      _misBobinas = bobinas;
      const grid = document.getElementById('mis-bobinas-grid');
      const empty = document.getElementById('mis-bobinas-empty');
      const btnRegistrar = document.getElementById('btn-registrar-trabajo');
      if (!grid) return;
      grid.innerHTML = '';

      if (bobinas.length === 0) {
        empty.classList.remove('hidden');
        if (btnRegistrar) btnRegistrar.style.display = 'none';
        return;
      }
      empty.classList.add('hidden');
      if (btnRegistrar) btnRegistrar.style.display = '';

      bobinas.forEach(b => {
        const pct = Math.round((b.metrosRestantes / b.metrosIniciales) * 100);
        const card = document.createElement('div');
        card.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;min-width:160px;flex:1;max-width:220px;';
        card.innerHTML = `
          <div style="font-weight:bold;font-size:13px;margin-bottom:4px;">🔌 ${b.nombre}</div>
          <div style="font-size:12px;color:#475569;">${b.metrosRestantes}m / ${b.metrosIniciales}m</div>
          <div style="margin-top:6px;background:#e2e8f0;border-radius:4px;height:6px;">
            <div style="background:#10b981;width:${pct}%;height:6px;border-radius:4px;"></div>
          </div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">${pct}% restante</div>
        `;
        grid.appendChild(card);
      });

    } catch (err) {
      console.warn('Error cargando mis bobinas:', err.message);
    }
  }

  // ──── MODAL: QUICK TASK ─────────────────────────────────────────────────
  const modal = document.getElementById('modal-quick-task');
  const btnRegistrar = document.getElementById('btn-registrar-trabajo');
  const btnClose = document.getElementById('btn-close-quick-task');
  const btnAddTirada = document.getElementById('btn-qt-add-tirada');
  const btnCalcular = document.getElementById('btn-qt-calcular');
  const btnGuardar = document.getElementById('btn-qt-guardar');
  const qtFotosInput = document.getElementById('qt-fotos');
  let _qtFotosFiles = [];
  let _qtTiradasCount = 0;

  if (btnRegistrar) btnRegistrar.addEventListener('click', () => abrirModalQuickTask());
  if (btnClose) btnClose.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });

  function abrirModalQuickTask() {
    if (!modal) return;
    // Rellenar checkboxes de bobinas
    const bobinaCheck = document.getElementById('qt-bobinas-check');
    if (bobinaCheck) {
      bobinaCheck.innerHTML = _misBobinas.length > 0
        ? _misBobinas.map(b => `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input type="checkbox" class="qt-bobina-cb" value="${b._id}" checked style="width:auto;accent-color:#6366f1;">
            ${b.nombre} (${b.metrosRestantes}m restantes)
          </label>`).join('')
        : '<p style="font-size:13px;color:#64748b;">No tienes bobinas asignadas.</p>';
    }
    // Limpiar tiradas previas
    const tiradas = document.getElementById('qt-tiradas-list');
    if (tiradas) tiradas.innerHTML = '';
    _qtTiradasCount = 0;
    _qtFotosFiles = [];
    document.getElementById('qt-fotos-count').textContent = '0 foto(s)';
    document.getElementById('qt-fotos-preview').innerHTML = '';
    document.getElementById('qt-calc-resultado').style.display = 'none';
    document.getElementById('qt-error').textContent = '';
    document.getElementById('qt-titulo').value = '';
    document.getElementById('qt-descripcion').value = '';
    modal.style.display = 'block';
    window.scrollTo(0, 0);
  }

  if (btnAddTirada) {
    btnAddTirada.addEventListener('click', () => {
      _qtTiradasCount++;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
      row.innerHTML = `
        <input type="text" placeholder="Nombre (Ej. Cámara 1)" data-field="nombre" style="flex:2;padding:7px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;">
        <input type="number" placeholder="Metros" data-field="metros" min="1" style="width:80px;padding:7px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;">
        <button type="button" style="background:#ef4444;color:white;border:none;border-radius:5px;padding:6px 10px;cursor:pointer;font-size:13px;" onclick="this.parentElement.remove()">✕</button>
      `;
      document.getElementById('qt-tiradas-list').appendChild(row);
    });
  }

  if (btnCalcular) {
    btnCalcular.addEventListener('click', () => {
      const bobinasCb = document.querySelectorAll('.qt-bobina-cb:checked');
      const bobinasSeleccionadas = _misBobinas.filter(b => [...bobinasCb].some(cb => cb.value === b._id));
      const rows = document.querySelectorAll('#qt-tiradas-list > div');
      const tiradas = [];
      rows.forEach(row => {
        const nombre = row.querySelector('[data-field="nombre"]').value.trim();
        const metros = parseFloat(row.querySelector('[data-field="metros"]').value);
        if (nombre && metros > 0) tiradas.push({ nombre, metrosEstimados: metros, cortado: false });
      });
      if (bobinasSeleccionadas.length === 0 || tiradas.length === 0) {
        document.getElementById('qt-calc-resultado').style.display = 'block';
        document.getElementById('qt-calc-resultado').innerHTML = '⚠️ Selecciona al menos una bobina y una tirada para calcular.';
        return;
      }
      const result = optimizarCortes(bobinasSeleccionadas, tiradas);
      const { stats } = result;
      let html = stats.esSuficiente
        ? `<strong style="color:#065f46;">✅ Cable suficiente</strong><br>`
        : `<strong style="color:#991b1b;">❌ Faltan ${stats.metrosFaltantes}m</strong><br>`;
      html += `<ul style="margin:8px 0 0;padding-left:18px;">`;
      result.tiradas.forEach(t => { html += `<li><strong>${t.nombre}</strong> (${t.metrosEstimados}m) ➔ ${t.bobinaAsignada || '---'}</li>`; });
      html += `</ul>`;
      if (stats.totalSobrante > 0) html += `<div style="margin-top:6px;color:#065f46;">♻️ Sobrante estimado: ${stats.totalSobrante}m</div>`;
      const res = document.getElementById('qt-calc-resultado');
      res.style.display = 'block';
      res.innerHTML = html;
    });
  }

  if (qtFotosInput) {
    qtFotosInput.addEventListener('change', () => {
      _qtFotosFiles = Array.from(qtFotosInput.files);
      document.getElementById('qt-fotos-count').textContent = `${_qtFotosFiles.length} foto(s)`;
      const preview = document.getElementById('qt-fotos-preview');
      preview.innerHTML = '';
      _qtFotosFiles.forEach(f => {
        if (!f.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = e => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;';
          preview.appendChild(img);
        };
        reader.readAsDataURL(f);
      });
    });
  }

  if (btnGuardar) {
    btnGuardar.addEventListener('click', async () => {
      const titulo = document.getElementById('qt-titulo').value.trim();
      const descripcion = document.getElementById('qt-descripcion').value.trim();
      const errorEl = document.getElementById('qt-error');

      if (!titulo || !descripcion) {
        errorEl.textContent = '⚠️ El nombre del trabajo y la descripción son obligatorios.';
        return;
      }
      errorEl.textContent = '';
      btnGuardar.disabled = true;
      btnGuardar.textContent = 'Guardando...';

      try {
        // Leer fotos como base64
        const fotosBase64 = await Promise.all(_qtFotosFiles.map(f => new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result);
          reader.onerror = rej;
          reader.readAsDataURL(f);
        })));

        const bobinasCb = document.querySelectorAll('.qt-bobina-cb:checked');
        const bobinaIds = [...bobinasCb].map(cb => cb.value);

        const rows = document.querySelectorAll('#qt-tiradas-list > div');
        const tiradas = [];
        rows.forEach(row => {
          const nombre = row.querySelector('[data-field="nombre"]').value.trim();
          const metros = parseFloat(row.querySelector('[data-field="metros"]').value);
          if (nombre && metros > 0) tiradas.push({ nombre, categoria: 'nodos', metrosEstimados: metros, cortado: false });
        });

        const task = await apiFetch('/tasks/employee-quick-task', {
          method: 'POST',
          body: JSON.stringify({ titulo, descripcion, bobinaIds, tiradas, fotosReferencia: fotosBase64 })
        });

        modal.style.display = 'none';
        if (window.showToast) showToast('✅ Trabajo registrado correctamente.', 'success');
        else alert('✅ Trabajo registrado correctamente.');

        // Recargar bobinas y tareas
        cargarMisBobinas();
        cargarTareas();
      } catch (err) {
        errorEl.textContent = '❌ Error: ' + err.message;
      } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = '💾 Guardar y Registrar Trabajo';
      }
    });
  }

  // Exponer función de refresco para cuando se regresa a esta vista sin re-inicializar
  window._dashboardRefresh = () => {
    cargarTareas();
    cargarMisBobinas();
  };

  // ──── INICIALIZAR ────────────────────────────────────────────────────────
  cargarTareas();
  cargarMisBobinas();
};
