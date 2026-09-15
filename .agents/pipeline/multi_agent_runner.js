/**
 * 마음 쉼터 멀티 에이전트 자율 협업 파이프라인 (Multi-Agent Autonomous Pipeline)
 * 기획자(Planner) -> 코더(Coder) -> 검수자(Reviewer) 순차 체인 실행기
 * 
 * 사용법:
 *   node .agents/pipeline/multi_agent_runner.js "추가할 기능 또는 개선 사항 설명"
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ 오류: GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

// 사용할 Gemini 모델 (Gemini 3.8 Flash)
const MODEL_NAME = 'gemini-3.8-flash';

async function callGemini(systemPrompt, userPrompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
  const payload = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.6,
      topP: 0.95
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 오류 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

async function runMultiAgentPipeline(taskDescription) {
  console.log('================================================================');
  console.log('🤖 멀티 에이전트 협업 파이프라인 가동');
  console.log(`📌 작업 주제: "${taskDescription}"`);
  console.log(`🧠 기반 모델: ${MODEL_NAME}`);
  console.log('================================================================\n');

  // 규칙 파일 로드
  const plannerRule = fs.readFileSync(path.join(__dirname, '../rules/01_planner.md'), 'utf-8');
  const coderRule = fs.readFileSync(path.join(__dirname, '../rules/02_coder.md'), 'utf-8');
  const reviewerRule = fs.readFileSync(path.join(__dirname, '../rules/03_reviewer.md'), 'utf-8');

  // 1단계: 기획자(Planner) 작업
  console.log('📋 [1단계: 기획자 에이전트] 요구사항 분석 및 기술 사양서 작성 중...');
  const plannerSystemPrompt = `${plannerRule}\n\n당신은 기획자 에이전트입니다. 사용자의 요구사항을 분석하여 명확하고 구조화된 기능 사양서를 한국어로 작성하세요.`;
  const plannerOutput = await callGemini(
    plannerSystemPrompt,
    `다음 요구사항에 대한 상세 기술 기획서 및 WBS를 작성해줘:\n"${taskDescription}"`
  );
  console.log('✅ 기획서 작성 완료!\n');

  // 2단계: 코더(Coder) 작업
  console.log('💻 [2단계: 코더 에이전트] 기획서 기반 소스 코드 구현 중...');
  const coderSystemPrompt = `${coderRule}\n\n당신은 코더 에이전트입니다. 기획자가 작성한 사양서를 바탕으로 실제 프로덕션 수준의 구현 코드와 변경점 리포트를 작성하세요.`;
  const coderInput = `기획자로부터 다음 기능 사양서를 전달받았습니다:\n\n---\n${plannerOutput}\n---\n\n위 사양서에 부합하는 실제 동작 코드 및 구현 리포트를 작성해주세요.`;
  const coderOutput = await callGemini(coderSystemPrompt, coderInput);
  console.log('✅ 코드 구현 완료!\n');

  // 3단계: 검수자(Reviewer) 작업
  console.log('🔍 [3단계: 검수자 에이전트] 코드 리뷰, 보안 감사 및 QA 판정 중...');
  const reviewerSystemPrompt = `${reviewerRule}\n\n당신은 수석 검수자/QA 에이전트입니다. 기획서와 코더가 작성한 코드를 대조하여 보안, 예외 처리, 기획 일치도를 철저히 감사하고 최종 판정을 내리세요.`;
  const reviewerInput = `[사용자 초기 요구사항]\n${taskDescription}\n\n[기획자 사양서]\n${plannerOutput}\n\n[코더 구현 코드]\n${coderOutput}\n\n위 내용을 종합적으로 검수하고, 표준 템플릿에 따라 평가 리포트와 최종 판정(PASS 또는 CHANGES REQUESTED)을 발행해주세요.`;
  const reviewerOutput = await callGemini(reviewerSystemPrompt, reviewerInput);
  console.log('✅ 검수 및 QA 판정 완료!\n');

  // 최종 리포트 마크다운 조합 및 저장
  const finalReport = `# 🤖 멀티 에이전트 협업 산출물 리포트

- **요구사항**: ${taskDescription}
- **실행 모델**: ${MODEL_NAME}
- **일시**: ${new Date().toLocaleString('ko-KR')}

---

## 1. 📋 기획자 산출물 (Planner Specification)
${plannerOutput}

---

## 2. 💻 코더 산출물 (Coder Implementation)
${coderOutput}

---

## 3. 🔍 검수자 산출물 (Reviewer & QA Verdict)
${reviewerOutput}
`;

  const reportPath = path.join(__dirname, 'latest_multi_agent_report.md');
  fs.writeFileSync(reportPath, finalReport, 'utf-8');

  console.log('================================================================');
  console.log('🎉 멀티 에이전트 파이프라인 협업 완료!');
  console.log(`📄 최종 협업 리포트가 저장되었습니다: ${reportPath}`);
  console.log('================================================================\n');

  console.log('--- [검수자 최종 판정 요약] ---');
  console.log(reviewerOutput.slice(0, 800) + '...\n');
}

// CLI 인자 처리
const inputArg = process.argv.slice(2).join(' ');
const task = inputArg || '상담 대화 내역을 사용자가 텍스트(.txt) 파일로 다운로드할 수 있는 기능 추가';

runMultiAgentPipeline(task).catch(err => {
  console.error('❌ 멀티 에이전트 실행 중 오류:', err);
  process.exit(1);
});
