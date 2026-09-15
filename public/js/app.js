/**
 * 마음 쉼터 (Mind Shelter) - Gemini 3.8 Flash / 3.7 Flash Mental Health Chatbot
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM 요소 참조
  const chatViewport = document.getElementById('chatViewport');
  const welcomeContainer = document.getElementById('welcomeContainer');
  const messageList = document.getElementById('messageList');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const micBtn = document.getElementById('micBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const sunIcon = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');

  // 모델 셀렉터 관련
  const modelSelectBtn = document.getElementById('modelSelectBtn');
  const modelMenuPopup = document.getElementById('modelMenuPopup');
  const currentModelBadgeText = document.getElementById('currentModelBadgeText');
  const activeModelLabel = document.getElementById('activeModelLabel');
  const modelOptions = document.querySelectorAll('.model-option');

  // 모달 관련
  const crisisModalBtn = document.getElementById('crisisModalBtn');
  const crisisModal = document.getElementById('crisisModal');
  const closeCrisisModalBtn = document.getElementById('closeCrisisModalBtn');
  const confirmCrisisModalBtn = document.getElementById('confirmCrisisModalBtn');
  const actionPlusBtn = document.getElementById('actionPlusBtn');
  const quickActionModal = document.getElementById('quickActionModal');
  const closeQuickActionBtn = document.getElementById('closeQuickActionBtn');

  // 상태 관리
  let currentModel = 'gemini-3.8-flash';
  let isGenerating = false;
  let chatHistory = [];
  let speechRecognition = null;
  let isRecording = false;
  let currentUtterance = null;

  // 1. 모델 전환 로직
  function setModel(modelId) {
    currentModel = modelId;
    const is38 = modelId === 'gemini-3.8-flash';
    currentModelBadgeText.textContent = is38 ? '3.8 Flash' : '3.7 Flash';
    activeModelLabel.textContent = is38 ? 'Gemini 3.8 Flash' : 'Gemini 3.7 Flash';

    modelOptions.forEach(opt => {
      if (opt.dataset.model === modelId) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });

    modelMenuPopup.classList.remove('open');
  }

  modelSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    modelMenuPopup.classList.toggle('open');
  });

  modelOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      setModel(opt.dataset.model);
    });
  });

  document.addEventListener('click', (e) => {
    if (!modelMenuPopup.contains(e.target) && !modelSelectBtn.contains(e.target)) {
      modelMenuPopup.classList.remove('open');
    }
  });

  // 2. 테마 (라이트 / 다크) 전환
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    } else {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    }
    localStorage.setItem('gemini_theme', theme);
  }

  const savedTheme = localStorage.getItem('gemini_theme') || 'light';
  applyTheme(savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    applyTheme(isDark ? 'light' : 'dark');
  });

  // 3. 사이드바 접기 / 펴기
  function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
  }

  sidebarToggleBtn.addEventListener('click', toggleSidebar);
  sidebarCollapseBtn?.addEventListener('click', toggleSidebar);

  // 4. 입력창 크기 자동 조절 & 전송 버튼 활성화
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    sendBtn.disabled = !chatInput.value.trim() || isGenerating;
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled && !isGenerating) {
        handleSendMessage();
      }
    }
  });

  sendBtn.addEventListener('click', handleSendMessage);

  // 5. 추천 칩 & 질문 카드 클릭 처리
  document.querySelectorAll('.suggestion-card, .theme-pill-btn, .quick-action-item').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.dataset.prompt;
      if (prompt) {
        quickActionModal.classList.remove('open');
        chatInput.value = prompt;
        chatInput.dispatchEvent(new Event('input'));
        handleSendMessage();
      }
    });
  });

  // 6. 새 상담 시작 / 비우기
  function resetChat() {
    if (isGenerating) return;
    window.speechSynthesis?.cancel();
    chatHistory = [];
    messageList.innerHTML = '';
    messageList.style.display = 'none';
    welcomeContainer.style.display = 'block';
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;
    chatViewport.scrollTop = 0;
  }

  newChatBtn.addEventListener('click', resetChat);
  clearChatBtn.addEventListener('click', resetChat);

  // 7. 모달 토글
  crisisModalBtn.addEventListener('click', () => crisisModal.classList.add('open'));
  closeCrisisModalBtn.addEventListener('click', () => crisisModal.classList.remove('open'));
  confirmCrisisModalBtn.addEventListener('click', () => crisisModal.classList.remove('open'));

  actionPlusBtn.addEventListener('click', () => quickActionModal.classList.add('open'));
  closeQuickActionBtn.addEventListener('click', () => quickActionModal.classList.remove('open'));

  [crisisModal, quickActionModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });

  // 8. 음성 인식 (STT) 지원
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    speechRecognition = new SpeechRecognition();
    speechRecognition.lang = 'ko-KR';
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;

    speechRecognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
    };

    speechRecognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      chatInput.value = transcript;
      chatInput.dispatchEvent(new Event('input'));
    };

    speechRecognition.onerror = (err) => {
      console.warn('Speech recognition error:', err);
      stopRecording();
    };

    speechRecognition.onend = () => {
      stopRecording();
    };
  } else {
    micBtn.title = '이 브라우저는 음성 인식을 지원하지 않습니다.';
  }

  function stopRecording() {
    isRecording = false;
    micBtn.classList.remove('recording');
  }

  micBtn.addEventListener('click', () => {
    if (!speechRecognition) {
      alert('사용하시는 브라우저가 마이크 음성 인식을 지원하지 않습니다.');
      return;
    }
    if (isRecording) {
      speechRecognition.stop();
      stopRecording();
    } else {
      try {
        speechRecognition.start();
      } catch (e) {
        console.error(e);
      }
    }
  });

  // 9. 메시지 렌더링 & 전송 핸들러
  async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text || isGenerating) return;

    // 초기 화면 숨기고 메시지 리스트 표시
    welcomeContainer.style.display = 'none';
    messageList.style.display = 'flex';

    // 유저 메시지 DOM 추가
    appendUserMessage(text);
    chatHistory.push({ role: 'user', content: text });

    // 입력창 초기화
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;

    // AI 응답 컨테이너 생성
    const { messageRow, textContainer, cursor } = createAiMessagePlaceholder(currentModel);
    messageList.appendChild(messageRow);
    scrollToBottom();

    isGenerating = true;
    let fullResponse = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          model: currentModel,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`서버 오류 발생 (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') {
              break;
            }
            try {
              const data = JSON.parse(dataStr);
              if (data.chunk) {
                fullResponse += data.chunk;
                textContainer.innerHTML = renderMarkdown(fullResponse);
                textContainer.appendChild(cursor);
                scrollToBottom();
              } else if (data.error) {
                fullResponse += `\n\n*(안내: ${data.error})*`;
                textContainer.innerHTML = renderMarkdown(fullResponse);
              }
            } catch (e) {
              // 파싱 무시
            }
          }
        }
      }

      // 스트리밍 완료 후 커서 제거
      cursor.remove();
      chatHistory.push({ role: 'assistant', content: fullResponse });

      // 응답 액션 바(복사, TTS, 모델 태그) 부착
      appendAiMessageActions(messageRow, fullResponse, currentModel);

    } catch (err) {
      cursor.remove();
      console.error('Chat error:', err);
      textContainer.innerHTML = `<p style="color: var(--danger-color);">대화 중 오류가 발생했습니다: ${err.message}<br>잠시 후 다시 시도해주세요.</p>`;
    } finally {
      isGenerating = false;
      sendBtn.disabled = !chatInput.value.trim();
      chatInput.focus();
    }
  }

  // 유저 메시지 노드 생성
  function appendUserMessage(text) {
    const row = document.createElement('div');
    row.className = 'message-row user';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble-user';
    bubble.textContent = text;

    row.appendChild(bubble);
    messageList.appendChild(row);
    scrollToBottom();
  }

  // AI 응답 플레이스홀더 노드 생성
  function createAiMessagePlaceholder(modelId) {
    const row = document.createElement('div');
    row.className = 'message-row model';

    const avatar = document.createElement('div');
    avatar.className = 'model-avatar-gemini';
    avatar.innerHTML = '<span class="gemini-star">✦</span>';

    const content = document.createElement('div');
    content.className = 'message-content-model';

    const textContainer = document.createElement('div');
    textContainer.className = 'markdown-body';

    const cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';

    textContainer.appendChild(cursor);
    content.appendChild(textContainer);
    row.appendChild(avatar);
    row.appendChild(content);

    return { messageRow: row, textContainer, cursor };
  }

  // AI 메시지 하단 액션 버튼 추가
  function appendAiMessageActions(row, text, modelId) {
    const content = row.querySelector('.message-content-model');
    if (!content) return;

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    // 복사 버튼
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn-mini';
    copyBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>복사</span>
    `;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.querySelector('span').textContent = '복사됨!';
        setTimeout(() => {
          copyBtn.querySelector('span').textContent = '복사';
        }, 1800);
      });
    });

    // TTS 음성 듣기 버튼
    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'action-btn-mini';
    ttsBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>
      <span>듣기</span>
    `;

    ttsBtn.addEventListener('click', () => {
      if (!('speechSynthesis' in window)) {
        alert('이 브라우저는 음성 합성을 지원하지 않습니다.');
        return;
      }
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        ttsBtn.querySelector('span').textContent = '듣기';
        return;
      }

      // 간단한 마크다운 기호 제거 후 음성 출력
      const cleanText = text.replace(/[#*`_~>[\]]/g, '').trim();
      currentUtterance = new SpeechSynthesisUtterance(cleanText);
      currentUtterance.lang = 'ko-KR';
      currentUtterance.rate = 0.95; // 차분하고 편안한 속도

      currentUtterance.onstart = () => {
        ttsBtn.querySelector('span').textContent = '멈춤';
      };
      currentUtterance.onend = () => {
        ttsBtn.querySelector('span').textContent = '듣기';
      };
      currentUtterance.onerror = () => {
        ttsBtn.querySelector('span').textContent = '듣기';
      };

      window.speechSynthesis.speak(currentUtterance);
    });

    // 모델 태그
    const modelTag = document.createElement('div');
    modelTag.className = 'model-source-tag';
    const modelLabel = modelId === 'gemini-3.8-flash' ? 'Gemini 3.8 Flash' : 'Gemini 3.7 Flash';
    modelTag.innerHTML = `<span>✦ ${modelLabel}</span>`;

    actions.appendChild(copyBtn);
    actions.appendChild(ttsBtn);
    actions.appendChild(modelTag);
    content.appendChild(actions);
  }

  // 스크롤 아래로 부드럽게 이동
  function scrollToBottom() {
    chatViewport.scrollTop = chatViewport.scrollHeight;
  }

  // 경량 마크다운 렌더러 (보안 XSS 방지 및 기본 서식 파싱)
  function renderMarkdown(rawText) {
    if (!rawText) return '';

    // HTML 태그 이스케이프
    let text = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 블록 인용구 (> ...)
    text = text.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');

    // 헤딩 (###, ##, #)
    text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // 굵게 (**text** or __text__)
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // 기울임 (*text* or _text_)
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 순서 없는 리스트 (- 또는 * )
    text = text.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // 숫자 리스트 (1. 2. 3.)
    text = text.replace(/^\s*(\d+)\.\s+(.*)$/gm, '<li>$2</li>');

    // 문단 및 줄바꿈 처리
    const paragraphs = text.split(/\n\n+/);
    text = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h1>') || p.startsWith('<h2>') || p.startsWith('<h3>') ||
          p.startsWith('<ul>') || p.startsWith('<ol>') || p.startsWith('<blockquote>')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return text;
  }
});
