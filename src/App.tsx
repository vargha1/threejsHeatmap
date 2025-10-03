import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useState } from "react";
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
  const [hoveredRack, setHoveredRack] = useState<RackWithHeat | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Simulated backend response
    const fakeResponse = {
      data: Array.from({ length: 40 }).map(() => ({
        pos: [Math.floor(Math.random() * 10 - 5), 0.5, Math.floor(Math.random() * 10 - 5)] as [
          number,
          number,
          number
        ],
        size: [1, 1, 1] as [number, number, number],
      })),
      heatMap: [
        { pos: [0, 0, 0] as [number, number, number], intensity: 30 },
        { pos: [4, 0, 4] as [number, number, number], intensity: 0.8 },
        { pos: [-3, 0, 2] as [number, number, number], intensity: 0.6 },
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
      const totalHeat = heatSources.reduce((acc, src) => {
        const d = distance(rack.pos, src.pos);
        return acc + src.intensity / (1 + d * d);
      }, 0);
      return { ...rack, heat: totalHeat };
    });

    const maxHeat = Math.max(...withHeat.map((r) => r.heat));
    const minHeat = Math.min(...withHeat.map((r) => r.heat));
    return withHeat.map((r) => ({
      ...r,
      normalizedHeat: (r.heat - minHeat) / (maxHeat - minHeat || 1),
    }));
  }, [racks, heatSources]);

  // Track mouse for tooltip
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
          <directionalLight position={[10, 15, 10]} intensity={1.2} />
          <OrbitControls />
          <Environment preset="warehouse" />

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[50, 50]} />
            <meshStandardMaterial color="#111" />
          </mesh>

          {/* Heat sources */}
          {heatSources.map((src, i) => (
            <mesh key={`heat-${i}`} position={src.pos}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshStandardMaterial
                emissive="red"
                emissiveIntensity={src.intensity * 2}
                color="red"
              />
            </mesh>
          ))}

          {/* Racks */}
          {racksWithHeat.map((rack, i) => (
            <Rack
              key={i}
              {...rack}
              onHover={(hover) => setHoveredRack(hover ? rack : null)}
            />
          ))}
        </Suspense>
      </Canvas>

      {/* Tooltip */}
      {hoveredRack && (
        <div
          className="absolute bg-gray-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg pointer-events-none"
          style={{
            top: mousePos.y + 15,
            left: mousePos.x + 15,
          }}
        >
          <div className="font-bold mb-1">Rack</div>
          <div>
            Pos: [{hoveredRack.pos.map((v) => v.toFixed(1)).join(", ")}]
          </div>
          <div>Heat: {hoveredRack.normalizedHeat.toFixed(2)}</div>
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
  onHover: (hover: boolean) => void;
}

function Rack({ pos, size, normalizedHeat, onHover }: RackProps) {
  const color = getHeatColor(normalizedHeat);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(true);
  };
  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(false);
  };

  return (
    <mesh
      position={pos}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
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
