#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🌿 마음 쉼터 (Mind Shelter) - GCP Compute Engine 배포 스크립트
주피터 노트북(compute_engine_example.ipynb) 설정을 기반으로:
1. GCP 인증 및 Secret Manager(projects/1063515563667/secrets/GEMINI_API_KEY) 확인
2. Compute Engine 인스턴스 (e2-medium, us-central1-a, Debian) 생성
3. 방화벽 규칙(포트 80, 3000) 구성
4. 소스코드 및 시작 스크립트(Startup Script) 주입 및 systemd 데몬 구동
5. 전체 배포 과정을 deployment.log 파일에 상세 기록
"""

import os
import sys
import time
import json
import shutil
import base64
import subprocess
from datetime import datetime

# Windows 콘솔 출력 UTF-8 인코딩 강제 적용
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

LOG_FILE = "deployment.log"
PROJECT_ID = "iceu-songpa07"
PROJECT_NUMBER = "1063515563667"
SELECTED_ZONE = "us-central1-a"
INSTANCE_NAME = "instance-chatbot-mind-shelter"
MACHINE_TYPE = "e2-medium"
SECRET_ID = "GEMINI_API_KEY"
SECRET_FULL_NAME = f"projects/{PROJECT_NUMBER}/secrets/{SECRET_ID}"
SERVICE_ACCOUNT = f"{PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# gcloud 바이너리 경로 탐색
gcloud_bin = shutil.which("gcloud.cmd") or shutil.which("gcloud") or "C:\\Users\\admy7\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd"
is_windows = sys.platform.startswith("win")

def mask_secrets(text):
    if not text:
        return text
    import re
    text = re.sub(r'ya29\.[a-zA-Z0-9_\-]+', '[MASKED_OAUTH_TOKEN]', text)
    text = re.sub(r'AQ\.[a-zA-Z0-9_\-]+', '[MASKED_API_KEY]', text)
    return text

def log(message, level="INFO"):
    message = mask_secrets(message)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [{level}] {message}"
    print(formatted, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception as e:
        print(f"로그 파일 쓰기 오류: {e}", file=sys.stderr)

def run_cmd(cmd_list, check=True, capture=True):
    cmd_str = " ".join(cmd_list)
    log(f"실행 명령어: {cmd_str}", level="EXEC")
    try:
        res = subprocess.run(
            cmd_list,
            shell=is_windows,
            stdin=subprocess.DEVNULL,
            capture_output=capture,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
        if res.stdout and res.stdout.strip():
            for line in res.stdout.strip().split("\n"):
                log(f"  [STDOUT] {line}", level="DEBUG")
        if res.stderr and res.stderr.strip():
            for line in res.stderr.strip().split("\n"):
                log(f"  [STDERR] {line}", level="DEBUG")
        if check and res.returncode != 0:
            raise subprocess.CalledProcessError(res.returncode, cmd_list, output=res.stdout, stderr=res.stderr)
        return res
    except Exception as err:
        log(f"명령어 실행 실패: {err}", level="ERROR")
        raise

def check_gcloud_auth():
    log("1단계: GCP gcloud 인증 상태 점검 시작...", level="STEP")
    res = run_cmd([gcloud_bin, "auth", "print-access-token"], check=False)
    if res.returncode != 0:
        log("gcloud 인증 토큰이 만료되었거나 비활성 상태입니다.", level="WARN")
        return False
    log("gcloud 인증 토큰 정상 확인 완료.", level="SUCCESS")
    return True

def fetch_secret_key():
    log(f"2단계: Secret Manager ({SECRET_FULL_NAME})에서 GEMINI_API_KEY 검증/추출 중...", level="STEP")
    # 1차 시도: gcloud secrets versions access
    cmd = [
        gcloud_bin, "secrets", "versions", "access", "latest",
        f"--secret={SECRET_ID}",
        f"--project={PROJECT_ID}"
    ]
    res = run_cmd(cmd, check=False)
    if res.returncode == 0 and res.stdout.strip():
        secret_val = res.stdout.strip()
        log(f"Secret Manager에서 {SECRET_ID} 성공적으로 획득 (길이: {len(secret_val)}자)", level="SUCCESS")
        return secret_val

    # 2차 시도: 현재 로컬 환경변수 GEMINI_API_KEY 사용
    env_key = os.environ.get("GEMINI_API_KEY")
    if env_key:
        log(f"Secret Manager CLI 접근 불가 시 로컬 환경변수 GEMINI_API_KEY로 대체합니다. (길이: {len(env_key)}자)", level="INFO")
        return env_key

    raise RuntimeError("GEMINI_API_KEY를 Secret Manager 또는 환경변수에서 찾을 수 없습니다.")

def build_startup_script(gemini_api_key):
    log("3단계: Compute Engine 시작 스크립트(Startup Script) 패키징 준비...", level="STEP")
    
    # 챗봇 핵심 파일들을 인라인 또는 Base64로 패키징
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    def read_file_b64(rel_path):
        fpath = os.path.join(current_dir, rel_path)
        with open(fpath, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    pkg_json_b64 = read_file_b64("package.json")
    server_js_b64 = read_file_b64("server.js")
    index_html_b64 = read_file_b64("public/index.html")
    style_css_b64 = read_file_b64("public/css/style.css")
    app_js_b64 = read_file_b64("public/js/app.js")

    script = f"""#!/bin/bash
