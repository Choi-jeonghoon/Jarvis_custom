
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  Float32BufferAttribute,
  DynamicDrawUsage,
  Group,
  Points,
} from 'three';

export type ReactorStatus = 'idle' | 'thinking' | 'speaking';

interface SceneProps {
  status: ReactorStatus;
}

interface ArcProps {
  radius: number;
  color: string;
  rotation: [number, number, number];
  speed: number;
  phase: number;
  status: ReactorStatus;
}

/**
 * 3D 수직 에너지 아크
 * 원형 선을 부분적으로 잘라 여러 각도로 회전시킨다.
 * 아크 위에는 움직이는 에너지 입자가 존재한다.
 */
function EnergyArc({
  radius,
  color,
  rotation,
  speed,
  phase,
  status,
}: ArcProps) {
  const group = useRef<Group>(null);
  const spark = useRef<Group>(null);
  const spark2 = useRef<Group>(null);

  const arcLength = Math.PI * 1.72;

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;

    const stateSpeed =
      status === 'thinking'
        ? 2.5
        : status === 'speaking'
          ? 1.65
          : 0.8;

    const angle = time * speed * stateSpeed + phase;

    if (group.current) {
      group.current.rotation.z =
        rotation[2] + Math.sin(time * 0.3 + phase) * 0.08;
    }

    const setSparkPosition = (
      target: Group,
      currentAngle: number,
    ) => {
      const a =
        ((currentAngle % arcLength) + arcLength) % arcLength;

      target.position.set(
        Math.cos(a) * radius,
        Math.sin(a) * radius,
        0,
      );

      const pulse = 1 + Math.sin(time * 9 + phase) * 0.2;
      target.scale.setScalar(pulse);
    };

    if (spark.current) {
      setSparkPosition(spark.current, angle);
    }

    if (spark2.current) {
      setSparkPosition(
        spark2.current,
        -angle * 0.65 + phase + 2,
      );
    }
  });

  return (
    <group rotation={rotation}>
      <group ref={group}>
        {/* 수직 아크 본체 */}
        <mesh>
          <torusGeometry
            args={[radius, 0.008, 8, 150, arcLength]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>

        {/* 아크의 밝은 보조 라인 */}
        <mesh>
          <torusGeometry
            args={[radius, 0.022, 6, 100, arcLength]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.08}
            depthWrite={false}
          />
        </mesh>

        {/* 첫 번째 전류 입자 */}
        <group ref={spark}>
          <mesh>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.075, 12, 12]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.3}
              depthWrite={false}
            />
          </mesh>
        </group>

        {/* 두 번째 전류 입자 */}
        <group ref={spark2}>
          <mesh>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.95}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * 개별적으로 움직이는 미세 입자
 * 입자마다 속도, 궤도, 깊이, 위상이 다르다.
 */
