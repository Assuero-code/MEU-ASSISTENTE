// storage.js - Camada Unificada de Dados
const StorageDB = {
  KEYS: {
    EVENTS: 'meu_assistente_events',
    TASKS: 'meu_assistente_tasks',
    ALARMS: 'meu_assistente_alarms',
    NOTIFS: 'meu_assistente_notifications',
    SETTINGS: 'meu_assistente_settings'
  },

  getDefaultSettings() {
    return {
      timezone: 'America/Sao_Paulo',
      voiceFeedback: true,
      speechRate: 1.0,
      theme: 'dark',
      aiEndpoint: '', // URL do backend customizado se houver
      aiApiKey: ''    // Chave BYOK se houver
    };
  },

  get(key, defaultVal = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultVal;
    } catch (e) {
      console.error(`Erro ao carregar chave ${key}:`, e);
      return defaultVal;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Erro ao salvar chave ${key}:`, e);
      return false;
    }
  },

  // Eventos
  getEvents() { return this.get(this.KEYS.EVENTS, []); },
  saveEvent(evt) {
    const list = this.getEvents();
    const idx = list.findIndex(e => e.id === evt.id);
    evt.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      list[idx] = evt;
    } else {
      evt.id = evt.id || 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      evt.createdAt = new Date().toISOString();
      list.push(evt);
    }
    this.set(this.KEYS.EVENTS, list);
    return evt;
  },
  deleteEvent(id) {
    let list = this.getEvents();
    list = list.filter(e => e.id !== id);
    this.set(this.KEYS.EVENTS, list);
  },

  // Tarefas
  getTasks() { return this.get(this.KEYS.TASKS, []); },
  saveTask(task) {
    const list = this.getTasks();
    const idx = list.findIndex(t => t.id === task.id);
    task.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      list[idx] = task;
    } else {
      task.id = task.id || 'tsk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      task.createdAt = new Date().toISOString();
      list.push(task);
    }
    this.set(this.KEYS.TASKS, list);
    return task;
  },
  deleteTask(id) {
    let list = this.getTasks();
    list = list.filter(t => t.id !== id);
    this.set(this.KEYS.TASKS, list);
  },

  // Alarmes
  getAlarms() { return this.get(this.KEYS.ALARMS, []); },
  saveAlarm(alarm) {
    const list = this.getAlarms();
    const idx = list.findIndex(a => a.id === alarm.id);
    alarm.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      list[idx] = alarm;
    } else {
      alarm.id = alarm.id || 'alm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      alarm.createdAt = new Date().toISOString();
      list.push(alarm);
    }
    this.set(this.KEYS.ALARMS, list);
    return alarm;
  },
  deleteAlarm(id) {
    let list = this.getAlarms();
    list = list.filter(a => a.id !== id);
    this.set(this.KEYS.ALARMS, list);
  },

  // Configurações
  getSettings() {
    return { ...this.getDefaultSettings(), ...this.get(this.KEYS.SETTINGS, {}) };
  },
  saveSettings(s) {
    return this.set(this.KEYS.SETTINGS, s);
  },

  // Notificações / Histórico
  getNotifications() { return this.get(this.KEYS.NOTIFS, []); },
  addNotification(n) {
    const list = this.getNotifications();
    n.id = n.id || 'not_' + Date.now();
    n.timestamp = new Date().toISOString();
    list.unshift(n);
    if (list.length > 100) list.pop();
    this.set(this.KEYS.NOTIFS, list);
  },

  // Exportar Backup
  exportAll() {
    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      events: this.getEvents(),
      tasks: this.getTasks(),
      alarms: this.getAlarms(),
      settings: this.getSettings()
    }, null, 2);
  },

  // Importar Backup
  importAll(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.events && !data.tasks && !data.alarms) {
        throw new Error('Formato de arquivo incompatível.');
      }
      if (Array.isArray(data.events)) this.set(this.KEYS.EVENTS, data.events);
      if (Array.isArray(data.tasks)) this.set(this.KEYS.TASKS, data.tasks);
      if (Array.isArray(data.alarms)) this.set(this.KEYS.ALARMS, data.alarms);
      if (data.settings) this.saveSettings(data.settings);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  clearAll() {
    localStorage.removeItem(this.KEYS.EVENTS);
    localStorage.removeItem(this.KEYS.TASKS);
    localStorage.removeItem(this.KEYS.ALARMS);
    localStorage.removeItem(this.KEYS.NOTIFS);
  }
};

window.StorageDB = StorageDB;