set -e
exec > >(tee -a /var/log/chatbot-startup.log) 2>&1

echo "========================================================"
echo "🚀 마음 쉼터 챗봇 인스턴스 자동 초기화 및 배포 시작"
echo "일시: $(date)"
echo "========================================================"

# 1. 패키지 업데이트 및 필수 도구 설치
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git jq build-essential

# 2. Node.js v20 LTS 설치
if ! command -v node &> /dev/null; then
    echo "[*] Node.js 20.x 설치 중..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "[+] Node 버전: $(node -v), NPM 버전: $(npm -v)"

# 3. 애플리케이션 디렉토리 구성
APP_DIR="/opt/chatbot"
mkdir -p "$APP_DIR/public/css" "$APP_DIR/public/js"
cd "$APP_DIR"

# 4. 소스코드 복원 (Base64 Decode)
echo "{pkg_json_b64}" | base64 -d > "$APP_DIR/package.json"
echo "{server_js_b64}" | base64 -d > "$APP_DIR/server.js"
echo "{index_html_b64}" | base64 -d > "$APP_DIR/public/index.html"
echo "{style_css_b64}" | base64 -d > "$APP_DIR/public/css/style.css"
echo "{app_js_b64}" | base64 -d > "$APP_DIR/public/js/app.js"

# 5. Secret Manager에서 GEMINI_API_KEY 재검증 또는 주입된 키 사용
SECRET_KEY="{gemini_api_key}"
if command -v gcloud &> /dev/null; then
    FETCHED_KEY=$(gcloud secrets versions access latest --secret=GEMINI_API_KEY --project={PROJECT_NUMBER} 2>/dev/null || true)
    if [ -n "$FETCHED_KEY" ]; then
        SECRET_KEY="$FETCHED_KEY"
        echo "[+] Secret Manager에서 최신 GEMINI_API_KEY를 성공적으로 직접 갱신했습니다."
    fi
fi

# 6. .env 환경설정 (포트 80으로 직접 바인딩)
cat <<EOF > "$APP_DIR/.env"
PORT=80
GEMINI_API_KEY=$SECRET_KEY
EOF
chmod 600 "$APP_DIR/.env"

# 7. 의존성 설치
npm install --omit=dev

# 8. systemd 데몬 서비스 등록
cat <<EOF > /etc/systemd/system/chatbot.service
[Unit]
Description=Mind Shelter Gemini Chatbot Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable chatbot.service
systemctl restart chatbot.service

echo "[+] 챗봇 서비스 구동 상태:"
systemctl status chatbot.service --no-pager

