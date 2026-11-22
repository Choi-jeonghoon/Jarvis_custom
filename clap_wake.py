import sounddevice as sd
import numpy as np
import time

DEVICE = 3
RATE = 16000
BLOCK_SIZE = 256

CLAP_THRESHOLD = 0.025
MIN_INTERVAL = 0.20
MAX_INTERVAL = 0.80
COOLDOWN = 3.0

last_clap = 0
last_activation = 0

def callback(indata, frames, time_info, status):
    global last_clap, last_activation

    now = time.monotonic()
    peak = float(np.max(np.abs(indata)))

    if peak < CLAP_THRESHOLD:
        return

    if now - last_activation < COOLDOWN:
        return

    if now - last_clap < MIN_INTERVAL:
        return

    if now - last_clap <= MAX_INTERVAL:
        print("\n[JARVIS ACTIVATED] 박수 두 번 감지!")
        print("네, 말씀하세요.")
        last_activation = now
        last_clap = 0
    else:
        last_clap = now
        print("\n[CLAP 1/2] 첫 번째 박수 감지")

print("================================")
print("       JARVIS WAKE LISTENER")
print("================================")
print("EarPods 마이크 대기 중...")
print("박수를 두 번 쳐보세요.")
print("종료: Ctrl + C\n")

try:
    with sd.InputStream(
        device=DEVICE,
        samplerate=RATE,
        channels=1,
        blocksize=BLOCK_SIZE,
        callback=callback
    ):
        while True:
            time.sleep(0.1)

except KeyboardInterrupt:
    print("\n자비스 대기 종료")
