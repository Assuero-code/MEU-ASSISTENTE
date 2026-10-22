// nlp.js - Processador Semântico com Conexão Groq / OpenAI Atualizada
const NLPParser = {
  // Parser determinístico local (para comandos estruturados de agenda e fallback offline)
  parseDateTime(text, baseDate = new Date()) {
    const lower = text.toLowerCase();
    const target = new Date(baseDate.getTime());
    let dateFound = false;
    let timeFound = false;

    if (lower.includes('hoje')) {
      dateFound = true;
    } else if (lower.includes('depois de amanhã') || lower.includes('depois de amanha')) {
      target.setDate(target.getDate() + 2);
      dateFound = true;
    } else if (lower.includes('amanhã') || lower.includes('amanha')) {
      target.setDate(target.getDate() + 1);
      dateFound = true;
    } else {
      const weekdays = ['domingo', 'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado'];
      for (let i = 0; i < weekdays.length; i++) {
        if (lower.includes(weekdays[i])) {
          const targetDay = i > 6 ? (i === 7 ? 2 : 6) : i;
          const currentDay = target.getDay();
          let diff = targetDay - currentDay;
          if (diff <= 0) diff += 7;
          target.setDate(target.getDate() + diff);
          dateFound = true;
          break;
        }
      }

      const dateMatch = lower.match(/(?:dia\s+)?(\d{1,2})(?:\/|\s+de\s+)(\d{1,2}|janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)?/i);
      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        let month = target.getMonth();
        if (dateMatch[2]) {
          const mStr = dateMatch[2].toLowerCase();
          const monthsMap = {
            'janeiro': 0, 'fevereiro': 1, 'março': 2, 'marco': 2, 'abril': 3,
            'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8,
            'outubro': 9, 'novembro': 10, 'dezembro': 11
          };
          if (!isNaN(parseInt(mStr, 10))) {
            month = parseInt(mStr, 10) - 1;
          } else if (monthsMap[mStr] !== undefined) {
            month = monthsMap[mStr];
          }
        }
        target.setDate(day);
        target.setMonth(month);
        dateFound = true;
      }
    }

    const timeMatch = lower.match(/(?:às|as|\s|^)(\d{1,2})(?:[h:](\d{2})?|(\s*horas?))/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      if (lower.includes('da noite') || lower.includes('da tarde')) {
        if (hours < 12) hours += 12;
      }
      target.setHours(hours, minutes, 0, 0);
      timeFound = true;
    } else {
      target.setHours(9, 0, 0, 0);
    }

    return {
      date: target,
      hasExplicitDate: dateFound,
      hasExplicitTime: timeFound
    };
  },

  interpretLocal(input, existingEvents = []) {
    const text = input.trim();
    const lower = text.toLowerCase();

    // 1. Consulta de Agenda
    if (
      lower.startsWith('o que tenho') ||
      lower.includes('quais compromissos') ||
      lower.includes('minha agenda') ||
      lower.includes('tenho algum compromisso')
    ) {
      const dt = this.parseDateTime(lower);
      const queryDay = dt.date.toISOString().slice(0, 10);
      const isTomorrow = lower.includes('amanhã') || lower.includes('amanha');
      return {
        intent: 'QUERY_AGENDA',
        targetDate: queryDay,
        isTomorrow,
        raw: text
      };
    }

    // 2. Consulta de Tarefas
    if (lower.includes('quais são minhas tarefas') || lower.includes('minhas tarefas') || lower.includes('tarefas pendentes')) {
      return { intent: 'QUERY_TASKS', raw: text };
    }

    // 3. Cancelamento
    if (lower.startsWith('cancele') || lower.startsWith('cancelar') || lower.startsWith('exclua') || lower.startsWith('remover')) {
      return {
        intent: 'CANCEL_EVENT',
        query: lower.replace(/(cancele|cancelar|exclua|remover|o compromisso|evento|de)\s*/gi, '').trim(),
        raw: text
      };
    }

    // 4. Alarme
    if (lower.startsWith('alarme') || lower.includes('criar alarme') || lower.includes('me acorde')) {
      const timeParsed = this.parseDateTime(lower);
      const hours = String(timeParsed.date.getHours()).padStart(2, '0');
      const mins = String(timeParsed.date.getMinutes()).padStart(2, '0');
      return {
        intent: 'CREATE_ALARM',
        time: `${hours}:${mins}`,
        title: text.replace(/(alarme|criar alarme|me acorde|para|às|as)\s*/gi, '').trim() || 'Alarme',
        raw: text
      };
    }

    // 5. Tarefa
    if (lower.startsWith('tarefa:') || lower.startsWith('lembre-me de') || lower.startsWith('criar tarefa')) {
      const title = text.replace(/^(tarefa:|lembre-me de|criar tarefa)/i, '').trim();
      return { intent: 'CREATE_TASK', title: title || 'Nova Tarefa', raw: text };
    }

    // 6. Evento / Compromisso
    if (
      lower.startsWith('marque') || 
      lower.startsWith('agende') || 
      lower.startsWith('marcar') || 
      lower.includes('reunião') || 
      lower.includes('reuniao') || 
      lower.includes('consulta') || 
      lower.includes('compromisso')
    ) {
      const parsed = this.parseDateTime(lower);
      let cleanTitle = text
        .replace(/(marque|agende|marcar|agendar|uma|um|novo|nova|compromisso|reunião|reuniao|consulta)\s*/gi, '')
        .replace(/(amanhã|amanha|hoje|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)/gi, '')
        .replace(/às\s+\d{1,2}(?::\d{2}|h)?/gi, '')
        .replace(/no dia\s+\d{1,2}(?:\/\d{1,2})?/gi, '')
        .trim();

      if (!cleanTitle || cleanTitle.length < 2) {
        cleanTitle = lower.includes('consulta') ? 'Consulta Médica' : 'Reunião Importante';
      }

      let reminderMinutes = 15;
      if (lower.includes('30 minutos antes')) reminderMinutes = 30;
      if (lower.includes('1 hora antes') || lower.includes('uma hora antes')) reminderMinutes = 60;
      if (lower.includes('10 minutos antes')) reminderMinutes = 10;
      if (lower.includes('no horário') || lower.includes('na hora')) reminderMinutes = 0;

      const end = new Date(parsed.date.getTime() + 60 * 60 * 1000);

      const conflict = existingEvents.find(e => {
        const eStart = new Date(e.start).getTime();
        const eEnd = new Date(e.end).getTime();
        const tStart = parsed.date.getTime();
        const tEnd = end.getTime();
        return (tStart < eEnd && tEnd > eStart) && e.status !== 'cancelled';
      });

      return {
        intent: 'CREATE_EVENT',
        title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
        startDate: parsed.date,
        endDate: end,
        reminderMinutes: reminderMinutes,
        conflict: conflict ? conflict : null,
        isPast: parsed.date.getTime() < Date.now(),
        raw: text
      };
    }

    return null;
  },

  // Chamada à API da Groq / OpenAI com tratamento de erro detalhado
  async askAI(prompt, conversationHistory = []) {
    const settings = StorageDB.getSettings();
    let endpoint = (settings.aiEndpoint || '').trim();
    let apiKey = (settings.aiApiKey || '').trim();

    // Se o usuário não preencheu o endpoint mas forneceu uma chave da Groq (gsk_...)
    if (!endpoint && apiKey.startsWith('gsk_')) {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    }

    if (!endpoint || !apiKey) {
      return {
        success: false,
        message: 'Configuração necessária: Vá em "⚙️ Ajustes" e informe o Endpoint da API e a Chave da Groq.'
      };
    }

    // Modelo oficial atualizado da Groq (compatível e de alta velocidade)
    let modelName = 'llama-3.1-8b-instant';
    if (endpoint.includes('openai.com')) {
      modelName = 'gpt-3.5-turbo';
    }

    const systemPrompt = `Você é o "Meu Assistente", um assistente pessoal inteligente, prestativo e simpático. 
Responda sempre em português do Brasil com respostas bem formatadas, claras e objetivas. 
Data atual de referência: ${new Date().toLocaleDateString('pt-BR')}.`;

    // Filtra histórico para evitar exceder limite de tokens
    const recentHistory = conversationHistory
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6);

    const payload = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentHistory,
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 800
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorDetail = errorBody.error?.message || `Código de erro HTTP ${response.status}`;
        
        // Se o erro for de modelo não encontrado ou cota esgotada, tenta modelo leve alternativo
        if (response.status === 404 || errorDetail.includes('model')) {
          payload.model = 'llama-3.1-8b-instant';
          const retryRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            return {
              success: true,
              message: retryData.choices[0].message.content.trim()
            };
          }
        }

        throw new Error(errorDetail);
      }

      const data = await response.json();
      const reply = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : 'Não foi possível gerar uma resposta no momento.';

      return {
        success: true,
        message: reply.trim()
      };
    } catch (err) {
      console.error('Erro na chamada da Groq API:', err);
      return {
        success: false,
        message: `Erro na API da Groq: ${err.message}. Verifique em "⚙️ Ajustes" se a chave começa com "gsk_" e se o endpoint está correto.`
      };
    }
  }
};

window.NLPParser = NLPParser;
