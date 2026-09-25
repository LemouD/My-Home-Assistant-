// =============================================
// HOME ASSISTANT REST API — Wrapper
// =============================================

const HA = {
  // Headers communs
  _headers() {
    return {
      'Authorization': `Bearer ${CONFIG.HA_TOKEN}`,
      'Content-Type': 'application/json',
    };
  },

  // GET état d'une entité
  async getState(entityId) {
    try {
      const res = await fetch(`${CONFIG.HA_URL}/api/states/${entityId}`, {
        headers: this._headers(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`HA getState(${entityId}) échoué:`, e.message);
      return null;
    }
  },

  // GET tous les états
  async getAllStates() {
    try {
      const res = await fetch(`${CONFIG.HA_URL}/api/states`, {
        headers: this._headers(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('HA getAllStates échoué:', e.message);
      return [];
    }
  },

  // POST appel de service
  async callService(domain, service, data = {}) {
    try {
      const res = await fetch(`${CONFIG.HA_URL}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`HA callService(${domain}.${service}) échoué:`, e.message);
      return null;
    }
  },

  // Toggle lumière
  async toggleLight(entityId) {
    return await this.callService('light', 'toggle', { entity_id: entityId });
  },

  // Allumer lumière
  async lightOn(entityId, brightness = 255) {
    return await this.callService('light', 'turn_on', {
      entity_id: entityId,
      brightness,
    });
  },

  // Éteindre lumière
  async lightOff(entityId) {
    return await this.callService('light', 'turn_off', { entity_id: entityId });
  },

  // Toggle switch
  async toggleSwitch(entityId) {
    return await this.callService('switch', 'toggle', { entity_id: entityId });
  },

  // Vérifier connexion HA
  async ping() {
    try {
      const res = await fetch(`${CONFIG.HA_URL}/api/`, {
        headers: this._headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
