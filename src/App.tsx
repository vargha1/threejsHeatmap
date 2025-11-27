import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface RackData {
  pos: [number, number, number];
  size: [number, number, number];
}

interface HeatSource {
  pos: [number, number, number];
  intensity: number;
}

interface RackWithHeat extends RackData {
  heat: number;
  normalizedHeat: number;
}

export default function App() {
  const [racks, setRacks] = useState<RackData[]>([]);
  const [heatSources, setHeatSources] = useState<HeatSource[]>([]);
  const [activeRack, setActiveRack] = useState<RackWithHeat | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Simulated backend response
    const fakeResponse = {
      data: Array.from({ length: 40 }).map(() => ({
        pos: [
          Math.floor(Math.random() * 15 - 5),
          0.5,
          Math.floor(Math.random() * 15 - 5),
        ] as [number, number, number],
        size: [1, 1, 1] as [number, number, number],
      })),
      heatMap: [
        { pos: [5, 0, 5] as [number, number, number], intensity: 28 },
        { pos: [-3, 0, 0] as [number, number, number], intensity: 12 },
        { pos: [-20, 0, 0] as [number, number, number], intensity: 42 },
      ],
    };

    setTimeout(() => {
      setRacks(fakeResponse.data);
      setHeatSources(fakeResponse.heatMap);
    }, 500);
  }, []);

  const { racksWithHeat, maxHeat } = useMemo(() => {
    if (racks.length === 0 || heatSources.length === 0)
      return { racksWithHeat: [], maxHeat: 1 };
    const withHeat = racks.map((rack) => {
      const totalHeat =
        heatSources.reduce((acc, src) => {
          const d = distance(rack.pos, src.pos);
          const radius = Math.max(1, Math.sqrt(src.intensity));
          const falloff =
            src.intensity * Math.exp(-(d * d) / (2 * radius * radius * 2));
          return acc + falloff;
        }, 0) * 3; // amplify for visualization
      return { ...rack, heat: totalHeat };
    });

    const maxHeat = Math.max(...withHeat.map((r) => r.heat)) || 1;
    const racksWithHeat = withHeat.map((r) => ({
      ...r,
      normalizedHeat: r.heat / maxHeat, // linear
    }));
    return { racksWithHeat, maxHeat };
  }, [racks, heatSources]);

  const floorHeat = useMemo(() => {
    const segments = 50;
    const geometry = new THREE.PlaneGeometry(50, 50, segments, segments);
    const positions = geometry.attributes.position.array as Float32Array;
    const heatValues = new Float32Array((segments + 1) * (segments + 1));

    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        const idx = i * (segments + 1) + j;
        const x = positions[idx * 3];
        const z = -positions[idx * 3 + 1]; // World z = -local y
        const pos: [number, number, number] = [x, 0, z];

        const totalHeat =
          heatSources.reduce((acc, src) => {
            const d = distance(pos, src.pos);
            const radius = Math.max(1, Math.sqrt(src.intensity));
            const falloff =
              src.intensity * Math.exp(-(d * d) / (2 * radius * radius * 2));
            return acc + falloff;
          }, 0) * 3;

        heatValues[idx] = totalHeat / maxHeat;
      }
    }

    geometry.setAttribute("heat", new THREE.BufferAttribute(heatValues, 1));
    return geometry;
  }, [heatSources, maxHeat]);

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className="w-screen h-screen bg-gray-900 relative"
      onMouseMove={handleMouseMove}
    >
      <Canvas camera={{ position: [10, 10, 15], fov: 60 }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <OrbitControls
            enablePan={false}
            maxDistance={35}
            minDistance={10}
            rotateSpeed={0.45}
            dampingFactor={0.4}
          />
          <Environment files={"/threeEnvs/forest_slope_1k.hdr"} />

          {/* Floor with heat-based gradient */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
            <primitive object={floorHeat} attach="geometry" />
            <shaderMaterial
              vertexShader={`
                varying vec2 vUv;
                varying float vHeat;
                attribute float heat;
                void main() {
                  vUv = uv;
                  vHeat = heat;
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
              `}
              fragmentShader={`
                varying vec2 vUv;
                varying float vHeat;

                vec3 getHeatColor(float value) {
                  if (value <= 0.25) {
                    return mix(vec3(0.0, 0.69, 0.31), vec3(0.42, 0.98, 0.22), value / 0.25);
                  } else if (value <= 0.5) {
                    return mix(vec3(0.42, 0.98, 0.22), vec3(1.0, 1.0, 0.0), (value - 0.25) / 0.25);
                  } else if (value <= 0.75) {
                    return mix(vec3(1.0, 1.0, 0.0), vec3(0.98, 0.53, 0.03), (value - 0.5) / 0.25);
                  } else {
                    return mix(vec3(0.98, 0.53, 0.03), vec3(1.0, 0.0, 0.0), (value - 0.75) / 0.25);
                  }
                }

                void main() {
                  gl_FragColor = vec4(getHeatColor(vHeat), 1.0);
                }
              `}
            />
          </mesh>

          {/* Heat sources visualization */}
          {heatSources.map((src, i) => {
            const radius = Math.max(2, Math.sqrt(src.intensity)); // visualize spread
            return (
              <mesh key={i} position={src.pos}>
                <sphereGeometry
                  args={[
                    radius,
                    32,
                    128,
                    0,
                    Math.PI * 2,
                    Math.PI * 2,
                    Math.PI / 2,
                  ]}
                />
                <meshBasicMaterial color="red" opacity={0.1} transparent />
              </mesh>
            );
          })}

          {/* Racks */}
          {racksWithHeat.map((rack, i) => (
            <Rack
              key={i}
              {...rack}
              onClick={() =>
                setActiveRack((prev) => (prev === rack ? null : rack))
              }
              onMouseOut={() => setActiveRack(null)}
            />
          ))}
        </Suspense>
      </Canvas>

      {/* Tooltip */}
      {activeRack && (
        <div
          ref={tooltipRef}
          className="absolute bg-gray-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg pointer-events-none"
          style={{
            top: (() => {
              const tooltipHeight = tooltipRef.current?.offsetHeight || 40; // fallback height
              return Math.min(
                mousePos.y + 15,
                window.innerHeight - tooltipHeight - 10
              );
            })(),
            left: (() => {
              const tooltipWidth = tooltipRef.current?.offsetWidth || 150; // fallback width
              return Math.min(
                mousePos.x + 15,
                window.innerWidth - tooltipWidth - 10
              );
            })(),
          }}
        >
          <div className="font-bold mb-1">Rack</div>
          <div>Pos: [{activeRack.pos.map((v) => v.toFixed(1)).join(", ")}]</div>
          <div>Heat: {activeRack.normalizedHeat.toFixed(2)}</div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-5 left-5 text-white">
        <div className="mb-1 text-sm font-semibold">Heat Legend</div>
        <div
          className="w-40 h-4 rounded-full"
          style={{
            background:
              "linear-gradient(to right, #00B050 0%, #6BFA38 25%, #FFFF00 50%, #F98607 75%, #FF0000 100%)",
          }}
        />
        <div className="flex justify-between text-xs mt-1">
          <span>Cold</span>
          <span>Hot</span>
        </div>
      </div>
    </div>
  );
}

interface RackProps extends RackWithHeat {
  onClick: (isOpen: boolean) => void;
  onMouseOut: () => void;
}

function Rack({ pos, size, normalizedHeat, onClick, onMouseOut }: RackProps) {
  const color = getHeatColor(normalizedHeat);

  return (
    <mesh
      position={pos}
      onClick={() => onClick(true)} // always tell parent to open this rack
      onPointerOut={onMouseOut} // always tell parent to hide
    >
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Helpers
function distance(a: [number, number, number], b: [number, number, number]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Gradient: green → yellow → red
function getHeatColor(value: number) {
  const color = new THREE.Color();
  const normalizedValue = Math.max(0, Math.min(1, value)); // Ensure value is between 0 and 1

  if (normalizedValue <= 0.25) {
    // 0% to 25% (5°C to 15°C): #00B050 to #6BFA38
    const t = normalizedValue / 0.25;
    color.lerpColors(new THREE.Color(0x00b050), new THREE.Color(0x6bfa38), t);
  } else if (normalizedValue <= 0.5) {
    // 25% to 50% (15°C to 30°C): #6BFA38 to #FFFF00
    const t = (normalizedValue - 0.25) / 0.25;
    color.lerpColors(new THREE.Color(0x6bfa38), new THREE.Color(0xffff00), t);
  } else if (normalizedValue <= 0.75) {
    // 50% to 75% (30°C to 35°C): #FFFF00 to #F98607
    const t = (normalizedValue - 0.5) / 0.25;
    color.lerpColors(new THREE.Color(0xffff00), new THREE.Color(0xf98607), t);
  } else {
    // 75% to 100% (35°C to 40°C): #F98607 to #FF0000
    const t = (normalizedValue - 0.75) / 0.25;
    color.lerpColors(new THREE.Color(0xf98607), new THREE.Color(0xff0000), t);
  }

  return color;
}
