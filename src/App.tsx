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
        // { pos: [0, 0, 0] as [number, number, number], intensity: 16 },
        { pos: [5, 0, 5] as [number, number, number], intensity: 28 },
        { pos: [-3, 0, 0] as [number, number, number], intensity: 12 },
      ],
    };

    setTimeout(() => {
      setRacks(fakeResponse.data);
      setHeatSources(fakeResponse.heatMap);
    }, 500);
  }, []);

  const racksWithHeat: RackWithHeat[] = useMemo(() => {
    if (racks.length === 0 || heatSources.length === 0) return [];
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

    const maxHeat = Math.max(...withHeat.map((r) => r.heat));
    return withHeat.map((r) => ({
      ...r,
      normalizedHeat: r.heat / (maxHeat || 1), // linear
    }));
  }, [racks, heatSources]);

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

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
            <planeGeometry args={[50, 50]} />
            <meshStandardMaterial color="#111" side={2} />
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
        <div className="w-40 h-4 bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 rounded-full" />
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
  const hue = (1 - value) * 0.33; // 0.33=green, 0=red
  color.setHSL(hue, 1, 0.5);
  return color;
}
