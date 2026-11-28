<div align="center">
  <img alt="OpenJarvis" src="assets/OpenJarvis_Horizontal_Logo.png" width="400">

  <h3>OpenJarvis 커스텀 버전</h3>

  <p><i>Stanford의 OpenJarvis를 기반으로 개인용으로 커스텀한 로컬 AI 비서</i></p>

  <p>
    <img src="https://img.shields.io/badge/python-3.11%E2%80%933.13-blue" alt="Python">
    <img src="https://img.shields.io/badge/node-%3E%3D22-green" alt="Node">
    <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License">
    <a href="https://github.com/open-jarvis/OpenJarvis"><img src="https://img.shields.io/badge/upstream-open--jarvis%2FOpenJarvis-black?logo=github" alt="Upstream"></a>
  </p>
</div>

---

> [!NOTE]
> 이 저장소는 **공식 OpenJarvis 저장소가 아닙니다.**
> Stanford Hazy Research / Scaling Intelligence Lab에서 만든 [OpenJarvis](https://github.com/open-jarvis/OpenJarvis)를 가져와 개인적으로 수정한 포크입니다.
> 원본 프로젝트의 정보는 아래 [출처](#출처)를 참고하세요.

> [!IMPORTANT]
> **이용 안내**
> - 이 커스텀 버전을 쓰려면 이 저장소를 클론하세요: `https://github.com/Choi-jeonghoon/Jarvis_custom.git`
> - **로컬 LLM(Ollama 등)의 설치와 모델 설정은 원본 [OpenJarvis 공식 문서](https://open-jarvis.github.io/OpenJarvis/)를 보고 직접 진행해 주세요.** 이 저장소는 로컬 LLM 설정을 따로 안내하거나 지원하지 않습니다.
> - 이 저장소의 코드나 디자인을 가져다 쓸 때는 **출처(이 저장소 주소)를 꼭 표기해 주세요.** 원본 OpenJarvis의 출처와 라이선스 표기도 함께 유지해야 합니다. 자세한 내용은 [출처](#출처)를 참고하세요.

<div align="center">
  <img alt="금색 홀로그램 구체 위에 자비스의 답변이 한 문장씩 자막으로 떠 있는 메인 화면" src="docs/images/jarvis-main.jpg" width="90%">
  <p><sub>메인 화면: 자비스가 답변을 한 문장씩 말하면서 구체 위에 자막으로 띄웁니다</sub></p>
</div>

<table align="center">
  <tr>
    <td align="center" width="50%">
      <img alt="질문을 처리하는 동안 주황색으로 바뀌어 숨쉬듯 움직이는 구체" src="docs/images/jarvis-thinking.jpg">
      <sub>생각 중: 구체가 주황색으로 바뀌어 숨쉬듯 움직입니다</sub>
    </td>
    <td align="center" width="50%">
      <img alt="구체 위에 반투명한 대화창으로 전체 답변이 표시된 화면" src="docs/images/jarvis-panel.jpg">
      <sub>대화창: 전체 답변을 보고, 배경 투명도를 조절합니다</sub>
    </td>
  </tr>
</table>

## 소개

OpenJarvis는 로컬 기기에서 먼저 동작하고 필요할 때만 클라우드를 쓰는 개인용 AI 에이전트 프레임워크입니다.
이 저장소에서는 원본을 바탕으로 영화 속 "자비스" 느낌의 UI와 음성 기능을 추가하고 있습니다.

### 커스텀한 부분

| 영역 | 내용 | 주요 파일 |
|---|---|---|
| 홀로그램 구체 | 에너지 코어, 내부 패널, 물결 띠, 흐르는 빛으로 만든 금색 구체. 대기 금색 / 듣기 샴페인 / 생각 주황(숨쉬기) / 답변 금색 | `frontend/src/components/Chat/GoldOrb3D.tsx` |
| 대화창과 자막 | 답변을 대화창(켜기·끄기, 배경 투명도 조절) 또는 한 문장씩 뜨는 자막으로 표시 | `frontend/src/components/Chat/JarvisStage.tsx`, `frontend/src/lib/captions.ts` |
| 화면 구성 | 금색 톤 통일, 대시보드 패널은 사이드바 "시스템 현황" 모달로, 아이패드에서는 사이드바가 서랍 메뉴 | `frontend/src/components/CommandCenter/`, `frontend/src/components/Sidebar/` |
| 음성 대화 | "헬로 자비스" → 영어 인사("Welcome back, sir") → 질문하면 현재 화면에 글로 표시하면서 음성으로 답변 (팝업 없음) | `frontend/src/components/Chat/VoiceConversation.tsx`, `frontend/src/lib/voice.ts` |
| 자비스 목소리 | 무료 Microsoft Edge 뉴럴 음성. 답변은 한국어 남성 "InJoon", 인사는 영국 남성 "Ryan" (키 불필요, 인터넷 필요). 서버 음성이 안 되면 맥 음성으로 대체 | `src/openjarvis/speech/edge_tts_backend.py`, `~/.openjarvis/config.toml`의 `[speech]`, 설정 → Speech |
| 마이크 상태 표시 | 마이크 연결 문제를 감지해서 표시 | `frontend/src/lib/micCheck.ts` |
| Claude 연결 | Claude AI 사용 토글과 사용량 패널 | `frontend/src/components/CommandCenter/ClaudeToggle.tsx`, `frontend/src/components/ClaudeUsagePanel.tsx`, `src/openjarvis/engine/cloud.py` |
| 박수 호출 (실험용) | 마이크로 박수 두 번을 감지해서 호출 | `clap_wake.py` |

## 설치

### 준비물

| 항목 | 버전 | 비고 |
|---|---|---|
| Python | 3.11 ~ 3.13 | |
| [uv](https://docs.astral.sh/uv/) | 최신 | Python 패키지/가상환경 관리 |
| Node.js / npm | 22 이상 | GUI 프론트엔드 실행에 필요 |
| [Ollama](https://ollama.com/) | 최신 | 로컬 모델 실행 (선택). 설치와 모델 설정은 [원본 공식 문서](https://open-jarvis.github.io/OpenJarvis/)를 따라 직접 진행 |
| Rust | 최신 | Rust 확장을 직접 빌드할 때만 필요 (선택) |

macOS 기준 설치 예시:

```bash
brew install uv node ollama
```

### 설치 순서

```bash
# 1. 저장소 받기 (이 커스텀 버전)
git clone https://github.com/Choi-jeonghoon/Jarvis_custom.git openjarvis
cd openjarvis

# 2. Python 의존성 설치 (GUI용 desktop 의존성 포함)
uv sync --extra desktop --extra server

# 3. 프론트엔드 의존성 설치 (안 해도 jarvis gui가 처음 실행할 때 자동으로 설치함)
cd frontend && npm install && cd ..
```

로컬 LLM을 쓰려면 Ollama 설치와 모델 준비를 [원본 OpenJarvis 공식 문서](https://open-jarvis.github.io/OpenJarvis/)를 보고 직접 진행해 주세요.

`jarvis` 명령어를 바로 쓰려면 가상환경을 켜 두세요. 켜지 않았다면 명령어 앞에 `uv run`을 붙이면 됩니다.

```bash
source .venv/bin/activate
```

## 도커로 실행 (추천)

터미널을 매번 열 필요 없이, 도커 컨테이너로 자비스를 항상 켜 둘 수 있습니다.

### 준비물

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- 맥에 설치된 [Ollama](https://ollama.com/) (컨테이너가 맥의 Ollama를 사용합니다. 도커는 맥 GPU를 쓸 수 없어서 이렇게 하는 게 훨씬 빠릅니다.) 설치와 모델 설정은 [원본 공식 문서](https://open-jarvis.github.io/OpenJarvis/)를 따라 직접 진행해 주세요.

### 처음 한 번

```bash
cp .env.example .env
# .env 파일을 열어 OPENJARVIS_API_KEY 값 채우기 (생성 명령은 파일 안에 적혀 있음)
# Claude를 쓰려면 ANTHROPIC_API_KEY도 채우기

docker compose up -d --build
```

브라우저에서 **http://localhost:8000** 으로 접속하면 됩니다.

### 자동 실행 설정

`docker-compose.yml`에 `restart: unless-stopped`가 설정되어 있어서, Docker Desktop이 켜지면 자비스도 자동으로 켜집니다.
Docker Desktop의 **Settings > General > Start Docker Desktop when you sign in**을 켜 두면 맥에 로그인하기만 해도 자비스가 떠 있습니다.
Ollama 앱도 로그인할 때 자동으로 실행되도록 해 두세요.

### 자주 쓰는 명령어

| 명령어 | 설명 |
|---|---|
| `docker compose up -d` | 실행 |
| `docker compose up -d --build` | 코드를 수정한 뒤 이미지를 다시 빌드해서 실행 |
| `docker compose down` | 종료 (자동 실행도 멈춤) |
| `docker compose logs -f` | 로그 보기 |
| `docker compose ps` | 상태 확인 |

### 참고

- 설정, 대화, 에이전트 데이터는 맥의 `~/.openjarvis` 폴더를 그대로 사용합니다.
- 포트는 `127.0.0.1`에만 열려 있어서 내 맥에서만 접속할 수 있습니다.
- 컨테이너와 `jarvis gui`는 같은 8000 포트를 쓰므로 동시에 실행할 수 없습니다. 하나만 쓰세요.
- 컨테이너 안에서는 맥 전용 기능(Apple Calendar / Notes 연동, `clap_wake.py` 박수 호출)이 동작하지 않습니다. 음성 인식은 브라우저에서 동작하므로 그대로 사용할 수 있습니다.

| 파일 | 내용 |
|---|---|
| `docker-compose.yml` | 개인용 컨테이너 실행 설정 |
| `deploy/docker/Dockerfile` | 이미지 빌드 (프론트엔드 빌드 → Python/Rust 빌드 → 실행 이미지) |
| `.env.example` | 환경변수 예시 (`.env`로 복사해서 사용, git에 올라가지 않음) |
| `.dockerignore` | 빌드할 때 제외할 파일 |

## 직접 실행 (개발할 때)

```bash
jarvis gui
```

이 명령어 하나로 아래 과정이 모두 자동으로 진행됩니다.

1. `frontend/` 폴더와 npm이 있는지 확인
2. 프론트엔드 포트(기본 5173)가 비어 있는지 확인하고, 이전 실행에서 남은 프론트엔드가 있으면 정리
3. `node_modules`가 없으면 `npm install` 실행
4. API 서버 실행: `uv run --extra desktop jarvis start --port 8000` (이미 떠 있는 서버가 있으면 재사용)
5. 프론트엔드 개발 서버 실행: `npm run dev` (Vite)
6. 브라우저에서 `http://127.0.0.1:5173` 열기
7. 5초마다 API 서버 상태를 확인하고, 서버가 죽으면 프론트엔드도 같이 종료

종료하려면 터미널에서 `Ctrl + C`를 누르세요.

### `jarvis gui` 옵션

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--frontend-port <포트>` | `5173` | 프론트엔드(Vite) 개발 서버 포트 |
| `--api-port <포트>` | `8000` | 백엔드 API 서버 포트 |
| `--no-server` | 꺼짐 | API 서버를 켜지 않고 프론트엔드만 실행 (이미 따로 서버를 띄워 둔 경우) |
| `--no-browser` | 꺼짐 | 브라우저를 자동으로 열지 않음 |

예시:

```bash
jarvis gui --frontend-port 3000 --api-port 9000   # 포트 변경
jarvis gui --no-browser                          # 브라우저 자동 실행 끄기
jarvis gui --no-server                           # 프론트엔드만 실행
```

### 기타 명령어

| 명령어 | 설명 |
|---|---|
| `jarvis` | 터미널에서 채팅 시작 |
| `jarvis doctor` | 설치 상태 점검 |
| `jarvis init --preset <이름> --force` | 스타터 프리셋으로 설정 초기화 |
| `jarvis start` / `jarvis stop` | API 서버(데몬)만 켜기 / 끄기 |
| `jarvis --help` | 전체 명령어 목록 보기 |

### 문제 해결

| 증상 | 해결 방법 |
|---|---|
| `Frontend port 5173 is unavailable` | 다른 프로그램이 포트를 쓰고 있음. 그 프로그램을 끄거나 `--frontend-port`로 다른 포트 사용 |
| `Could not start the OpenJarvis API server.` | `~/.openjarvis/server.log` 확인 |
| `Node.js/npm is required` | Node.js 22 이상 설치 |
| `uv is required` | uv 설치 (`brew install uv`) |
| "헬로 자비스"에 반응 없음 | Chrome 사용, 마이크 권한 허용, 설정 → Speech → "헬로 자비스 음성 호출" 켜기. 입력창 아래 상태 문구 확인 |
| 호출은 되는데 소리가 안 남 | 브라우저 정책상 페이지를 한 번 클릭해야 소리가 납니다. 탭을 연 뒤 화면을 한 번 클릭해 두세요 |
| 목소리가 InJoon이 아님 | `/v1/speech/tts/health`가 `edge_tts`인지 확인. 이미지를 `docker compose up -d --build`로 다시 빌드해야 edge-tts가 설치됨 |

## 명령어가 정의된 위치

| 파일 | 내용 |
|---|---|
| `pyproject.toml` | `[project.scripts]`의 `jarvis = "openjarvis.cli:main"`에서 `jarvis` 명령어 등록 |
| `src/openjarvis/cli/__init__.py` | `gui`, `serve`, `start` 같은 하위 명령어 등록 |
| `src/openjarvis/cli/gui_cmd.py` | `jarvis gui`의 실제 동작과 옵션 정의 |
| `frontend/package.json` | 프론트엔드 스크립트 (`dev`, `build`, `test` 등) |
| `Makefile` | 개발용 명령어 (`make setup`, `make test`, `make lint`, `make format`) |

## 원본 저장소 업데이트 반영

원본 OpenJarvis가 업데이트되면 `upstream` 리모트에서 받아와 합칠 수 있습니다.

```bash
git remote add upstream https://github.com/open-jarvis/OpenJarvis.git   # 처음 한 번만
git fetch upstream
git merge upstream/main
```

## 출처

이 프로젝트는 아래 오픈소스 프로젝트를 기반으로 합니다.

- **원본 프로젝트:** [OpenJarvis](https://github.com/open-jarvis/OpenJarvis): *Personal AI, On Personal Devices*
- **개발:** [Hazy Research](https://hazyresearch.stanford.edu/), [Scaling Intelligence Lab](https://scalingintelligence.stanford.edu/), [Stanford SAIL](https://ai.stanford.edu/)
- **프로젝트 사이트:** [openjarvis.stanford.edu](https://openjarvis.stanford.edu/)
- **공식 문서:** [open-jarvis.github.io/OpenJarvis](https://open-jarvis.github.io/OpenJarvis/)
- **논문:** [arXiv:2605.17172](https://arxiv.org/abs/2605.17172)

원본 프로젝트의 기능(스킬, 기본 에이전트, 프리셋 등)에 대한 자세한 설명은 [공식 문서](https://open-jarvis.github.io/OpenJarvis/)를 참고하세요.

### 이 커스텀 버전을 가져다 쓸 때

이 저장소의 코드나 디자인(음성 대화, 홀로그램 구체, 대화창 등)을 사용하거나 수정해서 쓸 때는 출처를 표기해 주세요.
원본 OpenJarvis의 출처와 [라이선스](#라이선스) 표기도 함께 유지해야 합니다.

표기 예시:

```text
이 프로젝트는 JARVIS 커스텀 버전(https://github.com/Choi-jeonghoon/Jarvis_custom)을 기반으로 합니다.
원본: OpenJarvis (https://github.com/open-jarvis/OpenJarvis), Apache License 2.0
```

### 인용

```bibtex
@misc{saadfalcon2026openjarvispersonalaipersonal,
      title={OpenJarvis: Personal AI, On Personal Devices},
      author={Jon Saad-Falcon and Avanika Narayan and Robby Manihani and Tanvir Bhathal and Herumb Shandilya and Hakki Orhun Akengin and Gabriel Bo and Andrew Park and Matthew Hart and Caia Costello and Chuan Li and Christopher Ré and Azalia Mirhoseini},
      year={2026},
      eprint={2605.17172},
      archivePrefix={arXiv},
      primaryClass={cs.LG},
      url={https://arxiv.org/abs/2605.17172},
}
```

## 라이선스

원본 OpenJarvis는 [Apache License 2.0](LICENSE)으로 배포되며, 이 포크도 같은 라이선스를 따릅니다.
원본 대비 수정된 파일은 위 [커스텀한 부분](#커스텀한-부분)과 git 커밋 기록에서 확인할 수 있습니다.