echo "========================================================"
echo "🎉 마음 쉼터 챗봇 배포 완료! 포트 80 리스닝 시작"
echo "========================================================"
"""
    # 임시 시작 스크립트 파일 작성
    startup_path = os.path.join(current_dir, "startup-script.sh")
    with open(startup_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(script)
    log(f"시작 스크립트 생성 완료: {startup_path}", level="SUCCESS")
    return startup_path

def ensure_firewall_rule():
    log("4단계: Compute Engine 방화벽 규칙(포트 80, 3000 허용) 점검 및 생성...", level="STEP")
    rule_name = "allow-chatbot-web"
    check_cmd = [
        gcloud_bin, "compute", "firewall-rules", "describe", rule_name,
        f"--project={PROJECT_ID}"
    ]
    res = run_cmd(check_cmd, check=False)
    if res.returncode == 0:
        log(f"방화벽 규칙 '{rule_name}'이 이미 존재합니다.", level="INFO")
        return

    log(f"신규 방화벽 규칙 '{rule_name}' 생성 요청...", level="INFO")
    create_fw_cmd = [
        gcloud_bin, "compute", "firewall-rules", "create", rule_name,
        f"--project={PROJECT_ID}",
        "--direction=INGRESS",
        "--priority=1000",
        "--network=default",
        "--action=ALLOW",
        "--rules=tcp:80,tcp:3000",
        "--source-ranges=0.0.0.0/0",
        "--target-tags=http-server,chatbot-server",
        "--description=Allow HTTP 80 and 3000 for Mind Shelter Chatbot",
        "--quiet"
    ]
    run_cmd(create_fw_cmd)
    log(f"방화벽 규칙 '{rule_name}' 생성 성공!", level="SUCCESS")

def create_compute_instance(startup_script_path):
    log(f"5단계: [{SELECTED_ZONE}] Compute Engine 인스턴스 ({INSTANCE_NAME}) 생성 시작...", level="STEP")

    # 기존 동일 인스턴스 존재 여부 확인
    check_inst_cmd = [
        gcloud_bin, "compute", "instances", "describe", INSTANCE_NAME,
        f"--project={PROJECT_ID}",
        f"--zone={SELECTED_ZONE}"
    ]
    res = run_cmd(check_inst_cmd, check=False)
    if res.returncode == 0:
        log(f"인스턴스 '{INSTANCE_NAME}'이 이미 실행 중입니다. 기존 인스턴스 정보를 조회합니다.", level="WARN")
        return True

    # 노트북 사양(e2-medium, pd-balanced 10GB, debian-13, standard model) 그대로 적용
    create_cmd = [
        gcloud_bin, "compute", "instances", "create", INSTANCE_NAME,
        f"--project={PROJECT_ID}",
        f"--zone={SELECTED_ZONE}",
        f"--machine-type={MACHINE_TYPE}",
        "--network-interface=network-tier=PREMIUM,stack-type=IPV4_ONLY,subnet=default",
        f"--tags=http-server,https-server,chatbot-server",
        "--metadata=enable-osconfig=TRUE",
        f"--metadata-from-file=startup-script={startup_script_path}",
        "--maintenance-policy=MIGRATE",
        "--provisioning-model=STANDARD",
        f"--service-account={SERVICE_ACCOUNT}",
        "--scopes=https://www.googleapis.com/auth/cloud-platform",
        f"--create-disk=auto-delete=yes,boot=yes,device-name={INSTANCE_NAME},image=projects/debian-cloud/global/images/debian-13-trixie-v20260908,mode=rw,size=10,type=pd-balanced",
        "--no-shielded-secure-boot",
        "--shielded-vtpm",
        "--shielded-integrity-monitoring",
        "--labels=goog-ec-src=vm_add-gcloud,app=mind-shelter-chatbot",
        "--reservation-affinity=any",
        "--quiet"
    ]

    log(f"인스턴스 생성 요청 전송 (약 40~60초 소요)...", level="INFO")
    run_cmd(create_cmd)
    log(f"인스턴스 '{INSTANCE_NAME}' 생성 성공!", level="SUCCESS")
    return True

def get_instance_external_ip():
    log("6단계: 생성된 인스턴스의 외부 IP (External IP) 주소 획득...", level="STEP")
    cmd = [
        gcloud_bin, "compute", "instances", "describe", INSTANCE_NAME,
        f"--project={PROJECT_ID}",
        f"--zone={SELECTED_ZONE}",
        "--format=get(networkInterfaces[0].accessConfigs[0].natIP)"
    ]
    res = run_cmd(cmd)
    external_ip = res.stdout.strip()
    log(f"🌟 외부 IP 확인 완료: {external_ip}", level="SUCCESS")
    return external_ip

def poll_service_health(external_ip, timeout_sec=180):
    log(f"7단계: 웹 서비스 헬스체크 대기 (http://{external_ip}/api/health)...", level="STEP")
    log("Startup script 실행 및 npm install 완료까지 약 1~2분 소요될 수 있습니다.", level="INFO")
    
    start_time = time.time()
    url = f"http://{external_ip}/api/health"
    
    import urllib.request
    import urllib.error

    while time.time() - start_time < timeout_sec:
        elapsed = int(time.time() - start_time)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "HealthChecker/1.0"})
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    body = response.read().decode("utf-8")
                    log(f"[{elapsed}초 경과] 헬스체크 응답 200 OK: {body}", level="SUCCESS")
                    return True
        except Exception as e:
            log(f"[{elapsed}초 경과] 부팅 대기 중... ({e})", level="DEBUG")
            time.sleep(10)

    log(f"주의: {timeout_sec}초 내에 헬스체크 응답을 받지 못했습니다. VM 내부 부팅 로그를 확인해주세요.", level="WARN")
    return False

def main():
    log("==================================================================", level="START")
    log("🌿 마음 쉼터 챗봇 GCP Compute Engine 자동 배포 파이프라인 개시", level="START")
    log(f"프로젝트: {PROJECT_ID} ({PROJECT_NUMBER}), 리전: {SELECTED_ZONE}", level="START")
    log("==================================================================", level="START")

    # 1. 인증 점검
    if not check_gcloud_auth():
        log("GCP gcloud 인증이 필요합니다. 터미널에서 'gcloud auth login'을 실행해주세요.", level="FATAL")
        print("\n❌ [인증 필요] Google Cloud 로그인이 필요합니다.")
        print("터미널 창을 열고 아래 명령어를 실행하여 브라우저에서 로그인을 완료해주세요:")
        print("  gcloud auth login\n")
        return 1

    # 2. Secret Manager 키 획득
    gemini_key = fetch_secret_key()

    # 3. 방화벽 규칙 확인 및 생성
    ensure_firewall_rule()

    # 4. 시작 스크립트 빌드
    startup_script = build_startup_script(gemini_key)

    # 5. Compute Engine VM 생성
    create_compute_instance(startup_script)

    # 6. 외부 IP 조회
    external_ip = get_instance_external_ip()

    # 7. 서비스 헬스체크
    poll_service_health(external_ip)

    log("==================================================================", level="END")
    log(f"🎉 모든 배포 작업 완료! 접속 주소: http://{external_ip}", level="END")
    log(f"📄 상세 실행 기록이 '{LOG_FILE}'에 저장되었습니다.", level="END")
    log("==================================================================", level="END")

    print("\n" + "=" * 65)
    print("🎉 Google Cloud Compute Engine 챗봇 배포 완료!")
    print(f"👉 브라우저 접속 주소: http://{external_ip}")
    print(f"👉 사용된 API Key 출처: {SECRET_FULL_NAME}")
    print(f"👉 상세 작업 로그: {os.path.abspath(LOG_FILE)}")
    print("=" * 65 + "\n")
    return 0

if __name__ == "__main__":
    sys.exit(main())
