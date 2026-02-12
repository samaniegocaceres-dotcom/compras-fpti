/* ================================================================
COMPRAS FPTI-PY — app.js (PATCHED)
DataStore (Firebase RTDB) + Router + UI + Autosave + Print
=============================================================== */

// === Firebase Imports ===
import { db } from './firebase.js';
import { ref, get, set, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* =================================================================
0) PATCH HELPERS — Normalización de datos provenientes de RTDB
-----------------------------------------------------------------
Este bloque permite que, aunque /procesos sea un ARRAY crudo (0,1,2,…) con campos
como 'sheet', 'codigo', etc., la app lo convierta a tu modelo interno (id, tipo, proceso, ...).
================================================================= */
function inferTipo(it) {
  // Detecta CLP/CPP desde "codigo" o "sheet"
  const c = String(it?.codigo || it?.sheet || '').toUpperCase();
  return c.includes('CPP') ? 'CPP' : 'CLP';
}
function inferProceso(it) {
  // Extrae "NNN/AAAA" desde "CLP/001/2026" o "CPP 003/2026" o "CLP 001_2026"
  const c = String(it?.codigo || it?.sheet || '').toUpperCase();
  // Caso: CLP/001/2026 | CPP/003/2026 | CLP-001-2026
  let m = c.match(/(CLP|CPP)[\s/\-]*([0-9]{3,})[\s/_\-]*([0-9]{4})/i);
  if (m) return `${m[2]}/${m[3]}`;
  // Caso: CLP 001_2026
  m = c.match(/(CLP|CPP)\s*([0-9]{3,})[_\-/\s]*([0-9]{4})/i);
  if (m) return `${m[2]}/${m[3]}`;
  // Fallback seguro
  return '001/2026';
}
function normalizeFecha(s) {
  if (!s) return '';
  // "2026-02-06 00:00:00" → "2026-02-06"
  const d = String(s).trim().split(' ')[0];
  return d || '';
}
/** Convierte objeto/array de RTDB a lista normalizada de procesos */
function normalizeList(objOrArray) {
  const rawList = Array.isArray(objOrArray) ? objOrArray : Object.values(objOrArray || {});
  const out = [];
  for (const item of rawList) {
    if (!item) continue;
    // Si ya viene con id/tipo/proceso, lo damos por válido
    if (item.id && item.tipo && item.proceso) {
      // Asegurar estructuras mínimas
      item.items = Array.isArray(item.items) ? item.items : [];
      item.participantes = Array.isArray(item.participantes) ? item.participantes : [];
      item.ofertas = item.ofertas && typeof item.ofertas === 'object' ? item.ofertas : {};
      item.adjudicaciones = item.adjudicaciones && typeof item.adjudicaciones === 'object' ? item.adjudicaciones : {};
      out.push(item);
      continue;
    }
    // Mapear desde estructura antigua (sheet/codigo/…)
    const mapped = {
      tipo: inferTipo(item),
      proceso: inferProceso(item),
      sigla: item.unidad || item.sigla || '',
      objeto: item.objeto || '',
      estado: item.estado || 'En Proceso',
      proximoEvento: item.proximo_evento_desc || item.proximoEvento || '',
      fechaAperturaSobre1: normalizeFecha(item.proximo_evento_fecha),
      // Estructuras mínimas
      items: [],
      participantes: [],
      ofertas: {},
      adjudicaciones: {},
      observaciones: item.observaciones || ''
    };
    // Reutilizamos tu factory para garantizar el shape interno
    const p = makeProcess(mapped);
    out.push(p);
  }
  return out;
}

// ================================================================
// 1. DATA STORE (Firebase Realtime Database)
// ================================================================
const STORE = 'procesos';
let allProcesses = [];