function MovingParticleCloud({
  color,
  status,
}: {
  color: string;
  status: ReactorStatus;
}) {
  const pointsRef = useRef<Points>(null);

  const particleCount = 1500;

  const particleData = useMemo(() => {
    const geometry = new BufferGeometry();

    const positions = new Float32Array(
      particleCount * 3,
    );

    const baseRadius = new Float32Array(particleCount);
    const phase = new Float32Array(particleCount);
    const speed = new Float32Array(particleCount);
    const depth = new Float32Array(particleCount);
    const verticalSpeed = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      baseRadius[i] = 0.5 + Math.random() * 1.8;

      phase[i] = Math.random() * Math.PI * 2;

      speed[i] =
        (0.15 + Math.random() * 0.85) *
        (Math.random() > 0.5 ? 1 : -1);

      depth[i] = 0.15 + Math.random() * 0.85;

      verticalSpeed[i] = 0.5 + Math.random() * 2;

      positions[i * 3] = Math.random() * 0.01;
      positions[i * 3 + 1] = Math.random() * 0.01;
      positions[i * 3 + 2] = Math.random() * 0.01;
    }

    const attribute = new Float32BufferAttribute(
      positions,
      3,
    );

    attribute.setUsage(DynamicDrawUsage);

    geometry.setAttribute('position', attribute);

    return {
      geometry,
      baseRadius,
      phase,
      speed,
      depth,
      verticalSpeed,
    };
  }, []);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;

    const stateSpeed =
      status === 'thinking'
        ? 2.5
        : status === 'speaking'
          ? 1.5
          : 0.7;

    const position = particleData.geometry.getAttribute(
      'position',
    ) as Float32BufferAttribute;

    for (let i = 0; i < particleCount; i++) {
      const angle =
        particleData.phase[i] +
        time * particleData.speed[i] * stateSpeed;

      const radius =
        particleData.baseRadius[i] +
        Math.sin(
          time * particleData.verticalSpeed[i] +
          particleData.phase[i],
        ) * 0.1;

      // 각 입자의 3D 궤도
      const x = Math.cos(angle) * radius;

      const y =
        Math.sin(angle) *
        radius *
        0.72;

      // 깊이 방향으로도 움직이도록 처리
      const z =
        Math.sin(
          angle * 2 + particleData.phase[i],
        ) *
        particleData.depth[i] *
        0.55;

      // 미세한 상하 움직임 추가
      const vertical =
        Math.sin(
          time * particleData.verticalSpeed[i] +
          particleData.phase[i],
        ) * 0.09;

      position.setXYZ(
        i,
        x,
        y + vertical,
        z,
      );
    }

    position.needsUpdate = true;

    if (pointsRef.current) {
      pointsRef.current.rotation.y =
        Math.sin(time * 0.12) * 0.08;

      pointsRef.current.rotation.x =
        Math.cos(time * 0.1) * 0.06;
    }
  });

  return (
    <points
      ref={pointsRef}
      geometry={particleData.geometry}
    >
      <pointsMaterial
        color={color}
        size={0.018}
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/**
 * 작은 빛의 파편들
 * 각 파편이 개별 궤도로 회전한다.
 */
function ElectricFragments({
  color,
  status,
}: {
  color: string;
  status: ReactorStatus;
}) {
  const fragments = useRef<Group>(null);

  const fragmentData = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        radius: 0.7 + Math.random() * 1.9,
        angle: Math.random() * Math.PI * 2,
        speed:
          (0.2 + Math.random() * 1.3) *
          (i % 2 === 0 ? 1 : -1),
        depth: (Math.random() - 0.5) * 1.4,
        size: 0.008 + Math.random() * 0.022,
        phase: Math.random() * Math.PI * 2,
      })),
    [],
  );

  useFrame(({ clock }) => {
    if (!fragments.current) return;

    const time = clock.elapsedTime;

    const stateSpeed =
      status === 'thinking'
        ? 2.5
        : status === 'speaking'
          ? 1.5
          : 0.65;

    fragments.current.children.forEach((child, i) => {
      const data = fragmentData[i];

      const angle =
        data.angle + time * data.speed * stateSpeed;

      const radius =
        data.radius +
        Math.sin(time * 1.5 + data.phase) * 0.08;

      child.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.75,
        data.depth +
          Math.sin(time * 2 + data.phase) * 0.12,
      );

      const pulse =
        0.65 + (Math.sin(time * 4 + data.phase) + 1) * 0.45;

      child.scale.setScalar(pulse);
    });
  });

  return (
    <group ref={fragments}>
      {fragmentData.map((item, i) => (
        <mesh key={i}>
          <sphereGeometry
            args={[item.size, 6, 6]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function ReactorScene({ status }: SceneProps) {
  const outer = useRef<Group>(null);
  const middle = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const ticks = useRef<Group>(null);
  const center = useRef<Group>(null);
  const dataParticles = useRef<Group>(null);

  const isThinking = status === 'thinking';
  const isSpeaking = status === 'speaking';

  const color = isThinking ? '#ff9849' : '#62dfff';
  const secondary = isThinking ? '#ffbd72' : '#a3f3ff';
  const accent = isThinking ? '#ffd08a' : '#f1d66e';

  const tickAngles = useMemo(
    () => Array.from({ length: 100 }, (_, i) => i),
    [],
  );

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;

    const speed = isThinking
      ? 2.2
      : isSpeaking
        ? 1.3
        : 0.45;

    if (outer.current) {
      outer.current.rotation.z = time * 0.12 * speed;
      outer.current.rotation.x =
        Math.sin(time * 0.16) * 0.1;
    }

    if (middle.current) {
      middle.current.rotation.z = -time * 0.2 * speed;
      middle.current.rotation.y =
        Math.PI / 2 + Math.sin(time * 0.2) * 0.12;
    }

    if (inner.current) {
      inner.current.rotation.z = time * 0.3 * speed;
      inner.current.rotation.x =
        Math.sin(time * 0.25) * 0.08;
    }

    if (ticks.current) {
      ticks.current.rotation.z = -time * 0.035 * speed;
    }

    if (center.current) {
      const pulseSpeed = isThinking
        ? 5.5
        : isSpeaking
          ? 3.5
          : 2;

      const pulse =
        1 +
        Math.sin(time * pulseSpeed) *
          (isThinking ? 0.065 : 0.04);

      center.current.scale.setScalar(pulse);
      center.current.rotation.z = -time * 0.08;
      center.current.rotation.y =
        Math.sin(time * 0.4) * 0.12;
    }

    if (dataParticles.current) {
      dataParticles.current.rotation.z =
        time * 0.1 * speed;

      dataParticles.current.rotation.x =
        Math.sin(time * 0.18) * 0.12;

      dataParticles.current.rotation.y =
        Math.cos(time * 0.15) * 0.15;
    }
  });

  return (
    <group>
      {/* 외부 데이터 링 */}
      <group ref={outer}>
        <mesh>
          <torusGeometry args={[2.05, 0.012, 8, 220]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.85}
          />
        </mesh>

        {Array.from({ length: 8 }, (_, i) => (
          <mesh
            key={i}
            rotation={[0, 0, (Math.PI * 2 * i) / 8]}
          >
            <torusGeometry
              args={[1.91, 0.045, 8, 45, Math.PI * 0.16]}
            />
            <meshBasicMaterial
              color={i % 3 === 0 ? accent : color}
              transparent
              opacity={0.85}
            />
          </mesh>
        ))}
      </group>

      {/* 중간 회전 링 */}
      <group ref={middle}>
        <mesh>
          <torusGeometry args={[1.56, 0.018, 8, 180]} />
          <meshBasicMaterial
            color={secondary}
            transparent
            opacity={0.75}
          />
        </mesh>

        {Array.from({ length: 5 }, (_, i) => (
          <mesh
            key={i}
            rotation={[0, 0, (Math.PI * 2 * i) / 5]}
          >
            <torusGeometry
              args={[1.42, 0.035, 8, 42, Math.PI * 0.22]}
            />
            <meshBasicMaterial
              color={i === 1 ? accent : color}
              transparent
              opacity={0.8}
            />
          </mesh>
        ))}
      </group>

      {/* 내부 회전 링 */}
      <group ref={inner}>
        <mesh>
          <torusGeometry args={[1.08, 0.012, 8, 160]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.8}
          />
        </mesh>

        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.92, 0.009, 8, 140]} />
          <meshBasicMaterial
            color={secondary}
            transparent
            opacity={0.7}
          />
        </mesh>

        <mesh rotation={[0, 0, Math.PI * 0.8]}>
          <torusGeometry
            args={[0.78, 0.022, 8, 100, Math.PI * 1.25]}
          />
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={0.8}
          />
        </mesh>
      </group>

      {/* 방사형 눈금 */}
      <group ref={ticks}>
        {tickAngles.map((index) => {
          const angle = (index / 100) * Math.PI * 2;
          const radius = 1.78;
          const major = index % 5 === 0;

          return (
            <mesh
              key={index}
              position={[
                Math.cos(angle) * radius,
                Math.sin(angle) * radius,
                0.02,
              ]}
              rotation={[0, 0, angle]}
            >
              <boxGeometry
                args={[
                  major ? 0.09 : 0.035,
                  major ? 0.012 : 0.007,
                  0.008,
                ]}
              />
              <meshBasicMaterial
                color={major ? accent : secondary}
                transparent
                opacity={major ? 0.95 : 0.5}
              />
            </mesh>
          );
        })}
      </group>

      {/* ==================================
          수직 3D 아크 에너지 시스템
      ================================== */}

      <EnergyArc
        radius={1.85}
        color={secondary}
        rotation={[Math.PI / 2, 0.2, 0]}
        speed={1}
        phase={0}
        status={status}
      />

      <EnergyArc
        radius={1.7}
        color={color}
        rotation={[Math.PI / 2, 0.9, 0.8]}
        speed={-1.2}
        phase={1.5}
        status={status}
      />

      <EnergyArc
        radius={1.55}
        color={accent}
        rotation={[0.7, Math.PI / 2, 0.5]}
        speed={1.4}
        phase={2.5}
        status={status}
      />

      <EnergyArc
        radius={1.35}
        color={secondary}
        rotation={[1.1, 0.5, Math.PI / 2]}
        speed={-1.6}
        phase={3.5}
        status={status}
      />

      <EnergyArc
        radius={1.15}
        color={color}
        rotation={[0.4, 1.2, 1]}
        speed={1.8}
        phase={4.5}
        status={status}
      />

      <EnergyArc
        radius={2.05}
        color={secondary}
        rotation={[1.8, 0.4, 0.6]}
        speed={-0.8}
        phase={5.1}
        status={status}
      />

      {/* 개별적으로 움직이는 미세 입자 1500개 */}
      <MovingParticleCloud
        color={secondary}
        status={status}
      />

      {/* 추가 전기 파편 90개 */}
      <ElectricFragments
        color={color}
        status={status}
      />

      {/* 외부 데이터 입자 */}
      <group ref={dataParticles}>
        {Array.from({ length: 24 }, (_, i) => {
          const angle = (i / 24) * Math.PI * 2;
          const radius = 2.22 + (i % 3) * 0.08;

          return (
            <mesh
              key={i}
              position={[
                Math.cos(angle) * radius,
                Math.sin(angle) * radius,
                Math.sin(angle * 3) * 0.12,
              ]}
            >
              <sphereGeometry
                args={[
                  i % 4 === 0 ? 0.022 : 0.012,
                  8,
                  8,
                ]}
              />
              <meshBasicMaterial
                color={i % 5 === 0 ? accent : secondary}
              />
            </mesh>
          );
        })}
      </group>

      {/* 중앙 AI 코어 */}
      <group ref={center}>
        <mesh>
          <sphereGeometry args={[0.12, 32, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.95}
          />
        </mesh>

        <mesh>
          <sphereGeometry args={[0.18, 24, 24]} />
          <meshBasicMaterial
            color={secondary}
            transparent
            opacity={0.2}
            depthWrite={false}
          />
        </mesh>

        <mesh>
          <sphereGeometry args={[0.22, 24, 24]} />
          <meshBasicMaterial
            color={secondary}
            wireframe
            transparent
            opacity={0.42}
          />
        </mesh>
      </group>
    </group>
  );
}

interface JarvisReactor3DProps {
  status: ReactorStatus;
}

export function JarvisReactor3D({
  status,
}: JarvisReactor3DProps) {
  return (
    <div
      className="jarvis-reactor-3d"
      data-state={status}
      aria-label="JARVIS holographic AI interface"
    >
      <Canvas
        camera={{ position: [0, 0, 6.2], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        }}
      >
        <ReactorScene status={status} />
      </Canvas>
    </div>
  );
}