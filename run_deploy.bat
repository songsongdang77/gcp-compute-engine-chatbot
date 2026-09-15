@echo off
chcp 65001 > nul
echo ========================================================
echo 🌿 마음 쉼터 GCP Compute Engine 자동 배포
echo ========================================================
echo.
echo [1단계] GCP 계정(songpa07@iceu.kr) 브라우저 인증을 진행합니다...
echo 브라우저 창이 열리면 로그인 및 권한 승인을 완료해주세요.
echo.
gcloud auth login
echo.
echo [2단계] Compute Engine VM 인스턴스 생성 및 챗봇 자동 배포를 시작합니다...
echo.
python deploy_compute_engine.py
echo.
echo ========================================================
echo 모든 작업이 완료되었습니다. 결과 로그는 deployment.log를 확인하세요.
echo ========================================================
pause
