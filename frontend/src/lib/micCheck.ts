export type MicCheckResult =
  /**
   * `silent`: the device opened but sent no sound during the check. Not a
   * failure: digital mics (USB EarPods, …) send exact zeros in a quiet room.
   * Only worth a warning when it is the built-in mic (lid closed = it's off).
   */
  | { ok: true; deviceLabel: string; silent?: boolean }
  | {
      ok: false;
      reason: 'unsupported' | 'denied' | 'system-denied' | 'no-device' | 'unknown';
      message: string;
    };

const CLAMSHELL_HINT =
  '맥북 덮개를 닫은(클램쉘) 상태에서는 내장 마이크가 꺼집니다. AirPods·EarPods·USB 마이크·웹캠 마이크 등 외부 마이크를 연결하거나, 텍스트 입력을 사용하세요.';

/**
 * 마이크가 실제로 소리를 받아오는지 확인한다.
 * 클램쉘 모드의 맥북은 내장 마이크가 "기본 입력 장치"로 남아 있어 getUserMedia는
 * 성공하지만, 하드웨어가 꺼져 완전한 무음(0)만 들어온다. 이를 감지한다.
 */
export async function checkMicrophone(sampleMs = 1200): Promise<MicCheckResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'unsupported', message: '이 브라우저는 마이크를 지원하지 않습니다.' };
  }

  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    // Chrome says "Permission denied by system" when the site is allowed but
    // macOS itself blocks the browser (System Settings → Privacy → Microphone).
    // That permission is often reset by macOS or browser updates.
    if (name === 'NotAllowedError' && /system/i.test((err as DOMException).message)) {
      return {
        ok: false,
        reason: 'system-denied',
        message: 'macOS가 브라우저의 마이크 사용을 막고 있습니다. 시스템 설정 → 개인정보 보호 및 보안 → 마이크에서 사용 중인 브라우저를 켜 주세요.',
      };
    }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return {
        ok: false,
        reason: 'denied',
        message: '마이크 권한이 차단되었습니다. 브라우저 또는 시스템 설정에서 마이크를 허용해 주세요.',
      };
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
      return { ok: false, reason: 'no-device', message: `사용 가능한 마이크가 없습니다. ${CLAMSHELL_HINT}` };
    }
    return { ok: false, reason: 'unknown', message: '마이크를 시작할 수 없습니다.' };
  }

  try {
    const track = stream.getAudioTracks()[0];
    const deviceLabel = track?.label ?? '';

    audioContext = new AudioContext();
    if (audioContext.state === 'suspended') {
      try { await audioContext.resume(); } catch {}
    }
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    let peak = 0;
    const deadline = Date.now() + sampleMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 60));
      analyser.getFloatTimeDomainData(samples);
      for (const s of samples) {
        const v = Math.abs(s);
        if (v > peak) peak = v;
      }
      if (peak > 0.0001) break; // 실제 소리(잡음 포함)가 들어오면 정상
    }

    // AudioContext가 일시정지 상태라 측정을 못 했다면 판단을 보류하고 통과시킨다.
    if (audioContext.state !== 'running') return { ok: true, deviceLabel };

    return { ok: true, deviceLabel, silent: peak <= 0.0001 };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    void audioContext?.close();
  }
}
