// app.js - Orquestrador Central com Compatibilidade Mobile e Notificações Blindadas
document.addEventListener('DOMContentLoaded', () => {
  let currentDate = new Date();
  let currentMonth = currentDate.getMonth();
  let currentYear = currentDate.getFullYear();
  let speechRec = null;

  // Registro PWA / Service Worker com tratamento de erro
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(err => {
      console.warn('Service Worker não carregado:', err);
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

  // Formatação segura de data sem desvio UTC ("YYYY-MM-DD")
  function formatLocalDate(year, monthIndex, day) {
    const y = year;
    const m = String(monthIndex + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Atualização Visual do Status de Notificações
  function updateNotifBadge() {
    if (!('Notification' in window)) {
      if (pushBadge) {
        pushBadge.textContent = 'Sem suporte a alertas';
        pushBadge.style.color = 'var(--text-muted)';
      }
      return;
    }

    if (Notification.permission === 'granted') {
      if (pushBadge) {
        pushBadge.textContent = 'Notificações Ativas';
        pushBadge.style.color = 'var(--success)';
      }
    } else if (Notification.permission === 'denied') {
      if (pushBadge) {
        pushBadge.textContent = 'Notificações Bloqueadas';
        pushBadge.style.color = 'var(--danger)';
      }
    } else {
      if (pushBadge) {
        pushBadge.textContent = 'Ativar Notificações';
        pushBadge.style.color = 'var(--warning)';
      }
    }
  }
  updateNotifBadge();

  // NAVEGAÇÃO ENTRE TELAS (Compatível com Click e Touch sem atraso)
  function switchView(target) {
    if (!target) return;

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
    if (topbarTitle) {
      topbarTitle.textContent = titles[target] || 'Meu Assistente';
    }

    if (target === 'calendario') renderCalendar();
    if (target === 'meu-dia') renderMeuDia();
    if (target === 'agenda') renderAgenda();
    if (target === 'tarefas') renderTasks();
    if (target === 'alarmes') renderAlarms();
    if (target === 'config') loadSettingsFields();
  }

  navItems.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-view');
      switchView(target);
    });
  });

  // --- SOLICITAÇÃO UNIVERSAL DE PERMISSÃO DE NOTIFICAÇÃO ---
  async function requestNotificationPermissionUniversal() {
    if (!('Notification' in window)) {
      alert('Seu navegador não oferece suporte nativo a notificações de sistema.');
      return;
    }

    if (Notification.permission === 'granted') {
      alert('As notificações já estão autorizadas e ativas!');
      updateNotifBadge();
      return;
    }

    if (Notification.permission === 'denied') {
      alert('As notificações foram bloqueadas nas permissões do seu navegador. Para reativar, clique no cadeado ao lado do endereço do site (URL) e marque "Notificações" como "Permitir".');
      updateNotifBadge();
      return;
    }

    try {
      // Método moderno com Promise + fallback clássico para Safari e WebView móvel
      let permissionResult;
      const promise = Notification.requestPermission((p) => {
        permissionResult = p;
        updateNotifBadge();
      });

      if (promise && typeof promise.then === 'function') {
        permissionResult = await promise;
      }

      updateNotifBadge();

      if (permissionResult === 'granted') {
        AudioEngine.beepSuccess();
        new Notification('Meu Assistente Ativado', {
          body: 'Notificações habilitadas com sucesso!',
          icon: 'manifest.json'
        });
      } else {
        alert('Permissão de notificação não concedida.');
      }
    } catch (err) {
      console.error('Erro ao pedir permissão:', err);
      alert('Não foi possível solicitar permissão. Certifique-se de estar usando HTTPS.');
    }
  }

  // Botão na Topbar (se clicável) e na tela de Ajustes
  if (pushBadge) {
    pushBadge.style.cursor = 'pointer';
    pushBadge.addEventListener('click', requestNotificationPermissionUniversal);
  }

  const btnReqPerm = document.getElementById('btn-request-perm');
  if (btnReqPerm) {
    btnReqPerm.addEventListener('click', requestNotificationPermissionUniversal);
  }

  const btnTestNotif = document.getElementById('btn-test-notif');
  if (btnTestNotif) {
    btnTestNotif.addEventListener('click', () => {
      if (!('Notification' in window)) {
        alert('Notificações não suportadas neste navegador.');
        return;
      }
      if (Notification.permission === 'granted') {
        AudioEngine.beepSuccess();
        new Notification('Teste do Meu Assistente', {
          body: 'As notificações estão operando perfeitamente!',
          icon: 'manifest.json'
        });
      } else {
        requestNotificationPermissionUniversal();
      }
    });
  }

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
    if (btnMic) btnMic.style.display = 'none';
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

  // --- CHAT COM IA & HISTÓRICO ---
  let aiConversationHistory = [];

  function appendMessage(sender, text) {
    const msg = document.createElement('div');
    msg.className = `msg msg-${sender}`;
    msg.textContent = text;
    chatHistory.appendChild(msg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    appendMessage('user', text);
    chatInput.value = '';

    const events = StorageDB.getEvents();
    const tasks = StorageDB.getTasks();

    // Interpreta comandos nativos do sistema primeiro
    const action = NLPParser.interpretLocal(text, events);

    if (action) {
      switch (action.intent) {
        case 'CREATE_EVENT': {
          if (action.isPast) {
            appendMessage('assistant', `Atenção: A data (${action.startDate.toLocaleDateString('pt-BR')}) já passou. Compromisso agendado para consulta no calendário.`);
          }
          if (action.conflict) {
            appendMessage('assistant', `Aviso de Conflito: Você já tem o compromisso "${action.conflict.title}" marcado nesse período!`);
          }

          const dateStr = formatLocalDate(action.startDate.getFullYear(), action.startDate.getMonth(), action.startDate.getDate());
          const startH = String(action.startDate.getHours()).padStart(2, '0') + ':' + String(action.startDate.getMinutes()).padStart(2, '0');
          const endH = String(action.endDate.getHours()).padStart(2, '0') + ':' + String(action.endDate.getMinutes()).padStart(2, '0');

          const newEvt = StorageDB.saveEvent({
            title: action.title,
            start: `${dateStr}T${startH}:00`,
            end: `${dateStr}T${endH}:00`,
            category: 'geral',
            reminderMinutes: action.reminderMinutes,
            description: `Criado via comando: "${action.raw}"`,
            status: 'confirmed'
          });

          AudioEngine.beepSuccess();
          const resp = `Agendado: "${newEvt.title}" para ${action.startDate.toLocaleDateString('pt-BR')} às ${startH} (Lembrete: ${action.reminderMinutes} min antes).`;
          appendMessage('assistant', resp);
          speak(resp);
          return;
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
          return;
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
          return;
        }

        case 'QUERY_AGENDA': {
          const matches = events.filter(e => e.start.startsWith(action.targetDate) && e.status !== 'cancelled');
          let resp = '';
          if (matches.length === 0) {
            resp = action.isTomorrow ? 'Você não tem compromissos amanhã.' : 'Não há compromissos para esta data.';
          } else {
            resp = `Você tem ${matches.length} compromisso(s): ` + matches.map(m => `${m.title} às ${m.start.slice(11, 16)}`).join(', ');
          }
          appendMessage('assistant', resp);
          speak(resp);
          return;
        }

        case 'QUERY_TASKS': {
          const pend = tasks.filter(t => t.status === 'pending');
          const resp = pend.length ? `Você tem ${pend.length} tarefa(s) pendente(s): ` + pend.map(t => t.title).join(', ') : 'Parabéns, você não tem tarefas pendentes!';
          appendMessage('assistant', resp);
          speak(resp);
          return;
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
            appendMessage('assistant', `Não encontrei compromisso ativo para "${action.query}".`);
          }
          return;
        }
      }
    }

    // Se não for comando de sistema, responde via IA
    appendMessage('assistant', 'Pensando...');
    const thinkingMsg = chatHistory.lastElementChild;

    aiConversationHistory.push({ role: 'user', content: text });
    const aiResult = await NLPParser.askAI(text, aiConversationHistory);

    if (thinkingMsg) thinkingMsg.remove();

    appendMessage('assistant', aiResult.message);
    if (aiResult.success) {
      aiConversationHistory.push({ role: 'assistant', content: aiResult.message });
      speak(aiResult.message);
    }
  }

  btnSend.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });

  // --- DETALHES DO EVENTO ---
  function openEventDetails(evtId) {
    const events = StorageDB.getEvents();
    selectedEvent = events.find(e => e.id === evtId);
    if (!selectedEvent) return;

    detailTitle.textContent = selectedEvent.title;
    detailStatus.textContent = selectedEvent.status === 'cancelled' ? 'Cancelado' : 'Confirmado';
    detailStatus.style.background = selectedEvent.status === 'cancelled' ? 'var(--danger)' : 'var(--accent)';
    detailStatus.style.color = '#fff';

    const datePart = selectedEvent.start.slice(0, 10);
    const timeStart = selectedEvent.start.slice(11, 16);
    const timeEnd = selectedEvent.end ? selectedEvent.end.slice(11, 16) : timeStart;

    detailBody.innerHTML = `
      <div><strong>📅 Data:</strong> ${datePart.split('-').reverse().join('/')}</div>
      <div><strong>🕒 Horário:</strong> ${timeStart} até ${timeEnd}</div>
      <div><strong>🔔 Lembrete:</strong> ${selectedEvent.reminderMinutes !== undefined ? selectedEvent.reminderMinutes + ' minutos antes' : 'No horário'}</div>
      <div><strong>📝 Observações:</strong> ${selectedEvent.description || 'Nenhuma anotação adicional.'}</div>
    `;

    modalDetail.classList.add('show');
  }

  btnDetailClose.addEventListener('click', () => modalDetail.classList.remove('show'));

  btnDetailDelete.addEventListener('click', () => {
    if (!selectedEvent) return;
    if (confirm(`Deseja realmente excluir o compromisso "${selectedEvent.title}"?`)) {
      StorageDB.deleteEvent(selectedEvent.id);
      modalDetail.classList.remove('show');
      renderCalendar();
      renderAgenda();
      renderMeuDia();
    }
  });

  btnDetailEdit.addEventListener('click', () => {
    if (!selectedEvent) return;
    modalDetail.classList.remove('show');
    openEventModal(selectedEvent);
  });

  // --- CALENDÁRIO COM GRADE FIXA BLINDADA ---
  function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    document.getElementById('cal-month-year').textContent = `${monthNames[currentMonth]} ${currentYear}`;

    const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    daysOfWeek.forEach(d => {
      const header = document.createElement('div');
      header.className = 'cal-header';
      header.textContent = d;
      grid.appendChild(header);
    });

    const firstDayIndex = new Date(currentYear, currentMonth, 1, 12, 0, 0).getDay();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0, 12, 0, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0, 12, 0, 0).getDate();

    const now = new Date();
    const todayStr = formatLocalDate(now.getFullYear(), now.getMonth(), now.getDate());
    const events = StorageDB.getEvents();

    // 1. Preenchimento de dias do mês anterior
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell inactive';
      const prevDateNum = prevMonthDays - i;
      const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const cellDateStr = formatLocalDate(prevYear, prevMonthIdx, prevDateNum);

      const num = document.createElement('div');
      num.className = 'cal-date-number';
      num.textContent = prevDateNum;
      cell.appendChild(num);

      renderPillsInCell(cell, cellDateStr, events);
      cell.addEventListener('click', () => openEventModal(null, cellDateStr));
      grid.appendChild(cell);
    }

    // 2. Dias do mês atual
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      const thisDateStr = formatLocalDate(currentYear, currentMonth, day);

      if (thisDateStr === todayStr) cell.classList.add('today');

      const num = document.createElement('div');
      num.className = 'cal-date-number';
      num.textContent = day;
      cell.appendChild(num);

      renderPillsInCell(cell, thisDateStr, events);
      cell.addEventListener('click', () => openEventModal(null, thisDateStr));
      grid.appendChild(cell);
    }

    // 3. Preenchimento para fechar a grade (35 ou 42 células)
    const totalRendered = firstDayIndex + totalDaysInMonth;
    const targetTotal = totalRendered <= 35 ? 35 : 42;
    const remainingCells = targetTotal - totalRendered;

    for (let nextDay = 1; nextDay <= remainingCells; nextDay++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell inactive';
      const nextMonthIdx = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const cellDateStr = formatLocalDate(nextYear, nextMonthIdx, nextDay);

      const num = document.createElement('div');
      num.className = 'cal-date-number';
      num.textContent = nextDay;
      cell.appendChild(num);

      renderPillsInCell(cell, cellDateStr, events);
      cell.addEventListener('click', () => openEventModal(null, cellDateStr));
      grid.appendChild(cell);
    }
  }

  function renderPillsInCell(cell, dateStr, events) {
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'cal-events-container';

    const dayEvts = events.filter(e => e.start && e.start.slice(0, 10) === dateStr);

    dayEvts.forEach(evt => {
      const pill = document.createElement('div');
      pill.className = 'event-pill';
      if (evt.status === 'cancelled') {
        pill.style.opacity = '0.45';
        pill.style.textDecoration = 'line-through';
      }

      const timeLabel = evt.start.includes('T') ? evt.start.split('T')[1].slice(0, 5) : '';
      pill.textContent = `${timeLabel} ${evt.title}`;
      pill.title = `${timeLabel} - ${evt.title}`;

      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        openEventDetails(evt.id);
      });

      eventsContainer.appendChild(pill);
    });

    cell.appendChild(eventsContainer);
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

  // --- AGENDA COMPLETA ---
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
      const datePart = evt.start.slice(0, 10).split('-').reverse().join('/');
      const timePart = evt.start.slice(11, 16);

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <strong>${evt.title}</strong>
          <span style="font-size:0.75rem; padding:2px 6px; border-radius:4px; background:${evt.status === 'cancelled' ? 'var(--danger)' : 'var(--bg-tertiary)'}; color:#fff;">
            ${evt.status === 'cancelled' ? 'Cancelado' : 'Confirmado'}
          </span>
        </div>
        <p style="color:var(--text-muted); font-size:0.85rem; margin:0.5rem 0;">
          📅 ${datePart} às ${timePart}
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

  // --- MEU DIA ---
  function renderMeuDia() {
    const now = new Date();
    const todayStr = formatLocalDate(now.getFullYear(), now.getMonth(), now.getDate());
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
      const timeStart = e.start.slice(11, 16);
      const timeEnd = e.end ? e.end.slice(11, 16) : timeStart;
      card.innerHTML = `
        <strong>${e.title}</strong>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">
          🕒 ${timeStart} - ${timeEnd}
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
          <label style="cursor:pointer; display:flex; align-items:center; gap:0.5rem;">
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

  // --- VERIFICAÇÃO DE ALARMES E LEMBRETES (1 SEG) ---
  let triggeredAlertsToday = new Set();

  setInterval(() => {
    const now = new Date();
    const currentTimeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
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
      if (e.status === 'confirmed' && e.reminderMinutes !== undefined && e.start) {
        const startMs = new Date(e.start).getTime();
        const remindMs = startMs - (e.reminderMinutes * 60 * 1000);
        const diffSecs = Math.floor((now.getTime() - remindMs) / 1000);

        if (diffSecs >= 0 && diffSecs < 60) {
          const key = `event_remind_${e.id}_${e.reminderMinutes}_${now.toDateString()}`;
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
        body: `Horário: ${alarm.time}`,
        icon: 'manifest.json'
      });
    }
  }

  function triggerEventNotification(evt) {
    AudioEngine.beepAlert();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Lembrete: ${evt.title}`, {
        body: `Começa em ${evt.reminderMinutes} min (${evt.start.slice(11, 16)})`,
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
    const sTime = String(snoozeDate.getHours()).padStart(2, '0') + ':' + String(snoozeDate.getMinutes()).padStart(2, '0');
    StorageDB.saveAlarm({
      title: 'Soneca de Alarme',
      time: sTime,
      active: true,
      days: [snoozeDate.getDay()]
    });
    renderAlarms();
  });

  // --- MODAL DE CRIAÇÃO / EDIÇÃO ---
  function openEventModal(eventToEdit = null, prefilledDate = null) {
    currentModalAction = 'SAVE_EVENT';
    editingId = eventToEdit ? eventToEdit.id : null;
    modalTitle.textContent = eventToEdit ? 'Editar Compromisso' : 'Novo Compromisso';

    const now = new Date();
    let dVal = prefilledDate || formatLocalDate(now.getFullYear(), now.getMonth(), now.getDate());
    let sTime = '10:00';
    let eTime = '11:00';
    let titleVal = '';
    let descVal = '';
    let remindVal = '15';
    let statusVal = 'confirmed';

    if (eventToEdit) {
      dVal = eventToEdit.start.slice(0, 10);
      sTime = eventToEdit.start.slice(11, 16);
      eTime = eventToEdit.end ? eventToEdit.end.slice(11, 16) : sTime;
      titleVal = eventToEdit.title || '';
      descVal = eventToEdit.description || '';
      remindVal = String(eventToEdit.reminderMinutes !== undefined ? eventToEdit.reminderMinutes : '15');
      statusVal = eventToEdit.status || 'confirmed';
    }

    modalFields.innerHTML = `
      <div class="form-group">
        <label>Título do Compromisso:</label>
        <input type="text" id="form-evt-title" required value="${titleVal}" placeholder="Ex: Consulta Médica">
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
        <label>Lembrete com antecedência:</label>
        <select id="form-evt-remind">
          <option value="0" ${remindVal === '0' ? 'selected' : ''}>No horário</option>
          <option value="5" ${remindVal === '5' ? 'selected' : ''}>5 minutos antes</option>
          <option value="15" ${remindVal === '15' ? 'selected' : ''}>15 minutos antes</option>
          <option value="30" ${remindVal === '30' ? 'selected' : ''}>30 minutos antes</option>
          <option value="60" ${remindVal === '60' ? 'selected' : ''}>1 hora antes</option>
        </select>
      </div>
      <div class="form-group">
        <label>Situação:</label>
        <select id="form-evt-status">
          <option value="confirmed" ${statusVal === 'confirmed' ? 'selected' : ''}>Confirmado / Ativo</option>
          <option value="cancelled" ${statusVal === 'cancelled' ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>
      <div class="form-group">
        <label>Descrição / Observações:</label>
        <textarea id="form-evt-desc" rows="3" placeholder="Detalhes ou pauta...">${descVal}</textarea>
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
        <label>Título da Tarefa:</label>
        <input type="text" id="form-task-title" required placeholder="Ex: Pagar fatura de internet">
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
        <label>Horário do Alarme:</label>
        <input type="time" id="form-alm-time" value="07:00" required>
      </div>
      <div class="form-group">
        <label>Nome / Etiqueta:</label>
        <input type="text" id="form-alm-title" placeholder="Ex: Tomar medicação" required>
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
      const title = document.getElementById('form-evt-title').value.trim();
      const date = document.getElementById('form-evt-date').value;
      const startT = document.getElementById('form-evt-start').value;
      const endT = document.getElementById('form-evt-end').value;
      const remind = parseInt(document.getElementById('form-evt-remind').value, 10);
      const status = document.getElementById('form-evt-status').value;
      const description = document.getElementById('form-evt-desc').value;

      if (!title || !date || !startT) {
        alert('Por favor, preencha o título, a data e o horário inicial.');
        return;
      }

      StorageDB.saveEvent({
        id: editingId || undefined,
        title,
        start: `${date}T${startT}:00`,
        end: `${date}T${endT || startT}:00`,
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
      StorageDB.saveAlarm({ time, title, active: true, days: [0, 1, 2, 3, 4, 5, 6] });
      renderAlarms();
    }
    modalForm.classList.remove('show');
  });

  // --- CONFIGURAÇÕES & BACKUP RESTAURADOS ---
  function loadSettingsFields() {
    const cfg = StorageDB.getSettings();
    const selTz = document.getElementById('cfg-timezone');
    if (selTz) selTz.value = cfg.timezone || 'America/Sao_Paulo';

    const chkVox = document.getElementById('cfg-voice-feedback');
    if (chkVox) chkVox.checked = !!cfg.voiceFeedback;

    const rngRate = document.getElementById('cfg-voice-rate');
    const rngVal = document.getElementById('cfg-voice-rate-val');
    if (rngRate) {
      rngRate.value = cfg.speechRate || 1.0;
      if (rngVal) rngVal.textContent = cfg.speechRate || '1.0';
    }

    const inpAiEp = document.getElementById('cfg-ai-endpoint');
    if (inpAiEp) inpAiEp.value = cfg.aiEndpoint || '';

    const inpAiKey = document.getElementById('cfg-ai-key');
    if (inpAiKey) inpAiKey.value = cfg.aiApiKey || '';
  }

  document.getElementById('cfg-timezone').addEventListener('change', (e) => {
    const cfg = StorageDB.getSettings();
    cfg.timezone = e.target.value;
    StorageDB.saveSettings(cfg);
  });

  document.getElementById('cfg-voice-feedback').addEventListener('change', (e) => {
    const cfg = StorageDB.getSettings();
    cfg.voiceFeedback = e.target.checked;
    StorageDB.saveSettings(cfg);
  });

  document.getElementById('cfg-voice-rate').addEventListener('input', (e) => {
    const cfg = StorageDB.getSettings();
    cfg.speechRate = parseFloat(e.target.value);
    document.getElementById('cfg-voice-rate-val').textContent = e.target.value;
    StorageDB.saveSettings(cfg);
  });

  document.getElementById('btn-save-ai-cfg').addEventListener('click', () => {
    const cfg = StorageDB.getSettings();
    cfg.aiEndpoint = document.getElementById('cfg-ai-endpoint').value.trim();
    cfg.aiApiKey = document.getElementById('cfg-ai-key').value.trim();
    StorageDB.saveSettings(cfg);
    alert('Configurações salvas com sucesso!');
  });

  document.getElementById('btn-export-data').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(StorageDB.exportAll());
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `meu_assistente_backup_${new Date().toISOString().slice(0, 10)}.json`);
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
        alert('Dados importados com sucesso!');
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

  // Alternar Tema Claro / Escuro
  document.getElementById('btn-toggle-theme').addEventListener('click', () => {
    const curTheme = document.documentElement.getAttribute('data-theme');
    const target = curTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    const cfg = StorageDB.getSettings();
    cfg.theme = target;
    StorageDB.saveSettings(cfg);
  });

  // Inicializa tema e configurações salvas
  const initCfg = StorageDB.getSettings();
  if (initCfg.theme) document.documentElement.setAttribute('data-theme', initCfg.theme);
  loadSettingsFields();
});