// Reemplazar caracteres inválidos en claves RTDB: . # $ [ ] /
function safeKey(id) { return String(id).replace(/[.\#\$\[\]\//]/g, '_'); }

// Leer todos (una vez) — PATCH: normalizar aquí
function dbAll() {
  return new Promise(async (ok, fail) => {
    try {
      const snap = await get(ref(db, STORE));
      const obj = snap.val() || {};
      const list = normalizeList(obj); // <<< PATCH
      ok(list);
    } catch (e) { fail(e); }
  });
}

// Guardar / actualizar un proceso { id, ... }
function dbPut(p) {
  return new Promise(async (ok, fail) => {
    try {
      if (!p?.id) throw new Error('dbPut: falta p.id');
      await set(ref(db, `${STORE}/${safeKey(p.id)}`), p);
      ok();
    } catch (e) { fail(e); }
  });
}

// Borrar un proceso por id
function dbDel(id) {
  return new Promise(async (ok, fail) => {
    try { await remove(ref(db, `${STORE}/${safeKey(id)}`)); ok(); }
    catch (e) { fail(e); }
  });
}

// Borrar TODO el nodo /procesos
function dbClear() {
  return new Promise(async (ok, fail) => {
    try { await remove(ref(db, STORE)); ok(); }
    catch (e) { fail(e); }
  });
}

// Suscripción en tiempo real — PATCH: normalizar aquí
function subscribeRealtime() {
  onValue(ref(db, STORE), (snap) => {
    const obj = snap.val() || {};
    allProcesses = normalizeList(obj); // <<< PATCH

    const h = window.location.hash || '#/';
    if (h.startsWith('#/detail/')) {
      const id = decodeURIComponent(h.replace('#/detail/', ''));
      if (!allProcesses.find(x => x.id === id)) {
        navigate('#/');
        renderIndex?.();
      } else {
        renderDetail?.(id);
      }
    } else {
      renderIndex?.();
    }
  });
}

// openDB ahora inicia la suscripción
function openDB() { return new Promise((ok) => { subscribeRealtime(); ok(); }); }

// ================================================================
// 2. MODEL
// ================================================================
function makeProcess(d = {}) {
  const tipo = d.tipo || 'CLP';
  const proc = d.proceso || '001/2025';
  return {
    id: `${tipo}-${proc}`, tipo, proceso: proc,
    sigla: d.sigla || '', objeto: d.objeto || '',
    estado: d.estado || 'En Proceso',
    proximoEvento: d.proximoEvento || '',
    fechaAperturaSobre1: d.fechaAperturaSobre1 || '',
    fechaAperturaSobre2: d.fechaAperturaSobre2 || '',
    fechaAperturaEconomica: d.fechaAperturaEconomica || '',
    items: Array.isArray(d.items) ? d.items : [],
    participantes: Array.isArray(d.participantes) ? d.participantes : [],
    ofertas: d.ofertas && typeof d.ofertas === 'object' ? d.ofertas : {},
    adjudicaciones: d.adjudicaciones && typeof d.adjudicaciones === 'object' ? d.adjudicaciones : {},
    observaciones: d.observaciones || ''
  };
}

// ================================================================
// 3. HELPERS
// ================================================================
function esc(s) { return (s || '').replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"'); }
function fmtNum(n) { if (n === null || n === undefined || n === '' || isNaN(n)) return ''; return Number(n).toLocaleString('es-PY'); }
function parseNum(s) {
  if (!s || /no\s*cotiza/i.test(String(s))) return null;
  const c = String(s).replace(/[^\d.,\-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(c);
  return isNaN(n) ? null : n;
}
function estadoClass(e) {
  const l = (e || '').toLowerCase();
  if (l.includes('adjudicado')) return 'badge-adjudicado';
  if (l.includes('cancelado')) return 'badge-cancelado';
  if (l.includes('desierto')) return 'badge-desierto';
  if (l.includes('evaluaci')) return 'badge-evaluacion';
  return 'badge-en-proceso';
}
function tipoBadge(t) { return `<span class="badge badge-${(t || 'clp').toLowerCase()}">${esc(t)}</span>`; }
function estadoBadge(e) { return `<span class="badge ${estadoClass(e)}">${esc(e || 'Sin estado')}</span>`; }
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span> ${esc(msg)}`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3000);
}
function now() { const d = new Date(); return d.toLocaleDateString('es-PY') + ' ' + d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }); }

// ================================================================
// 4. AUTOSAVE INDICATOR
// ================================================================
let _autoTimer = null;
function showAutoSave(state) {
  const el = document.getElementById('autosaveIndicator');
  if (!el) return;
  el.className = 'autosave-indicator show ' + (state === 'ok' ? 'ok' : state === 'busy' ? 'busy' : 'err');
  el.textContent = state === 'ok' ? '✓ Guardado' : state === 'busy' ? '⏳ Guardando…' : '✗ Error';
  clearTimeout(_autoTimer);
  _autoTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ================================================================
// 5. ROUTING (hash-based)
// ================================================================
let currentPage = 1;
//const PAGE_SIZE = 15; // Cambiá si querés más por página (ej.: 50 o 9999)


// 🔽🔽🔽 AÑADIR ESTAS 3 LÍNEAS 🔽🔽🔽
// Expone currentPage al ámbito global y lo mantiene sincronizado.
// Así el HTML (onclick="currentPage=…") funciona en scripts tipo módulo.
Object.defineProperty(window, 'currentPage', {
  get() { return currentPage; },
  set(v) { currentPage = Math.max(1, Number(v) || 1); }
});
``


let sortField = 'proceso';
let sortDir = 'asc';
function navigate(hash) { window.location.hash = hash; }
function handleRoute() {
  const h = window.location.hash || '#/';
  const idx = document.getElementById('viewIndex');
  const det = document.getElementById('viewDetail');
  if (!idx || !det) return;
  idx.classList.toggle('hidden', h.startsWith('#/detail/'));
  det.classList.toggle('hidden', !h.startsWith('#/detail/'));
  document.getElementById('headerTitle').textContent = h.startsWith('#/detail/') ? 'Detalle del Proceso' : 'Índice de Procesos';
  if (h.startsWith('#/detail/')) {
    renderDetail(decodeURIComponent(h.replace('#/detail/', '')));
  } else {
    renderIndex();
  }
  document.querySelector('.content-scroll')?.scrollTo(0, 0);
}
window.addEventListener('hashchange', handleRoute);

// ================================================================
// 6. INDEX VIEW
// ================================================================
function getFiltered() {
  const s = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const t = document.getElementById('filterTipo')?.value || '';
  const e = document.getElementById('filterEstado')?.value || '';
  const g = document.getElementById('filterSigla')?.value || '';
  return allProcesses.filter(p => {
    if (t && p.tipo !== t) return false;
    if (e && p.estado !== e) return false;
    if (g && p.sigla !== g) return false;
    if (s && ![p.proceso, p.objeto, p.sigla, p.estado, p.proximoEvento, p.tipo].join(' ').toLowerCase().includes(s)) return false;
    return true;
  });
}
function sorted(list) {
  return [...list].sort((a, b) => {
    let va = a[sortField] || '', vb = b[sortField] || '';
    if (sortField === 'proceso') { va = va.replace('/', ''); vb = vb.replace('/', ''); }
    const c = String(va).localeCompare(String(vb), 'es', { numeric: true });
    return sortDir === 'asc' ? c : -c;
  });
}
function toggleSort(f) { if (sortField === f) sortDir = sortDir === 'asc' ? 'desc' : 'asc'; else { sortField = f; sortDir = 'asc'; } renderIndex(); }
window.toggleSort = toggleSort;

function renderIndex() {
  // Stats
  const total = allProcesses.length;
  const adj = allProcesses.filter(p => (p.estado || '').toLowerCase().includes('adjudicado')).length;
  const canc = allProcesses.filter(p => { const l = (p.estado || '').toLowerCase(); return l.includes('cancelado') || l.includes('desierto'); }).length;
  const proc = total - adj - canc;
  const clp = allProcesses.filter(p => p.tipo === 'CLP').length;
  const cpp = allProcesses.filter(p => p.tipo === 'CPP').length;
  document.getElementById('statsBar').innerHTML =
    `<div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total</div></div>` +
    `<div class="stat-card"><div class="stat-value" style="color:var(--green)">${adj}</div><div class="stat-label">Adjudicados</div></div>` +
    `<div class="stat-card"><div class="stat-value" style="color:var(--accent)">${proc}</div><div class="stat-label">En Proceso</div></div>` +
    `<div class="stat-card"><div class="stat-value" style="color:var(--blue)">${clp}</div><div class="stat-label">CLP</div></div>` +
    `<div class="stat-card"><div class="stat-value" style="color:var(--purple)">${cpp}</div><div class="stat-label">CPP</div></div>`;

  // Filters
  const estados = [...new Set(allProcesses.map(p => p.estado).filter(Boolean))].sort();
  const siglas = [...new Set(allProcesses.map(p => p.sigla).filter(Boolean))].sort();
  const fE = document.getElementById('filterEstado'), cE = fE?.value || '';
  if (fE) fE.innerHTML = '<option value="">Todos los estados</option>' + estados.map(e => `<option ${e === cE ? 'selected' : ''}>${esc(e)}</option>`).join('');
  const fS = document.getElementById('filterSigla'), cS = fS?.value || '';
  if (fS) fS.innerHTML = '<option value="">Todas las siglas</option>' + siglas.map(s => `<option ${s === cS ? 'selected' : ''}>${esc(s)}</option>`).join('');

  // Table
  const filtered = sorted(getFiltered());
  const totalP = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalP) currentPage = totalP;
  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);
  const body = document.getElementById('indexBody');
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📋</div><h3>No hay procesos</h3><p>Importá un archivo JSON o creá un nuevo proceso.</p></div></td></tr>`;
  } else {
    body.innerHTML = page.map(p => `<tr onclick="navigate('#/detail/${encodeURIComponent(p.id)}')">
      <td>${tipoBadge(p.tipo)}</td>
      <td class="col-proceso">${esc(p.proceso)}</td>
      <td class="col-objeto" title="${esc(p.objeto)}">${esc(p.objeto) || '—'}</td>
      <td class="col-estado">${estadoBadge(p.estado)}</td>
      <td class="col-evento" title="${esc(p.proximoEvento)}">${esc(p.proximoEvento) || '—'}</td>
      <td class="col-sigla" title="${esc(p.sigla)}">${esc(p.sigla) || '—'}</td>
    </tr>`).join('');
  }
  document.getElementById('paginationBar').innerHTML =
    `<span>${filtered.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, filtered.length)} de ${filtered.length}</span>` +
    `<div class="pagination-btns">` +
    `<button class="btn btn-xs" onclick="currentPage=1;renderIndex()" ${currentPage === 1 ? 'disabled' : ''}>«</button>` +
    `<button class="btn btn-xs" onclick="currentPage--;renderIndex()" ${currentPage === 1 ? 'disabled' : ''}>‹</button>` +
    `<span style="padding:3px 7px;font-size:11px">Pág ${currentPage}/${totalP}</span>` +
    `<button class="btn btn-xs" onclick="currentPage++;renderIndex()" ${currentPage >= totalP ? 'disabled' : ''}>›</button>` +
    `<button class="btn btn-xs" onclick="currentPage=${totalP};renderIndex()" ${currentPage >= totalP ? 'disabled' : ''}>»</button>` +
    `</div>`;

  // Print header data
  const s = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const t = document.getElementById('filterTipo')?.value || '';
  const e = document.getElementById('filterEstado')?.value || '';
  const g = document.getElementById('filterSigla')?.value || '';
  document.getElementById('printFilterInfo').textContent = [
    t && `Tipo: ${t}`,
    e && `Estado: ${e}`,
    g && `Sigla: ${g}`,
    s && `Búsqueda: "${s}"`
  ].filter(Boolean).join(' · ') || 'Sin filtros';
}

// ================================================================
// 7. DETAIL VIEW + AUTOSAVE
// ================================================================
function renderDetail(id) {
  const p = allProcesses.find(x => x.id === id);
  const el = document.getElementById('viewDetail');
  if (!p) { el.innerHTML = '<div class="empty-state"><h3>No encontrado</h3><button class="btn" onclick="navigate(\'#/\')">Volver</button></div>'; return; }
  const items = p.items || [], parts = p.participantes || [];
  let h = '';

  // Header
  h += `<div class="detail-header">
    <div class="back-btn" onclick="navigate('#/')" title="Volver al índice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></div>
    <div class="detail-title">${tipoBadge(p.tipo)} ${esc(p.proceso)} <span class="sub">— ${esc(p.sigla) || 'Sin sigla'}</span></div>
    <div style="margin-left:auto;display:flex;gap:5px;flex-wrap:wrap">
      <button class="btn btn-sm no-print" onclick="printDetail('${esc(p.id)}')">🖨 Imprimir</button>
      <button class="btn btn-danger btn-sm no-print" onclick="deleteProcess('${esc(p.id)}')">🗑 Eliminar</button>
      <button class="btn btn-success no-print" onclick="saveDetail('${esc(p.id)}')">💾 Guardar</button>
    </div>
  </div>`;

  // Info + Status cards
  h += `<div class="detail-grid">
    <div class="card"><div class="card-header">Información General</div><div class="card-body">
      <div class="form-row">
        <div class="form-group"><label for="d_tipo">Tipo</label><select id="d_tipo" data-autosave data-pid="${esc(p.id)}"><option ${p.tipo==='CLP'?'selected':''}>CLP</option><option ${p.tipo==='CPP'?'selected':''}>CPP</option></select></div>
        <div class="form-group"><label for="d_proceso">Proceso</label><input id="d_proceso" value="${esc(p.proceso)}" data-autosave data-pid="${esc(p.id)}"></div>
      </div>
      <div class="form-row"><div class="form-group full"><label for="d_sigla">Sigla / Proyecto</label><input id="d_sigla" value="${esc(p.sigla)}" data-autosave data-pid="${esc(p.id)}"></div></div>
      <div class="form-row"><div class="form-group full"><label for="d_objeto">Objeto del Proceso</label><textarea id="d_objeto" rows="3" data-autosave data-pid="${esc(p.id)}">${esc(p.objeto)}</textarea></div></div>
    </div></div>
    <div class="card"><div class="card-header">Estado y Fechas</div><div class="card-body">
      <div class="form-row"><div class="form-group"><label for="d_estado">Estado</label><input id="d_estado" value="${esc(p.estado)}" data-autosave data-pid="${esc(p.id)}"></div></div>
      <div class="form-row"><div class="form-group full"><label for="d_proximoEvento">Próximo Evento</label><input id="d_proximoEvento" value="${esc(p.proximoEvento)}" data-autosave data-pid="${esc(p.id)}"></div></div>
      <div class="form-row">
        <div class="form-group"><label for="d_fechaS1">Apertura Sobre 1</label><input type="date" id="d_fechaS1" value="${p.fechaAperturaSobre1||''}" data-autosave data-pid="${esc(p.id)}"></div>
        <div class="form-group"><label for="d_fechaS2">Apertura Sobre 2</label><input type="date" id="d_fechaS2" value="${p.fechaAperturaSobre2||''}" data-autosave data-pid="${esc(p.id)}"></div>
      </div>
      <div class="form-row"><div class="form-group"><label for="d_fechaEco">Apertura Económica</label><input type="date" id="d_fechaEco" value="${p.fechaAperturaEconomica||''}" data-autosave data-pid="${esc(p.id)}"></div></div>
    </div></div>
  </div>`;

  // Items
  h += `<div class="card" style="margin-bottom:12px"><div class="card-header">Precio Referencial / SOLPED <button class="btn btn-xs no-print" onclick="addItem('${esc(p.id)}')">+ Ítem</button></div>
    <div class="card-body" style="padding:0;overflow-x:auto"><table class="inner-table"><thead><tr>
      <th style="width:32px">#</th><th>Nombre</th><th style="width:160px">Precio Ref. c/IVA</th>
      <th style="width:140px">Mín (−30%)</th><th style="width:140px">Máx (+30%)</th><th style="width:44px" class="no-print"></th>
    </tr></thead><tbody>`;
  if (items.length) {
    items.forEach((it, i) => {
      const min = it.precioReferencial ? it.precioReferencial * 0.70 : 0;
      const max = it.precioReferencial ? it.precioReferencial * 1.30 : 0;
      h += `<tr><td>${i + 1}</td>
        <td><input class="item-nombre" data-idx="${i}" value="${esc(it.nombre)}" data-autosave-item data-pid="${esc(p.id)}"></td>
        <td><input class="item-precio num" data-idx="${i}" value="${it.precioReferencial||''}" style="text-align:right;font-family:var(--mono)" data-autosave-item data-pid="${esc(p.id)}"></td>
        <td class="num" style="color:var(--text-dim)">${fmtNum(min)}</td>
        <td class="num" style="color:var(--text-dim)">${fmtNum(max)}</td>
        <td class="no-print"><button class="btn btn-xs btn-danger" onclick="removeItem('${esc(p.id)}',${i})">✕</button></td></tr>`;
    });
  } else {
    h += `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:16px">Sin ítems — Agregá uno con +</td></tr>`;
  }
  h += `</tbody></table></div></div>`;

  // Participants
  h += `<div class="card" style="margin-bottom:12px"><div class="card-header">Apertura 1 — Evaluación Sustancial / Formal <button class="btn btn-xs no-print" onclick="addParticipant('${esc(p.id)}')">+ Participante</button></div>
    <div class="card-body" style="padding:0;overflow-x:auto"><table class="inner-table part-table"><thead><tr>
      <th style="width:32px">#</th><th style="text-align:left">Participante</th>
      <th style="width:120px">Sobre 1</th><th style="width:120px">Sobre 2</th><th style="width:80px">Clasificó</th><th style="width:44px" class="no-print"></th>
    </tr></thead><tbody>`;
  if (parts.length) {
    parts.forEach((pt, i) => {
      const cl = pt.sobre1 && pt.sobre2;
      h += `<tr><td>${i + 1}</td>
        <td style="text-align:left"><input class="part-nombre" data-idx="${i}" value="${esc(pt.nombre)}" data-autosave-part data-pid="${esc(p.id)}"></td>
        <td style="text-align:center"><span class="toggle ${pt.sobre1 ? 'yes' : 'no'}" onclick="togglePart(${i},'sobre1','${esc(p.id)}')">${pt.sobre1 ? 'Sí' : 'No'}</span></td>
        <td style="text-align:center"><span class="toggle ${pt.sobre2 ? 'yes' : 'no'}" onclick="togglePart(${i},'sobre2','${esc(p.id)}')">${pt.sobre2 ? 'Sí' : 'No'}</span></td>
        <td style="text-align:center"><span class="clasif-badge ${cl ? 'clasif-si' : 'clasif-no'}">${cl ? 'Sí' : 'No'}</span></td>
        <td class="no-print"><button class="btn btn-xs btn-danger" onclick="removePart('${esc(p.id)}',${i})">✕</button></td></tr>`;
    });
  } else {
    h += `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:16px">Sin participantes</td></tr>`;
  }
  h += `</tbody></table></div></div>`;

  // Offers
  if (items.length && parts.length) {
    h += `<div class="card" style="margin-bottom:12px"><div class="card-header">Apertura 2 — Evaluación Oferta Económica (Sobre 3)</div>
      <div class="card-body" style="padding:0"><div class="offers-wrap"><table class="inner-table offers-table"><thead><tr>
        <th style="text-align:left">Participante</th><th>Clasificó</th>
        ${items.map(it => `<th>${esc(it.nombre)}</th>`).join('')}
      </tr></thead><tbody>`;
    parts.forEach((pt, pi) => {
      const cl = pt.sobre1 && pt.sobre2;
      h += `<tr><td style="font-weight:500">${esc(pt.nombre)}</td>
        <td><span class="clasif-badge ${cl ? 'clasif-si' : 'clasif-no'}">${cl ? 'Sí' : 'No'}</span></td>`;
      items.forEach((it, ii) => {
        const key = `${pi}-${ii}`, of_ = p.ofertas[key], adj = (p.adjudicaciones || {})[key] === true;
        const min = it.precioReferencial ? it.precioReferencial * 0.70 : 0;
        const max = it.precioReferencial ? it.precioReferencial * 1.30 : 0;
        if (!cl) { h += `<td><span class="offer-cell offer-descalificado">Descalificado</span></td>`; return; }
        if (of_ === 'no_cotiza') {
          h += `<td><div style="display:flex;flex-direction:column;align-items:center;gap:1px">
            <span class="offer-cell offer-no-cotiza">No cotiza</span>
            <span class="no-print" style="font-size:9px;color:var(--text-muted);cursor:pointer;text-decoration:underline" onclick="clearOffer(${pi},${ii},'${esc(p.id)}')">limpiar</span>
          </div></td>`;
          return;
        }
        let bC = 'var(--blue-border)', bgC = 'var(--blue-bg)';
        if (of_ !== undefined && of_ !== null && of_ !== '') {
          const n = Number(of_);
          if (adj) { bC = 'var(--yellow-border)'; bgC = 'var(--yellow-bg)'; }
          else if (it.precioReferencial && (n < min || n > max)) { bC = 'var(--orange-border)'; bgC = 'var(--orange-bg)'; }
        }
        h += `<td><div style="display:flex;flex-direction:column;align-items:center;gap:1px">
          <input class="offer-input" data-pi="${pi}" data-ii="${ii}" value="${of_ === undefined || of_ === null ? '' : of_}"
                 style="border-color:${bC};background:${bgC}" placeholder="Monto"
                 data-autosave-offer data-pid="${esc(p.id)}">
          <div class="no-print" style="display:flex;gap:3px;align-items:center">
            <span style="font-size:9px;color:var(--text-muted);cursor:pointer;text-decoration:underline" onclick="setNoCotiza(${pi},${ii},'${esc(p.id)}')">No cotiza</span>
            <button class="adj-btn ${adj ? 'active' : ''}" onclick="toggleAdj(${pi},${ii},'${esc(p.id)}')">★ Adj</button>
          </div>
        </div></td>`;
      });
      h += `</tr>`;
    });
    h += `</tbody></table></div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:var(--red)"></div> Descalificado</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--blue)"></div> Dentro de Rango</div>
        <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div> Adjudicado</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--orange)"></div> Fuera ±30%</div>
        <div class="legend-item"><div class="legend-dot" style="background:#ccc"></div> No Cotiza</div>
      </div>
    </div></div>`;
  }

  // Observations
  h += `<div class="card" style="margin-bottom:12px"><div class="card-header">Observaciones</div><div class="card-body">
    <textarea id="d_observaciones" rows="4" style="width:100%" data-autosave data-pid="${esc(p.id)}">${esc(p.observaciones)}</textarea>
  </div></div>`;

  // Bottom actions
  h += `<div class="no-print" style="display:flex;gap:5px;justify-content:flex-end;margin-bottom:24px">
    <button class="btn" onclick="navigate('#/')">← Volver</button>
    <button class="btn btn-success" onclick="saveDetail('${esc(p.id)}')">💾 Guardar Cambios</button>
  </div>`;

  el.innerHTML = h;
  attachAutosaveListeners(p.id);
}

// Attach blur listeners for autosave
function attachAutosaveListeners(pid) {
  document.querySelectorAll('[data-autosave]').forEach(el => {
    el.addEventListener('blur', () => autoSaveField(pid));
    if (el.tagName === 'SELECT') el.addEventListener('change', () => autoSaveField(pid));
  });
  document.querySelectorAll('[data-autosave-item]').forEach(el => { el.addEventListener('blur', () => autoSaveField(pid)); });
  document.querySelectorAll('[data-autosave-part]').forEach(el => { el.addEventListener('blur', () => autoSaveField(pid)); });
  document.querySelectorAll('[data-autosave-offer]').forEach(el => { el.addEventListener('blur', () => autoSaveField(pid)); });
}
async function autoSaveField(pid) {
  showAutoSave('busy');
  try { await collectAndSave(pid, true); showAutoSave('ok'); }
  catch (e) { console.error(e); showAutoSave('err'); }
}
async function collectAndSave(pid, silent) {
  const p = allProcesses.find(x => x.id === pid);
  if (!p) return;
  const gv = id => document.getElementById(id)?.value?.trim() ?? '';
  const nT = gv('d_tipo'), nP = gv('d_proceso'), nId = `${nT}-${nP}`;
  p.tipo = nT; p.proceso = nP;
  p.sigla = gv('d_sigla'); p.objeto = gv('d_objeto');
  p.estado = gv('d_estado'); p.proximoEvento = gv('d_proximoEvento');
  p.fechaAperturaSobre1 = gv('d_fechaS1');
  p.fechaAperturaSobre2 = gv('d_fechaS2');
  p.fechaAperturaEconomica = gv('d_fechaEco');
  p.observaciones = document.getElementById('d_observaciones')?.value || '';

  document.querySelectorAll('.item-nombre').forEach(el => { const i = +el.dataset.idx; if (p.items[i]) p.items[i].nombre = el.value; });
  document.querySelectorAll('.item-precio').forEach(el => { const i = +el.dataset.idx; if (p.items[i]) p.items[i].precioReferencial = parseNum(el.value) || 0; });
  document.querySelectorAll('.part-nombre').forEach(el => { const i = +el.dataset.idx; if (p.participantes[i]) p.participantes[i].nombre = el.value; });
  document.querySelectorAll('.offer-input').forEach(el => {
    const pi = +el.dataset.pi, ii = +el.dataset.ii, k = `${pi}-${ii}`, v = el.value.trim();
    if (v === '') { if (p.ofertas[k] !== 'no_cotiza') delete p.ofertas[k]; }
    else p.ofertas[k] = parseNum(v) || 0;
  });
  if (nId !== pid) await dbDel(pid);
  p.id = nId;
  await dbPut(p);
  allProcesses = await dbAll();
  return nId;
}
async function saveDetail(pid) {
  try {
    const nId = await collectAndSave(pid, false);
    toast('Guardado ✓');
    renderDetail(nId || pid);
    if (nId && nId !== pid) window.location.hash = `#/detail/${encodeURIComponent(nId)}`;
  } catch (e) { toast('Error al guardar: ' + e.message, 'error'); }
}
window.saveDetail = saveDetail;

// Detail actions
function togglePart(i, f, pid) { const p = allProcesses.find(x => x.id === pid); if (p?.participantes[i]) { p.participantes[i][f] = !p.participantes[i][f]; dbPut(p).then(() => renderDetail(pid)); } }
function addItem(pid) { const p = allProcesses.find(x => x.id === pid); if (!p) return; p.items.push({ nombre: `Ítem ${(p.items.length + 1) * 10}`, precioReferencial: 0 }); dbPut(p).then(() => renderDetail(pid)); }
function removeItem(pid, idx) {
  const p = allProcesses.find(x => x.id === pid); if (!p) return; p.items.splice(idx, 1);
  const nO = {}, nA = {};
  Object.entries(p.ofertas).forEach(([k, v]) => { const [pi, ii] = k.split('-').map(Number); if (ii < idx) nO[k] = v; else if (ii > idx) nO[`${pi}-${ii-1}`] = v; });
  Object.entries(p.adjudicaciones || {}).forEach(([k, v]) => { const [pi, ii] = k.split('-').map(Number); if (ii < idx) nA[k] = v; else if (ii > idx) nA[`${pi}-${ii-1}`] = v; });
  p.ofertas = nO; p.adjudicaciones = nA; dbPut(p).then(() => renderDetail(pid));
}
function addParticipant(pid) { const p = allProcesses.find(x => x.id === pid); if (!p) return; p.participantes.push({ nombre: '', sobre1: false, sobre2: false }); dbPut(p).then(() => renderDetail(pid)); }
function removePart(pid, idx) {
  const p = allProcesses.find(x => x.id === pid); if (!p) return; p.participantes.splice(idx, 1);
  const nO = {}, nA = {};
  Object.entries(p.ofertas).forEach(([k, v]) => { const [pi, ii] = k.split('-').map(Number); if (pi < idx) nO[k] = v; else if (pi > idx) nO[`${pi-1}-${ii}`] = v; });
  Object.entries(p.adjudicaciones || {}).forEach(([k, v]) => { const [pi, ii] = k.split('-').map(Number); if (pi < idx) nA[k] = v; else if (pi > idx) nA[`${pi-1}-${ii}`] = v; });
  p.ofertas = nO; p.adjudicaciones = nA; dbPut(p).then(() => renderDetail(pid));
}
function setNoCotiza(pi, ii, pid) { const p = allProcesses.find(x => x.id === pid); if (!p) return; p.ofertas[`${pi}-${ii}`] = 'no_cotiza'; dbPut(p).then(() => renderDetail(pid)); }
function clearOffer(pi, ii, pid) { const p = allProcesses.find(x => x.id === pid); if (!p) return; delete p.ofertas[`${pi}-${ii}`]; dbPut(p).then(() => renderDetail(pid)); }
function toggleAdj(pi, ii, pid) { const p = allProcesses.find(x => x.id === pid); if (!p) return; if (!p.adjudicaciones) p.adjudicaciones = {}; const k = `${pi}-${ii}`; p.adjudicaciones[k] = !p.adjudicaciones[k]; dbPut(p).then(() => renderDetail(pid)); }
async function deleteProcess(id) { if (!confirm('¿Eliminar este proceso permanentemente?')) return; await dbDel(id); allProcesses = await dbAll(); toast('Proceso eliminado'); navigate('#/'); }
window.togglePart = togglePart; window.addItem = addItem; window.removeItem = removeItem;
window.addParticipant = addParticipant; window.removePart = removePart;
window.setNoCotiza = setNoCotiza; window.clearOffer = clearOffer;
window.toggleAdj = toggleAdj; window.deleteProcess = deleteProcess;
window.navigate = navigate; window.renderIndex = renderIndex;

// ================================================================
// 8. NEW PROCESS MODAL
// ================================================================
function showNewProcess() {
  document.getElementById('modalContent').innerHTML = `
    <h3>Nuevo Proceso</h3>
    <div class="form-row"><div class="form-group"><label>Tipo</label><select id="new_tipo"><option>CLP</option><option>CPP</option></select></div>
    <div class="form-group"><label>Proceso (NNN/AAAA)</label><input id="new_proceso" placeholder="001/2025"></div></div>
    <div class="form-row"><div class="form-group full"><label>Sigla / Proyecto</label><input id="new_sigla" placeholder="FPTI-PY"></div></div>
    <div class="form-row"><div class="form-group full"><label>Objeto</label><textarea id="new_objeto" rows="3"></textarea></div></div>
    <div class="form-row"><div class="form-group"><label>Estado</label><input id="new_estado" value="En Proceso"></div></div>
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="createNew()">Crear Proceso</button></div>`;
  document.getElementById('modalOverlay').classList.add('active');
}
async function createNew() {
  const t = document.getElementById('new_tipo').value;
  const pr = document.getElementById('new_proceso').value.trim();
  if (!pr) { toast('Ingresá el número de proceso', 'error'); return; }
  const id = `${t}-${pr}`;
  if (allProcesses.find(p => p.id === id)) { toast('Ya existe un proceso con ese identificador', 'error'); return; }
  const p = makeProcess({ tipo: t, proceso: pr, sigla: document.getElementById('new_sigla').value.trim(), objeto: document.getElementById('new_objeto').value.trim(), estado: document.getElementById('new_estado').value.trim() });
  await dbPut(p); allProcesses = await dbAll();
  closeModal(); toast('Proceso creado ✓');
  navigate(`#/detail/${encodeURIComponent(p.id)}`);
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }
window.showNewProcess = showNewProcess; window.createNew = createNew; window.closeModal = closeModal;

// ================================================================
// 9. IMPORT / EXPORT JSON
// ================================================================
async function exportJSON() {
  if (!allProcesses.length) { toast('No hay datos para exportar', 'error'); return; }
  const blob = new Blob([JSON.stringify(allProcesses, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  const d = new Date();
  a.download = `data_compras_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('JSON exportado ✓');
}
window.exportJSON = exportJSON;
function triggerImportJSON() { const inp = document.getElementById('fileImportJSON'); if (inp) inp.click(); }
window.triggerImportJSON = triggerImportJSON;

async function handleImportJSON(e) {
  const f = e.target.files[0]; if (!f) return;
  if (!confirm('¿Importar este archivo JSON?\nLos datos actuales serán REEMPLAZADOS por el contenido del archivo.')) { e.target.value = ''; return; }
  try {
    const text = await f.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('El archivo debe contener un array de procesos');
    // Borramos RTDB y subimos uno a uno (quedan claves por id)
    await dbClear();
    for (const item of data) {
      const mapped = item.id && item.tipo && item.proceso ? item : {
        tipo: inferTipo(item), proceso: inferProceso(item), sigla: item.unidad || item.sigla || '', objeto: item.objeto || '',
        estado: item.estado || 'En Proceso', proximoEvento: item.proximo_evento_desc || item.proximoEvento || '', fechaAperturaSobre1: normalizeFecha(item.proximo_evento_fecha),
        items: item.items, participantes: item.participantes, ofertas: item.ofertas, adjudicaciones: item.adjudicaciones, observaciones: item.observaciones
      };
      const p = makeProcess(mapped);
      if (item.items) p.items = item.items;
      if (item.participantes) p.participantes = item.participantes;
      if (item.ofertas) p.ofertas = item.ofertas;
      if (item.adjudicaciones) p.adjudicaciones = item.adjudicaciones;
      await dbPut(p);
    }
    allProcesses = await dbAll();
    toast(`Importados ${allProcesses.length} procesos ✓`);
    navigate('#/'); renderIndex();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
  e.target.value = '';
}

// Excel import (opcional, igual a tu versión previa)
async function handleImportExcel(e) {
  const f = e.target.files[0]; if (!f) return;
  if (!confirm('¿Importar Excel? Los datos actuales serán REEMPLAZADOS.')) { e.target.value = ''; return; }
  try {
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    // Try DATA sheet (JSON)
    if (wb.SheetNames.includes('DATA')) {
      try {
        const j = XLSX.utils.sheet_to_json(wb.Sheets['DATA'], { header: 1 })[0]?.[0];
        if (j) {
          const parsed = JSON.parse(j);
          if (Array.isArray(parsed)) {
            await dbClear();
            for (const it of parsed) { const p = makeProcess(it); await dbPut(p); }
            allProcesses = await dbAll();
            toast(`Importados ${allProcesses.length} procesos (Excel completo)`);
            navigate('#/'); renderIndex(); e.target.value = ''; return;
          }
        }
      } catch (ex) {}
    }
    // Parse INDEX sheet (heurístico)
    const sd = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    let hr = -1;
    for (let i = 0; i < Math.min(sd.length, 10); i++) {
      if (sd[i].map(c => String(c).toLowerCase()).some(c => c.includes('proceso') || c.includes('objeto'))) { hr = i; break; }
    }
    const procs = [];
    if (hr >= 0) {
      const hd = sd[hr].map(h => String(h).toLowerCase().trim());
      const cT = hd.findIndex(h => h.includes('tipo')),
            cP = hd.findIndex(h => h.includes('proceso')),
            cO = hd.findIndex(h => h.includes('objeto')),
            cE = hd.findIndex(h => h.includes('estado')),
            cEv = hd.findIndex(h => h.includes('próximo') || h.includes('proximo') || h.includes('evento')),
            cS = hd.findIndex(h => h.includes('sigla') || h.includes('proyecto'));
      for (let i = hr + 1; i < sd.length; i++) {
        const r = sd[i]; if (!r || !r.length) continue;
        let tipo = '', proc = '';
        const raw = String(r[cP >= 0 ? cP : 1] || '').trim();
        if (cT >= 0 && r[cT]) tipo = String(r[cT]).trim().toUpperCase();
        if (raw.match(/^(CLP|CPP)/i)) { const m = raw.match(/^(CLP|CPP)[\/\s]*(.+)/i); if (m) { tipo = m[1].toUpperCase(); proc = m[2].replace(/^\//, '').trim(); } }
        else proc = raw;
        if (!tipo) tipo = String(r[0] || '').trim().toUpperCase();
        if (!proc) proc = String(r[1] || '').trim();
        if (proc.match(/^(CLP|CPP)/i)) { const m = proc.match(/^(CLP|CPP)[\/\s]*(.+)/i); if (m) { tipo = m[1].toUpperCase(); proc = m[2].replace(/^\//, '').trim(); } }
        if (!proc || (!tipo.includes('CLP') && !tipo.includes('CPP'))) continue;
        const id = `${tipo}-${proc}`; if (procs.find(p => p.id === id)) continue;
        procs.push(makeProcess({
          tipo, proceso: proc,
          sigla: String(r[cS >= 0 ? cS : 5] || '').trim(),
          objeto: String(r[cO >= 0 ? cO : 2] || '').trim(),
          estado: String(r[cE >= 0 ? cE : 3] || '').trim(),
          proximoEvento: String(r[cEv >= 0 ? cEv : 4] || '').trim()
        }));
      }
    }
    if (!procs.length) { toast('No se encontraron procesos en el Excel', 'error'); e.target.value = ''; return; }
    await dbClear(); for (const p of procs) await dbPut(p);
    allProcesses = await dbAll(); toast(`Importados ${procs.length} procesos (Excel)`); navigate('#/'); renderIndex();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
  e.target.value = '';
}

// ================================================================
// 10. PRINT
// ================================================================
function printSummary() { document.getElementById('printTimestamp').textContent = now(); window.print(); }
function printDetail(pid) { document.getElementById('printTimestamp').textContent = now(); document.getElementById('printFilterInfo').textContent = `Detalle: ${pid}`; window.print(); }
window.printSummary = printSummary; window.printDetail = printDetail;

// ================================================================
// 11. SIDEBAR MOBILE
// ================================================================
function toggleSidebar() { document.querySelector('.sidebar')?.classList.toggle('open'); document.querySelector('.sidebar-overlay')?.classList.toggle('open'); }
function closeSidebar() { document.querySelector('.sidebar')?.classList.remove('open'); document.querySelector('.sidebar-overlay')?.classList.remove('open'); }
window.toggleSidebar = toggleSidebar; window.closeSidebar = closeSidebar;

// ================================================================
// 12. INIT (Firebase)
// ================================================================
async function init() {
  await openDB(); // activa suscripción RT
  try { allProcesses = await dbAll(); } catch {}
  document.getElementById('fileImportJSON') ?.addEventListener('change', handleImportJSON);
  document.getElementById('fileImportExcel')?.addEventListener('change', handleImportExcel);
  document.getElementById('modalOverlay') ?.addEventListener('click', e => { if (e.target===e.currentTarget) closeModal(); });
  handleRoute();
}
init();
