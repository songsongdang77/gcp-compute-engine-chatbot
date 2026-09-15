---
name: agent-reviewer
description: >-
  검수자 에이전트 스킬. 기획서 대비 구현 일치도, 잠재적 버그, 보안 취약점,
  예외 처리 및 성능을 심층 감사하여 종합 QA 검수 리포트를 발행합니다.
---

# 검수자 (Reviewer) 워크플로우 스킬

이 스킬은 코더(`agent-coder`)가 작성한 코드를 독립적인 시각에서 심층 감사하고, 최종 배포 승인 여부를 결정할 때 사용합니다.

## 실행 절차

1. **기획서 대조 검수 (Requirement Conformance)**:
   - 기획서의 필수 요구사항 누락 여부 확인
2. **보안 및 예외 처리 감사 (Security & Robustness Audit)**:
   - API 키 유출, XSS, 입력값 검증 부재, 에러 처리 미흡 여부 탐지
3. **정적 분석 및 실행 검증**:
   - 코드 가독성, 프로젝트 컨벤션 부합 여부 평가
   - 필요 시 테스트 코드 또는 curl/fetch를 통한 엔드포인트 응답 검증
4. **결과 리포팅 및 판정**:
   - `.agents/rules/03_reviewer.md` 템플릿에 따라 종합 점수 및 PASS / CHANGES REQUESTED 판정 보고서 작성
