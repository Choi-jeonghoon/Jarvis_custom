import os
import time

import numpy as np
import sounddevice as sd

# 사용할 마이크 이름 (일부만 써도 됨). 예: JARVIS_MIC="AirPods" python3 clap_wake.py
PREFERRED_MIC = os.environ.get("JARVIS_MIC", "EarPods")


def find_input_device(preferred: str):
    """이름에 preferred가 들어간 입력 장치를 찾는다. 없으면 기본 입력(None).

    장치 번호는 이어폰을 꽂고 빼거나 재부팅하면 바뀌므로 이름으로 찾는다.
    """
    for index, device in enumerate(sd.query_devices()):
        name = device["name"]
        if device["max_input_channels"] > 0 and preferred.lower() in name.lower():
            return index, name
    default = sd.query_devices(kind="input")
    return None, default["name"]


DEVICE, DEVICE_NAME = find_input_device(PREFERRED_MIC)
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
print(f"마이크: {DEVICE_NAME}")
if DEVICE is None:
    print(f"({PREFERRED_MIC} 를 찾지 못해 기본 입력 장치를 사용합니다)")
print("대기 중...")
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
