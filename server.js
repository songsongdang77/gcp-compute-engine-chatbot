const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 지원 모델 목록
const AVAILABLE_MODELS = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: '기본 · 최신',
    description: '섬세하고 신속한 감정 공감과 심리적 지지에 특화된 최신 플래시 모델'
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    tag: '선택 가능',
    description: '균형 잡힌 대화와 차분한 심신 안정 솔루션을 제공하는 모델'
  }
];

// 정신건강 전문 심리상담 시스템 프롬프트
const SYSTEM_INSTRUCTION = `당신은 정신건강 및 심리상담에 특화된 다정하고 지혜로운 AI 심리 상담사 '마음 쉼터(Mind Shelter)'입니다.

[상담의 핵심 원칙]
1. 무조건적 긍정적 존중(Unconditional Positive Regard):
   - 내담자(사용자)의 감정, 고통, 불안, 슬픔을 어떠한 선입견이나 판단 없이 온전히 수용하고 존중하세요.
   - 섣부른 훈계, 충고, 가르치려 드는 태도를 절대 지양하세요. "그런 마음이 드시는 것은 지극히 자연스러운 반응입니다", "참 많이 버겁고 지치셨겠어요"처럼 감정을 먼저 깊이 인정(Validation)하세요.

2. 하브루타식 경청과 성찰적 질문(Reflective Inquiry):
   - 사용자의 말을 거울처럼 반영(Mirroring)해주고, 스스로 마음의 핵심을 들여다볼 수 있는 부드러운 개방형 질문을 한두 개 건네어 대화를 이어가세요.
   - 단, 질문을 너무 많이 던져 내담자가 취조당하는 느낌이나 심문받는 피로감을 느끼지 않도록 주의하세요.

3. 심신 안정 및 그라운딩(Grounding) 기법 제공:
   - 사용자가 호흡 곤란, 불안, 과도한 스트레스를 호소할 때는 4-7-8 복식호흡법이나 5-4-3-2-1 감각 집중 그라운딩 기법을 차분하게 한 걸음씩 안내하세요.

4. 위기 상황 개입 및 생명 안전 수칙 (최우선 준수):
   - 사용자가 자살, 자해, 죽고 싶다는 생각, 극단적 절망감을 표현하는 경우:
     - 절대 당황하거나 비난하지 말고, 그동안 얼마나 고통스러웠는지를 따뜻하게 위로하세요.
     - 사용자의 곁에 항상 도움을 줄 수 있는 전문 지원 체계가 있음을 부드럽고 명확하게 안내하세요.
     - 필수 위기상담 안내 번호:
       * 자살예방 상담전화: 109 (24시간 무료)
       * 정신건강 위기상담전화: 1577-0199 (24시간)
       * 청소년 전화: 1388 (24시간)
       * 응급 위급상황: 112 또는 119

5. 의료적 한계와 명확한 경계:
   - 전문적인 질환 진단, 약물 처방 또는 응급 의료 조치는 정신건강의학과 전문의의 진료가 필요함을 자연스럽게 안내하세요.

6. 말투와 서식:
   - 따뜻하고 차분한 경어체('해요체')를 사용하세요.
   - 읽기 편하도록 문단을 여유 있게 나누고, 강조나 리스트를 적절히 활용하여 시각적으로도 편안함을 주세요.`;

// 헬스체크 및 환경변수 확인
app.get('/api/health', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  res.json({
    status: 'ok',
    hasApiKey: Boolean(apiKey && apiKey.trim().length > 0),
    defaultModel: 'gemini-3.8-flash',
    availableModels: AVAILABLE_MODELS.map(m => m.id)
  });
});

// 사용 가능한 모델 목록 반환
app.get('/api/models', (req, res) => {
  res.json(AVAILABLE_MODELS);
});

// 대화 스트리밍 엔드포인트
app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다. 서버 환경변수를 확인해주세요.'
    });
  }

  const { messages, model = 'gemini-3.8-flash' } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '유효한 대화 메시지 배열이 필요합니다.' });
  }

  // 선택된 모델 검증 (허용 모델이 아니면 기본 3.8-flash로 폴백)
  const validModel = AVAILABLE_MODELS.some(m => m.id === model) ? model : 'gemini-3.8-flash';

  // Gemini API 포맷으로 변환
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.content || '' }]
  }));

  const payload = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95
    }
  };

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${validModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

  // Server-Sent Events 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const response = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', response.status, errorText);
      res.write(`data: ${JSON.stringify({ error: `Gemini API 호출 오류 (${response.status})` })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
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
          const jsonStr = trimmed.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            const candidates = data.candidates || [];
            if (candidates.length > 0 && candidates[0].content?.parts) {
              for (const part of candidates[0].content.parts) {
                if (part.text) {
                  res.write(`data: ${JSON.stringify({ chunk: part.text })}\n\n`);
                }
              }
            }
          } catch (e) {
            // SSE json 파싱 에러 무시
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Streaming request error:', err);
    res.write(`data: ${JSON.stringify({ error: '서버 내부 오류가 발생했습니다: ' + err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// 프론트엔드 라우트 (SPA 지원)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🌿 마음 쉼터 - Gemini 3.8/3.7 Flash 정신건강 상담 챗봇`);
  console.log(`🚀 서버 구동 완료: http://localhost:${PORT}`);
  console.log(`🔑 GEMINI_API_KEY 환경변수: ${process.env.GEMINI_API_KEY ? '정상 로드됨' : '미설정'}`);
  console.log(`====================================================`);
});
