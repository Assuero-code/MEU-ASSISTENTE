// app.js - Orquestrador Central da Aplicação com Edição, Visualização e Agenda
document.addEventListener('DOMContentLoaded', () => {
  let currentDate = new Date();
  let currentMonth = currentDate.getMonth();
  let currentYear = currentDate.getFullYear();
  let speechRec = null;

  // Registro PWA / Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(err => {
      console.warn('Falha ao registrar Service Worker:', err);
    });
  }

  // Elementos do DOM
  const views = document.querySelectorAll('.view-section');
  const navItems = document.querySelectorAll('.nav-item');
  const topbarTitle = document.getElementById('topbar-title');
  const chatHistory = document.getElementById('chat-history');
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send');
  const btnMic = document.getElementById('btn-mic');
  const pushBadge = document.getElementById('push-status-badge');

  // Modais
  const modalForm = document.getElementById('modal-form');
  const modalFields = document.getElementById('modal-fields');
  const modalTitle = document.getElementById('modal-title');
  let currentModalAction = null;
  let editingId = null;

  const modalDetail = document.getElementById('modal-detail');
  const detailTitle = document.getElementById('detail-title');
  const detailStatus = document.getElementById('detail-status');
  const detailBody = document.getElementById('detail-body');
  const btnDetailClose = document.getElementById('btn-detail-close');
  const btnDetailEdit = document.getElementById('btn-detail-edit');
  const btnDetailDelete = document.getElementById('btn-detail-delete');
  let selectedEvent = null;

  function updateNotifBadge() {
    if (!('Notification' in window)) {
      pushBadge.textContent = 'Notificações não suportadas';
      return;
    }
    if (Notification.permission === 'granted') {
      pushBadge.textContent = 'Notificações Ativas';
      pushBadge.style.color = 'var(--success)';
    } else if (Notification.permission === 'denied') {
      pushBadge.textContent = 'Notificações Bloqueadas';
      pushBadge.style.color = 'var(--danger)';
    } else {
      pushBadge.textContent = 'Notificação Pendente';
      pushBadge.style.color = 'var(--warning)';
    }
  }
  updateNotifBadge();

  // Navegação
  function switchView(target) {
    views.forEach(v => v.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));

    const activeView = document.getElementById(`view-${target}`);
    const activeNav = document.querySelector(`.nav-item[data-view="${target}"]`);

    if (activeView) activeView.classList.add('active');
    if (activeNav) activeNav.classList.add('active');

    const titles = {
      'chat': 'Conversa com Assistente',
      'meu-dia': 'Visão Geral — Meu Dia',
      'agenda': 'Minha Agenda de Compromissos',
      'calendario': 'Calendário de Compromissos',
      'tarefas': 'Gestão de Tarefas',
      'alarmes': 'Alarmes Ativos',
      'config': 'Ajustes do Aplicativo'
    };
    topbarTitle.textContent = titles[target] || 'Meu Assistente';

    if (target === 'calendario') renderCalendar();
    if (target === 'meu-dia') renderMeuDia();
    if (target === 'agenda') renderAgenda();
    if (target === 'tarefas') renderTasks();
    if (target === 'alarmes') renderAlarms();
  }

  navItems.forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // --- RECONHECIMENTO E SÍNTESE DE VOZ ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    speechRec = new SpeechRecognition();
    speechRec.lang = 'pt-BR';
    speechRec.continuous = false;
    speechRec.interimResults = false;

    speechRec.onstart = () => btnMic.classList.add('recording-pulse');
    speechRec.onend = () => btnMic.classList.remove('recording-pulse');
    speechRec.onerror = () => btnMic.classList.remove('recording-pulse');
    speechRec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      chatInput.value = transcript;
      handleSendMessage();
    };

    btnMic.addEventListener('click', () => {
      try { speechRec.start(); } catch { speechRec.stop(); }
    });
  } else {
    btnMic.style.display = 'none';
  }

  function speak(text) {
    const cfg = StorageDB.getSettings();
    if (!cfg.voiceFeedback || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'pt-BR';
    utter.rate = cfg.speechRate || 1.0;
    window.speechSynthesis.speak(utter);
  }

  // --- ÁREA DE CHAT ---
  function appendMessage(sender, text) {
    const msg = document.createElement('div');
    msg.className = `msg msg-${sender}`;
    msg.textContent = text;
    chatHistory.appendChild(msg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    appendMessage('user', text);
    chatInput.value = '';

    const events = StorageDB.getEvents();
    const tasks = StorageDB.getTasks();
    const action = NLPParser.interpret(text, events, tasks);

    switch (action.intent) {
      case 'CREATE_EVENT': {
        if (action.isPast) {
          appendMessage('assistant', `Atenção: A data informada (${action.startDate.toLocaleDateString('pt-BR')}) já passou. Deseja agendar mesmo assim? Verifique no calendário.`);
        }
        if (action.conflict) {
          appendMessage('assistant', `Aviso de Conflito: Você já tem o compromisso "${action.conflict.title}" marcado nesse período!`);
        }

        const newEvt = StorageDB.saveEvent({
          title: action.title,
          start: action.startDate.toISOString(),
          end: action.endDate.toISOString(),
          category: 'geral',
          reminderMinutes: action.reminderMinutes,
          description: `Criado via comando: "${action.raw}"`,
          status: 'confirmed'
        });

        AudioEngine.beepSuccess();
        const resp = `Agendado: "${newEvt.title}" para ${new Date(newEvt.start).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} com lembrete ${action.reminderMinutes} min antes.`;
        appendMessage('assistant', resp);
        speak(resp);
        break;
      }

      case 'CREATE_TASK': {
        const newTask = StorageDB.saveTask({
          title: action.title,
          status: 'pending',
          priority: 'media'
        });
        AudioEngine.beepSuccess();
        const resp = `Tarefa anotada: "${newTask.title}".`;
        appendMessage('assistant', resp);
        speak(resp);
        break;
      }

      case 'CREATE_ALARM': {
        StorageDB.saveAlarm({
          title: action.title,
          time: action.time,
          active: true,
          days: [0, 1, 2, 3, 4, 5, 6]
        });
        AudioEngine.beepSuccess();
        const resp = `Alarme configurado para às ${action.time} (${action.title}).`;
        appendMessage('assistant', resp);
        speak(resp);
        break;
      }

      case 'QUERY_AGENDA': {
        const matches = events.filter(e => e.start.startsWith(action.targetDate) && e.status !== 'cancelled');
        let resp = '';
        if (matches.length === 0) {
          resp = action.isTomorrow ? 'Você não tem compromissos amanhã.' : 'Não há compromissos para esta data.';
        } else {
          resp = `Você tem ${matches.length} compromisso(s): ` + matches.map(m => `${m.title} às ${new Date(m.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`).join(', ');
        }
        appendMessage('assistant', resp);
        speak(resp);
        break;
      }

      case 'QUERY_TASKS': {
        const pend = tasks.filter(t => t.status === 'pending');
        const resp = pend.length ? `Você tem ${pend.length} tarefa(s) pendente(s): ` + pend.map(t => t.title).join(', ') : 'Parabéns, você não tem tarefas pendentes!';
        appendMessage('assistant', resp);
        speak(resp);
        break;
      }

      case 'CANCEL_EVENT': {
        const q = action.query.toLowerCase();
        const ev = events.find(e => e.title.toLowerCase().includes(q) && e.status !== 'cancelled');
        if (ev) {
          ev.status = 'cancelled';
          StorageDB.saveEvent(ev);
          const resp = `O compromisso "${ev.title}" foi cancelado com sucesso.`;
          appendMessage('assistant', resp);
          speak(resp);
        } else {
          appendMessage('assistant', `Não encontrei nenhum compromisso ativo correspondente a "${action.query}".`);
        }
        break;
      }

      default: {
        const resp = `Entendido. Registrei sua solicitação. Você pode me pedir para marcar compromissos, ver sua agenda ou criar tarefas.`;
        appendMessage('assistant', resp);
        speak(resp);
        break;
      }
    }
  }

  btnSend.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });

  // --- MODAL DE DETALHES DO EVENTO (VISUALIZAR / EDITAR / EXCLUIR) ---
  function openEventDetails(evtId) {
    const events = StorageDB.getEvents();
    selectedEvent = events.find(e => e.id === evtId);
    if (!selectedEvent) return;

    detailTitle.textContent = selectedEvent.title;
    detailStatus.textContent = selectedEvent.status === 'cancelled' ? 'Cancelado' : 'Confirmado';
    detailStatus.style.background = selectedEvent.status === 'cancelled' ? 'var(--danger)' : 'var(--accent)';
    detailStatus.style.color = '#fff';

    const startDate = new Date(selectedEvent.start);
    const endDate = new Date(selectedEvent.end);

    detailBody.innerHTML = `
      <div><strong>📅 Data:</strong> ${startDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
      <div><strong>🕒 Horário:</strong> ${startDate.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} até ${endDate.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
      <div><strong>🔔 Lembrete:</strong> ${selectedEvent.reminderMinutes !== undefined ? selectedEvent.reminderMinutes + ' min antes' : 'Sem lembrete'}</div>
      <div><strong>📝 Descrição / Contexto:</strong> ${selectedEvent.description || 'Nenhuma observação informada.'}</div>
      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">Cadastrado em: ${selectedEvent.createdAt ? new Date(selectedEvent.createdAt).toLocaleString('pt-BR') : 'Data não registrada'}</div>
    `;

    modalDetail.classList.add('show');
  }

  btnDetailClose.addEventListener('click', () => modalDetail.classList.remove('show'));

  btnDetailDelete.addEventListener('click', () => {
    if (!selectedEvent) return;
    if (confirm(`Deseja realmente excluir ou cancelar o compromisso "${selectedEvent.title}"?`)) {
      StorageDB.deleteEvent(selectedEvent.id);
      modalDetail.classList.remove('show');
      renderCalendar();
      renderMeuDia();
      renderAgenda();
    }
  });

  btnDetailEdit.addEventListener('click', () => {
    if (!selectedEvent) return;
    modalDetail.classList.remove('show');
    openEventModal(selectedEvent);
  });

  // --- CALENDÁRIO ---
  function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    document.getElementById('cal-month-year').textContent = `${monthNames[currentMonth]} ${currentYear}`;

    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    days.forEach(d => {
      const header = document.createElement('div');
      header.className = 'cal-header';
      header.textContent = d;
      grid.appendChild(header);
    });

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const events = StorageDB.getEvents();

    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell inactive';
      grid.appendChild(cell);
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      const thisDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (thisDateStr === todayStr) cell.classList.add('today');

      const num = document.createElement('div');
      num.className = 'cal-date-number';
      num.textContent = day;
      cell.appendChild(num);

      // Eventos do dia
      const dayEvts = events.filter(e => e.start.startsWith(thisDateStr));
      dayEvts.forEach(evt => {
        const pill = document.createElement('div');
        pill.className = 'event-pill';
        if (evt.status === 'cancelled') pill.style.opacity = '0.5';
        pill.textContent = `${new Date(evt.start).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} ${evt.title}`;
        pill.addEventListener('click', (e) => {
          e.stopPropagation(); // Evita acionar o clique da célula
          openEventDetails(evt.id);
        });
        cell.appendChild(pill);
      });

      cell.addEventListener('click', () => openEventModal(null, thisDateStr));
      grid.appendChild(cell);
    }
  }

  document.getElementById('cal-prev').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });
  document.getElementById('cal-today').addEventListener('click', () => {
    currentDate = new Date();
    currentMonth = currentDate.getMonth();
    currentYear = currentDate.getFullYear();
    renderCalendar();
  });

  // --- SEÇÃO AGENDA COMPLETA ---
  function renderAgenda() {
    const list = document.getElementById('agenda-list');
    const searchVal = document.getElementById('agenda-search').value.toLowerCase();
    const filterStatus = document.getElementById('agenda-filter-status').value;
    
    let events = StorageDB.getEvents();
    events.sort((a, b) => new Date(a.start) - new Date(b.start));

    if (filterStatus !== 'all') {
      events = events.filter(e => e.status === filterStatus);
    }
    if (searchVal) {
      events = events.filter(e => (e.title && e.title.toLowerCase().includes(searchVal)) || (e.description && e.description.toLowerCase().includes(searchVal)));
    }

    list.innerHTML = events.length ? '' : '<p style="color:var(--text-muted); grid-column: 1/-1;">Nenhum compromisso encontrado.</p>';

    events.forEach(evt => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cursor = 'pointer';
      const st = new Date(evt.start);
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <strong>${evt.title}</strong>
          <span style="font-size:0.75rem; padding:2px 6px; border-radius:4px; background:${evt.status === 'cancelled' ? 'var(--danger)' : 'var(--bg-tertiary)'}; color:#fff;">
            ${evt.status === 'cancelled' ? 'Cancelado' : 'Confirmado'}
          </span>
        </div>
        <p style="color:var(--text-muted); font-size:0.85rem; margin:0.5rem 0;">
          📅 ${st.toLocaleDateString('pt-BR')} às ${st.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
        </p>
        <p style="font-size:0.8rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${evt.description || 'Sem descrição.'}
        </p>
      `;
      card.addEventListener('click', () => openEventDetails(evt.id));
      list.appendChild(card);
    });
  }

  document.getElementById('agenda-search').addEventListener('input', renderAgenda);
  document.getElementById('agenda-filter-status').addEventListener('change', renderAgenda);
  document.getElementById('btn-agenda-novo-evento').addEventListener('click', () => openEventModal());

  // --- SEÇÃO MEU DIA ---
  function renderMeuDia() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('meu-dia-data').textContent = now.toLocaleDateString('pt-BR', options);

    const hour = now.getHours();
    const saudacao = hour < 12 ? 'Bom dia!' : hour < 18 ? 'Boa tarde!' : 'Boa noite!';
    document.getElementById('meu-dia-saudacao').textContent = saudacao;

    const events = StorageDB.getEvents().filter(e => e.start.startsWith(todayStr) && e.status !== 'cancelled');
    const tasks = StorageDB.getTasks().filter(t => t.status === 'pending');

    let resumo = '';
    if (events.length === 0 && tasks.length === 0) {
      resumo = 'Sua agenda está livre e você não possui tarefas pendentes para hoje.';
    } else {
      resumo = `Hoje você tem ${events.length} compromisso(s) agendado(s) e ${tasks.length} tarefa(s) prioritária(s) a realizar.`;
    }
    document.getElementById('meu-dia-resumo').textContent = resumo;

    const evCont = document.getElementById('meu-dia-eventos');
    evCont.innerHTML = events.length ? '' : '<p style="color:var(--text-muted)">Nenhum evento hoje.</p>';
    events.forEach(e => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <strong>${e.title}</strong>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">
          🕒 ${new Date(e.start).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} - ${new Date(e.end).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
        </p>
      `;
      card.addEventListener('click', () => openEventDetails(e.id));
      evCont.appendChild(card);
    });

    const tCont = document.getElementById('meu-dia-tarefas');
    tCont.innerHTML = tasks.length ? '' : '<p style="color:var(--text-muted)">Nenhuma tarefa pendente.</p>';
    tasks.forEach(t => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <strong>${t.title}</strong>
        <p style="color:var(--text-muted); font-size:0.85rem;">Prioridade: ${t.priority || 'Normal'}</p>
        <button class="btn btn-secondary" style="margin-top:8px; font-size:0.75rem;" onclick="completeTask('${t.id}')">Concluir</button>
      `;
      tCont.appendChild(card);
    });
  }

  window.completeTask = (id) => {
    const tasks = StorageDB.getTasks();
    const t = tasks.find(x => x.id === id);
    if (t) {
      t.status = 'completed';
      StorageDB.saveTask(t);
      renderMeuDia();
      renderTasks();
    }
  };

  // --- TAREFAS ---
  function renderTasks() {
    const list = document.getElementById('tasks-list');
    const tasks = StorageDB.getTasks();
    list.innerHTML = tasks.length ? '' : '<p style="color:var(--text-muted)">Nenhuma tarefa cadastrada.</p>';

    tasks.forEach(t => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <h4 style="text-decoration: ${t.status === 'completed' ? 'line-through' : 'none'}">${t.title}</h4>
          <span style="font-size:0.75rem; padding:2px 6px; border-radius:4px; background:var(--bg-tertiary);">${t.status}</span>
        </div>
        <div style="margin-top:1rem; display:flex; gap:0.5rem;">
          ${t.status === 'pending' ? `<button class="btn btn-secondary" style="font-size:0.8rem;" onclick="completeTask('${t.id}')">Concluir</button>` : ''}
          <button class="btn btn-danger" style="font-size:0.8rem;" onclick="removeTask('${t.id}')">Excluir</button>
        </div>
      `;
      list.appendChild(card);
    });
  }

  window.removeTask = (id) => {
    StorageDB.deleteTask(id);
    renderTasks();
  };

  // --- ALARMES ---
  function renderAlarms() {
    const list = document.getElementById('alarms-list');
    const alarms = StorageDB.getAlarms();
    list.innerHTML = alarms.length ? '' : '<p style="color:var(--text-muted)">Nenhum alarme configurado.</p>';

    alarms.forEach(a => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="font-size:1.8rem; font-weight:700;">${a.time}</h2>
          <label class="switch">
            <input type="checkbox" ${a.active ? 'checked' : ''} onchange="toggleAlarm('${a.id}')">
            <span>${a.active ? 'Ativo' : 'Desativado'}</span>
          </label>
        </div>
        <p style="color:var(--text-muted); margin-top:0.25rem;">${a.title}</p>
        <div style="margin-top:1rem; display:flex; gap:0.5rem;">
          <button class="btn btn-secondary" style="font-size:0.8rem;" onclick="testAlarmSound()">Testar Som</button>
          <button class="btn btn-danger" style="font-size:0.8rem;" onclick="removeAlarm('${a.id}')">Excluir</button>
        </div>
      `;
      list.appendChild(card);
    });
  }

  window.toggleAlarm = (id) => {
    const alarms = StorageDB.getAlarms();
    const a = alarms.find(x => x.id === id);
    if (a) {
      a.active = !a.active;
      StorageDB.saveAlarm(a);
      renderAlarms();
    }
  };

  window.removeAlarm = (id) => {
    StorageDB.deleteAlarm(id);
    renderAlarms();
  };

  window.testAlarmSound = () => {
    AudioEngine.startAlarmSound();
    setTimeout(() => AudioEngine.stopAlarmSound(), 3000);
  };

  // --- LOOP DE 1 SEG: DISPARO DE ALERTAS ---
  let triggeredAlertsToday = new Set();

  setInterval(() => {
    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const currentDayOfWeek = now.getDay();

    const alarms = StorageDB.getAlarms();
    alarms.forEach(a => {
      if (a.active && a.time === currentTimeStr && (!a.days || a.days.includes(currentDayOfWeek))) {
        const key = `alarm_${a.id}_${now.toDateString()}_${currentTimeStr}`;
        if (!triggeredAlertsToday.has(key)) {
          triggeredAlertsToday.add(key);
          triggerAlarmRinging(a);
        }
      }
    });

    const events = StorageDB.getEvents();
    events.forEach(e => {
      if (e.status === 'confirmed' && e.reminderMinutes !== undefined) {
        const startMs = new Date(e.start).getTime();
        const remindMs = startMs - (e.reminderMinutes * 60 * 1000);
        const diffSecs = Math.floor((now.getTime() - remindMs) / 1000);

        if (diffSecs >= 0 && diffSecs < 60) {
          const key = `event_remind_${e.id}_${e.reminderMinutes}`;
          if (!triggeredAlertsToday.has(key)) {
            triggeredAlertsToday.add(key);
            triggerEventNotification(e);
          }
        }
      }
    });
  }, 1000);

  function triggerAlarmRinging(alarm) {
    AudioEngine.startAlarmSound();
    document.getElementById('ringing-title').textContent = `Alarme: ${alarm.time}`;
    document.getElementById('ringing-desc').textContent = alarm.title;
    document.getElementById('modal-ringing').classList.add('show');

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`ALARME: ${alarm.title}`, {
        body: `Horário programado: ${alarm.time}`,
        icon: 'manifest.json'
      });
    }
  }

  function triggerEventNotification(evt) {
    AudioEngine.beepAlert();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Lembrete: ${evt.title}`, {
        body: `Começa em ${evt.reminderMinutes} minutos (${new Date(evt.start).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})})`,
        icon: 'manifest.json'
      });
    }
  }

  document.getElementById('btn-dismiss-alarm').addEventListener('click', () => {
    AudioEngine.stopAlarmSound();
    document.getElementById('modal-ringing').classList.remove('show');
  });

  document.getElementById('btn-snooze').addEventListener('click', () => {
    AudioEngine.stopAlarmSound();
    document.getElementById('modal-ringing').classList.remove('show');
    const snoozeDate = new Date(Date.now() + 5 * 60 * 1000);
    const sTime = snoozeDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    StorageDB.saveAlarm({
      title: 'Soneca de Alarme',
      time: sTime,
      active: true,
      days: [snoozeDate.getDay()]
    });
    renderAlarms();
  });

  // --- MODAL DE CRIAÇÃO E EDIÇÃO DE EVENTO ---
  function openEventModal(eventToEdit = null, prefilledDate = null) {
    currentModalAction = 'SAVE_EVENT';
    editingId = eventToEdit ? eventToEdit.id : null;
    modalTitle.textContent = eventToEdit ? 'Editar Compromisso' : 'Novo Compromisso';

    let dVal = prefilledDate || new Date().toISOString().slice(0, 10);
    let sTime = '10:00';
    let eTime = '11:00';
    let titleVal = '';
    let descVal = '';
    let remindVal = '15';
    let statusVal = 'confirmed';

    if (eventToEdit) {
      dVal = eventToEdit.start.slice(0, 10);
      sTime = new Date(eventToEdit.start).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      eTime = new Date(eventToEdit.end).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      titleVal = eventToEdit.title || '';
      descVal = eventToEdit.description || '';
      remindVal = String(eventToEdit.reminderMinutes !== undefined ? eventToEdit.reminderMinutes : '15');
      statusVal = eventToEdit.status || 'confirmed';
    }

    modalFields.innerHTML = `
      <div class="form-group">
        <label>Título:</label>
        <input type="text" id="form-evt-title" required value="${titleVal}" placeholder="Ex: Consulta com Dentista">
      </div>
      <div class="form-group">
        <label>Data:</label>
        <input type="date" id="form-evt-date" value="${dVal}" required>
      </div>
      <div class="form-group" style="display:flex; gap:0.5rem; flex-direction:row;">
        <div style="flex:1;">
          <label>Início:</label>
          <input type="time" id="form-evt-start" value="${sTime}" required>
        </div>
        <div style="flex:1;">
          <label>Fim:</label>
          <input type="time" id="form-evt-end" value="${eTime}" required>
        </div>
      </div>
      <div class="form-group">
        <label>Avisar com antecedência:</label>
        <select id="form-evt-remind">
          <option value="0" ${remindVal === '0' ? 'selected' : ''}>No horário</option>
          <option value="5" ${remindVal === '5' ? 'selected' : ''}>5 minutos antes</option>
          <option value="15" ${remindVal === '15' ? 'selected' : ''}>15 minutos antes</option>
          <option value="30" ${remindVal === '30' ? 'selected' : ''}>30 minutos antes</option>
          <option value="60" ${remindVal === '60' ? 'selected' : ''}>1 hora antes</option>
        </select>
      </div>
      <div class="form-group">
        <label>Situação / Status:</label>
        <select id="form-evt-status">
          <option value="confirmed" ${statusVal === 'confirmed' ? 'selected' : ''}>Confirmado / Ativo</option>
          <option value="cancelled" ${statusVal === 'cancelled' ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>
      <div class="form-group">
        <label>Descrição / Observações:</label>
        <textarea id="form-evt-desc" rows="3" placeholder="Informações detalhadas...">${descVal}</textarea>
      </div>
    `;
    modalForm.classList.add('show');
  }

  document.getElementById('btn-novo-evento').addEventListener('click', () => openEventModal());

  document.getElementById('btn-nova-tarefa').addEventListener('click', () => {
    modalTitle.textContent = 'Nova Tarefa';
    currentModalAction = 'SAVE_TASK';
    editingId = null;
    modalFields.innerHTML = `
      <div class="form-group">
        <label>Título:</label>
        <input type="text" id="form-task-title" required placeholder="Ex: Pagar fatura de energia">
      </div>
      <div class="form-group">
        <label>Prioridade:</label>
        <select id="form-task-prio">
          <option value="baixa">Baixa</option>
          <option value="media" selected>Média</option>
          <option value="alta">Alta</option>
        </select>
      </div>
    `;
    modalForm.classList.add('show');
  });

  document.getElementById('btn-novo-alarme').addEventListener('click', () => {
    modalTitle.textContent = 'Novo Alarme';
    currentModalAction = 'SAVE_ALARM';
    editingId = null;
    modalFields.innerHTML = `
      <div class="form-group">
        <label>Horário:</label>
        <input type="time" id="form-alm-time" value="07:00" required>
      </div>
      <div class="form-group">
        <label>Etiqueta / Nome:</label>
        <input type="text" id="form-alm-title" placeholder="Ex: Acordar cedo" required>
      </div>
    `;
    modalForm.classList.add('show');
  });

  document.getElementById('modal-btn-cancel').addEventListener('click', () => {
    modalForm.classList.remove('show');
  });

  document.getElementById('app-dynamic-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (currentModalAction === 'SAVE_EVENT') {
      const title = document.getElementById('form-evt-title').value;
      const date = document.getElementById('form-evt-date').value;
      const startT = document.getElementById('form-evt-start').value;
      const endT = document.getElementById('form-evt-end').value;
      const remind = parseInt(document.getElementById('form-evt-remind').value, 10);
      const status = document.getElementById('form-evt-status').value;
      const description = document.getElementById('form-evt-desc').value;

      StorageDB.saveEvent({
        id: editingId || undefined,
        title,
        start: `${date}T${startT}:00`,
        end: `${date}T${endT}:00`,
        reminderMinutes: remind,
        status,
        description
      });
      renderCalendar();
      renderAgenda();
      renderMeuDia();
    } else if (currentModalAction === 'SAVE_TASK') {
      const title = document.getElementById('form-task-title').value;
      const priority = document.getElementById('form-task-prio').value;
      StorageDB.saveTask({ title, priority, status: 'pending' });
      renderTasks();
    } else if (currentModalAction === 'SAVE_ALARM') {
      const time = document.getElementById('form-alm-time').value;
      const title = document.getElementById('form-alm-title').value;
      StorageDB.saveAlarm({ time, title, active: true, days: [0,1,2,3,4,5,6] });
      renderAlarms();
    }
    modalForm.classList.remove('show');
  });

  // --- CONFIGURAÇÕES & BACKUP ---
  document.getElementById('btn-request-perm').addEventListener('click', () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(() => updateNotifBadge());
    } else {
      alert('Este navegador não suporta notificações de sistema.');
    }
  });

  document.getElementById('btn-export-data').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(StorageDB.exportAll());
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `meu_assistente_backup_${new Date().toISOString().slice(0,10)}.json`);
    dlAnchor.click();
  });

  const fileImporter = document.getElementById('file-importer');
  document.getElementById('btn-import-trigger').addEventListener('click', () => fileImporter.click());
  fileImporter.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const res = StorageDB.importAll(evt.target.result);
      if (res.success) {
        alert('Dados importados com êxito!');
        location.reload();
      } else {
        alert('Erro ao importar arquivo: ' + res.error);
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-wipe-data').addEventListener('click', () => {
    if (confirm('Tem certeza de que deseja apagar todos os eventos, tarefas e alarmes? Essa ação não pode ser desfeita.')) {
      StorageDB.clearAll();
      location.reload();
    }
  });

  // Alternar Tema
  document.getElementById('btn-toggle-theme').addEventListener('click', () => {
    const curTheme = document.documentElement.getAttribute('data-theme');
    const target = curTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    const cfg = StorageDB.getSettings();
    cfg.theme = target;
    StorageDB.saveSettings(cfg);
  });

  const initCfg = StorageDB.getSettings();
  if (initCfg.theme) document.documentElement.setAttribute('data-theme', initCfg.theme);
  document.getElementById('cfg-voice-feedback').checked = !!initCfg.voiceFeedback;
  document.getElementById('cfg-voice-feedback').addEventListener('change', (e) => {
    const c = StorageDB.getSettings();
    c.voiceFeedback = e.target.checked;
    StorageDB.saveSettings(c);
  });
});