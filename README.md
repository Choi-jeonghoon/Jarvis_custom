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

<div align="center">
  <img alt="JARVIS Command Center 화면" src="docs/images/openjarvis-design.png" width="90%">
  <p><sub>JARVIS Command Center: <code>jarvis gui</code> 실행 화면</sub></p>
</div>

## 소개

OpenJarvis는 로컬 기기에서 먼저 동작하고 필요할 때만 클라우드를 쓰는 개인용 AI 에이전트 프레임워크입니다.
이 저장소에서는 원본을 바탕으로 영화 속 "자비스" 느낌의 UI와 음성 기능을 추가하고 있습니다.

### 커스텀한 부분

| 영역 | 내용 | 주요 파일 |
|---|---|---|
| 자비스 HUD UI | 3D 리액터와 HUD 스타일의 메인 화면, 커맨드 센터 | `frontend/src/components/Chat/JarvisReactor3D.tsx`, `frontend/src/components/CommandCenter/` |
| 음성 / 호출어 | 음성 인식, 호출어로 비서 깨우기 | `frontend/src/hooks/useSpeech.ts`, `frontend/src/components/Chat/WakeAssistant.tsx` |
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
| [Ollama](https://ollama.com/) | 최신 | 로컬 모델 실행 (선택, 로컬 모델을 쓸 때) |
| Rust | 최신 | Rust 확장을 직접 빌드할 때만 필요 (선택) |

macOS 기준 설치 예시:

```bash
brew install uv node ollama
```

### 설치 순서

```bash
# 1. 저장소 받기
git clone https://github.com/Choi-jeonghoon/AI-.git openjarvis
cd openjarvis

# 2. Python 의존성 설치 (GUI용 desktop 의존성 포함)
uv sync --extra desktop --extra server

# 3. 프론트엔드 의존성 설치 (안 해도 jarvis gui가 처음 실행할 때 자동으로 설치함)
cd frontend && npm install && cd ..

# 4. (선택) 로컬 모델 받기
ollama pull <모델명>    # 예: ollama pull qwen3:8b
```

`jarvis` 명령어를 바로 쓰려면 가상환경을 켜 두세요. 켜지 않았다면 명령어 앞에 `uv run`을 붙이면 됩니다.

```bash
source .venv/bin/activate
```

## 실행

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
