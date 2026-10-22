  // Histórico em memória para a IA ter contexto da conversa
  let aiConversationHistory = [];

  async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    appendMessage('user', text);
    chatInput.value = '';

    const events = StorageDB.getEvents();
    const tasks = StorageDB.getTasks();

    // 1. Tenta interpretar primeiro como comando nativo de sistema (agendar, alarme, etc.)
    const action = NLPParser.interpretLocal(text, events);

    if (action) {
      switch (action.intent) {
        case 'CREATE_EVENT': {
          if (action.isPast) {
            appendMessage('assistant', `Atenção: A data informada (${action.startDate.toLocaleDateString('pt-BR')}) já passou.`);
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
          const resp = `Agendado com sucesso: "${newEvt.title}" para ${action.startDate.toLocaleDateString('pt-BR')} às ${startH} (Lembrete: ${action.reminderMinutes} min antes).`;
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
            appendMessage('assistant', `Não encontrei nenhum compromisso ativo correspondente a "${action.query}".`);
          }
          return;
        }
      }
    }

    // 2. Não é comando estrito de sistema: envia para a Inteligência Artificial
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