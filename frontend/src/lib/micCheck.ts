export type MicCheckResult =
  | { ok: true; deviceLabel: string }
  | {
      ok: false;
      reason: 'unsupported' | 'denied' | 'no-device' | 'silent' | 'unknown';
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

    if (peak <= 0.0001) {
      return {
        ok: false,
        reason: 'silent',
        message: `마이크(${deviceLabel || '기본 입력'})에서 소리가 전혀 들어오지 않습니다. ${CLAMSHELL_HINT}`,
      };
    }
    return { ok: true, deviceLabel };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    void audioContext?.close();
  }
}
