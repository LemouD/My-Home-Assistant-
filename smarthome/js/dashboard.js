// =============================================
// DASHBOARD.JS — Logique page d'accueil
// =============================================

// ---- LUMIÈRES ----

function renderLumieres(etats = {}) {
  const grid = document.getElementById('lumieres-grid');
  if (!grid) return;

  let allumees = 0;
  let html = '';

  CONFIG.LUMIERES.forEach(l => {
    const etat = etats[l.id];
    const isOn = etat && etat.state === 'on';
    if (isOn) allumees++;

    html += `
      <button
        class="lumiere-btn ${isOn ? 'on' : ''}"
        onclick="toggleLumiere('${l.id}', this)"
        data-entity="${l.id}"
        title="${isOn ? 'Allumée — cliquer pour éteindre' : 'Éteinte — cliquer pour allumer'}"
      >
        <span class="lumiere-icon">${isOn ? '💡' : '🔦'}</span>
        <span class="lumiere-nom">${l.nom}</span>
      </button>`;
  });

  grid.innerHTML = html;

  const countEl = document.getElementById('lumieres-count');
  if (countEl) {
    countEl.textContent = `${allumees} allumée(s)`;
    countEl.style.display = allumees > 0 ? '' : 'none';
  }
}

async function toggleLumiere(entityId, btn) {
  btn.disabled = true;
  btn.style.opacity = '0.5';

  await HA.toggleLight(entityId);

  // Feedback immédiat (optimiste) — on inverse l'état visual
  const isOn = btn.classList.contains('on');
  btn.classList.toggle('on', !isOn);
  btn.querySelector('.lumiere-icon').textContent = !isOn ? '💡' : '🔦';

  // Rafraîchir dans 1s pour avoir l'état réel
  setTimeout(() => {
    rafraichirEtats();
    btn.disabled = false;
    btn.style.opacity = '1';
  }, 1000);
}

async function toutAllumer() {
  await Promise.all(CONFIG.LUMIERES.map(l => HA.lightOn(l.id)));
  setTimeout(rafraichirEtats, 1000);
}

async function toutEteindre() {
  await Promise.all(CONFIG.LUMIERES.map(l => HA.lightOff(l.id)));
  setTimeout(rafraichirEtats, 1000);
}

// ---- PRÉSENCES ----

function renderPresences(etats = {}) {
  const container = document.getElementById('presence-chips');
  if (!container) return;

  let html = '';
  CONFIG.PRESENCES.forEach(p => {
    const etat = etats[p.id];
    const isHome = etat && etat.state === 'home';
    html += `
      <div class="chip ${isHome ? 'chip-green' : 'chip-red'}">
        <span class="dot ${isHome ? 'dot-green' : 'dot-red'}"></span>
        ${p.nom} — ${isHome ? 'Présent' : 'Absent'}
      </div>`;
  });

  container.innerHTML = html || '<span style="color:var(--text-muted); font-size:12px">Présences non configurées</span>';
}

// ---- ALERTES ----

function verifierAlertes(etats = {}) {
  const alertBar = document.getElementById('alert-bar');
  if (!alertBar) return;

  const alertesActives = CONFIG.ALERTES.filter(a => {
    const etat = etats[a.id];
    return etat && etat.state === 'on';
  });

  if (alertesActives.length === 0) return; // Garder les alertes placeholder pour la démo

  let html = '';
  alertesActives.forEach((a, i) => {
    if (i > 0) html += '<span class="alert-sep">|</span>';
    html += `<span class="alert-item"><span class="alert-icon">${a.icone}</span><span class="alert-label">${a.nom}</span><span class="alert-dot"></span></span>`;
  });
  html += '<span style="margin-left:auto; font-size:11px; color:var(--text-muted); cursor:pointer;" onclick="document.getElementById(\'alert-bar\').classList.add(\'hidden\')">✕ Fermer</span>';

  alertBar.innerHTML = html;
  alertBar.classList.remove('hidden');
}

// ---- STATUT HOME ASSISTANT ----

async function verifierHA() {
  const indicateur = document.getElementById('ha-indicator');
  const ok = await HA.ping();
  if (indicateur) {
    indicateur.classList.toggle('offline', !ok);
    indicateur.title = ok ? 'Home Assistant connecté' : 'Home Assistant hors ligne';
  }
  return ok;
}

// ---- RAFRAÎCHISSEMENT ÉTATS ----

let etatsCache = {};

async function rafraichirEtats() {
  const etats = await HA.getAllStates();

  // Transformer le tableau en objet { entity_id: state_obj }
  etatsCache = {};
  etats.forEach(e => { etatsCache[e.entity_id] = e; });

  renderLumieres(etatsCache);
  renderPresences(etatsCache);
  verifierAlertes(etatsCache);
}

// ---- INIT ----

document.addEventListener('DOMContentLoaded', async () => {
  // Rendu initial avec états par défaut (off)
  renderLumieres({});
  renderPresences({});

  // Vérifier connexion HA
  const haOk = await verifierHA();

  if (haOk) {
    // Charger les vrais états
    await rafraichirEtats();
    // Polling toutes les 30 secondes
    setInterval(rafraichirEtats, CONFIG.REFRESH_STATES);
    setInterval(verifierHA, 60000);
  } else {
    // Mode démo — lumières simulées
    console.warn('Home Assistant non joignable — mode démo');
    const demoEtats = {};
    CONFIG.LUMIERES.forEach((l, i) => {
      demoEtats[l.id] = { state: i % 2 === 0 ? 'on' : 'off' };
    });
    renderLumieres(demoEtats);
  }
});
