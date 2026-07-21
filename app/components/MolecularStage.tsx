"use client";

import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import "./molecular-stage.css";

export type Vec3 = readonly [number, number, number];
export type QuaternionTuple = readonly [number, number, number, number];

export interface MolecularAtom {
  id: string;
  element: string;
  position: Vec3;
  /** Optional display radius in the same coordinate system as `position`. */
  radius?: number;
  /** Any valid Three.js CSS color. Element colors are used when omitted. */
  color?: string;
  /** Marks an atom as part of the visible binding pocket. */
  pocket?: boolean;
}

export interface MolecularBond {
  /** Zero-based index into the ligand atom array. */
  from: number;
  /** Zero-based index into the ligand atom array. */
  to: number;
  order?: 1 | 2 | 3;
}

export interface MolecularSystem {
  id: string;
  name: string;
  receptor: {
    atoms: MolecularAtom[];
  };
  ligand: {
    atoms: MolecularAtom[];
    bonds?: MolecularBond[];
  };
  /** Binding-pocket center in receptor/system coordinates. */
  pocketCenter?: Vec3;
}

export interface MolecularPose {
  /** Ligand origin in receptor/system coordinates. */
  position: Vec3;
  /** Ligand orientation as an [x, y, z, w] quaternion. */
  rotation: QuaternionTuple;
}

export interface ScoreBreakdown {
  total: number;
  /** Scorer-owned visual quality in [0, 1]. SNAP does not infer this value. */
  normalized: number;
  unit?: string;
  terms?: Record<string, number>;
}

export type MolecularInteractionKind =
  | "hydrogen-bond"
  | "clash"
  | "salt-bridge"
  | "hydrophobic"
  | "other";

type PointerDragMode = "translate" | "rotate";

export interface MolecularInteraction {
  id: string;
  kind: MolecularInteractionKind;
  ligandAtomIndex?: number;
  receptorAtomIndex?: number;
  /** Explicit system-space endpoints take precedence over atom indices. */
  start?: Vec3;
  end?: Vec3;
  strength?: number;
  distance?: number;
}

export interface PoseChangeMeta {
  source:
    | "pointer-translate"
    | "pointer-rotate"
    | "keyboard-translate"
    | "keyboard-rotate";
  committed: boolean;
}

export interface MolecularStageProps {
  system: MolecularSystem;
  pose: MolecularPose;
  score: ScoreBreakdown | null;
  interactions: MolecularInteraction[];
  onPoseChange: (next: MolecularPose, meta: PoseChangeMeta) => void;
  crystalPose?: MolecularPose;
  showCrystalGhost?: boolean;
  /** Interpolates the displayed ligand from `pose` to `crystalPose`. */
  revealProgress?: number;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

interface DragState {
  mode: "translate" | "rotate";
  pointerId: number;
  startClient: THREE.Vector2;
  startRotation: THREE.Quaternion;
  plane: THREE.Plane;
  localOffset: THREE.Vector3;
  lastPose: MolecularPose;
}

const ELEMENT_COLORS: Record<string, string> = {
  H: "#eef5ff",
  C: "#aebbd0",
  N: "#4e8cff",
  O: "#ff5d6c",
  F: "#8ae28f",
  P: "#ff9f43",
  S: "#ffd34e",
  CL: "#5ee18a",
  BR: "#b96b55",
  I: "#a67ce7",
  FE: "#e28b54",
};

const UNIT_Y = new THREE.Vector3(0, 1, 0);
const IDENTITY_POSE: MolecularPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
};

export function MolecularStage({
  system,
  pose,
  score,
  interactions,
  onPoseChange,
  crystalPose,
  showCrystalGhost = false,
  revealProgress = 0,
  disabled = false,
  className,
  ariaLabel,
}: MolecularStageProps) {
  const helpId = useId();
  const [manipulating, setManipulating] = useState(false);
  const [pointerDragMode, setPointerDragMode] =
    useState<PointerDragMode>("translate");
  const [announcement, setAnnouncement] = useState("");
  const reducedMotion = usePrefersReducedMotion();
  const sceneFrame = useMemo(() => getSceneFrame(system), [system]);
  const clampedReveal = clamp01(revealProgress);
  const displayPose = useMemo(
    () =>
      crystalPose
        ? interpolatePose(pose, crystalPose, clampedReveal)
        : pose,
    [clampedReveal, crystalPose, pose],
  );
  const scoreQuality = score ? clamp01(score.normalized) : 0;
  const interactionDisabled = disabled || clampedReveal > 0;

  const emitKeyboardPose = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (interactionDisabled) return;

      const translationStep = Math.max(sceneFrame.radius * 0.035, 0.08);
      const rotationStep = Math.PI / 36;
      const nextPosition = new THREE.Vector3(...pose.position);
      const nextRotation = new THREE.Quaternion(...pose.rotation);
      let source: PoseChangeMeta["source"] | null = null;
      let message = "";

      if (event.shiftKey && event.key.startsWith("Arrow")) {
        const axis = new THREE.Vector3(
          event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0,
          event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0,
          0,
        );
        nextRotation.premultiply(
          new THREE.Quaternion().setFromAxisAngle(axis, rotationStep),
        );
        source = "keyboard-rotate";
        message = "Ligand rotated";
      } else if (event.key === "q" || event.key === "Q") {
        nextRotation.premultiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            -rotationStep,
          ),
        );
        source = "keyboard-rotate";
        message = "Ligand rolled counterclockwise";
      } else if (event.key === "e" || event.key === "E") {
        nextRotation.premultiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            rotationStep,
          ),
        );
        source = "keyboard-rotate";
        message = "Ligand rolled clockwise";
      } else {
        switch (event.key) {
          case "ArrowLeft":
            nextPosition.x -= translationStep;
            message = "Ligand moved left";
            break;
          case "ArrowRight":
            nextPosition.x += translationStep;
            message = "Ligand moved right";
            break;
          case "ArrowUp":
            nextPosition.y += translationStep;
            message = "Ligand moved up";
            break;
          case "ArrowDown":
            nextPosition.y -= translationStep;
            message = "Ligand moved down";
            break;
          case "PageUp":
            nextPosition.z -= translationStep;
            message = "Ligand moved along negative Z";
            break;
          case "PageDown":
            nextPosition.z += translationStep;
            message = "Ligand moved along positive Z";
            break;
          default:
            return;
        }
        source = "keyboard-translate";
      }

      event.preventDefault();
      nextRotation.normalize();
      onPoseChange(
        {
          position: vectorTuple(nextPosition),
          rotation: quaternionTuple(nextRotation),
        },
        { source, committed: true },
      );
      setAnnouncement(message);
    },
    [interactionDisabled, onPoseChange, pose, sceneFrame.radius],
  );

  const rootClassName = [
    "molecular-stage",
    manipulating ? "molecular-stage--manipulating" : "",
    disabled ? "molecular-stage--disabled" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClassName}
      role="application"
      tabIndex={interactionDisabled ? -1 : 0}
      aria-label={
        ariaLabel ??
        `${system.name} interactive molecular binding instrument`
      }
      aria-describedby={helpId}
      onKeyDown={emitKeyboardPose}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        className="molecular-stage__canvas"
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.45, 8], fov: 40, near: 0.05, far: 80 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.02,
        }}
      >
        <MolecularScene
          system={system}
          pose={displayPose}
          scoreQuality={scoreQuality}
          interactions={interactions}
          onPoseChange={onPoseChange}
          crystalPose={crystalPose}
          showCrystalGhost={showCrystalGhost && clampedReveal < 1}
          disabled={interactionDisabled}
          manipulating={manipulating}
          onManipulatingChange={setManipulating}
          reducedMotion={reducedMotion}
          pointerDragMode={pointerDragMode}
          frame={sceneFrame}
        />
      </Canvas>

      <button
        className="molecular-stage__mode-toggle"
        type="button"
        disabled={interactionDisabled}
        aria-label={`Drag mode: ${pointerDragMode === "translate" ? "move" : "rotate"}. Activate to switch modes.`}
        onClick={() =>
          setPointerDragMode((current) =>
            current === "translate" ? "rotate" : "translate",
          )
        }
      >
        Drag: {pointerDragMode === "translate" ? "Move" : "Rotate"}
      </button>

      <div className="molecular-stage__specimen" aria-hidden="true">
        <span className="molecular-stage__specimen-dot" />
        <span>{system.name}</span>
      </div>

      <div className="molecular-stage__controls" aria-hidden="true">
        {interactionDisabled
          ? "Ligand controls paused"
          : pointerDragMode === "rotate"
            ? "Drag to rotate · switch to Move to translate"
            : "Drag to move · Shift or right-drag to rotate"}
      </div>

      <div className="molecular-stage__axis" aria-hidden="true">
        <span className="molecular-stage__axis-x">x</span>
        <span className="molecular-stage__axis-y">y</span>
        <span className="molecular-stage__axis-z">z</span>
      </div>

      <p id={helpId} className="molecular-stage__sr-only">
        Drag the ligand to translate it. Hold Shift while dragging, or use the
        secondary mouse button, to rotate. With the stage focused, use the arrow
        keys to translate, Page Up and Page Down to move in depth, Shift plus
        the arrow keys to rotate, and Q or E to roll.
      </p>
      <p className="molecular-stage__sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

interface SceneFrame {
  center: THREE.Vector3;
  radius: number;
  scale: number;
}

interface MolecularSceneProps {
  system: MolecularSystem;
  pose: MolecularPose;
  scoreQuality: number;
  interactions: MolecularInteraction[];
  onPoseChange: MolecularStageProps["onPoseChange"];
  crystalPose?: MolecularPose;
  showCrystalGhost: boolean;
  disabled: boolean;
  manipulating: boolean;
  onManipulatingChange: (active: boolean) => void;
  reducedMotion: boolean;
  pointerDragMode: PointerDragMode;
  frame: SceneFrame;
}

function MolecularScene({
  system,
  pose,
  scoreQuality,
  interactions,
  onPoseChange,
  crystalPose,
  showCrystalGhost,
  disabled,
  manipulating,
  onManipulatingChange,
  reducedMotion,
  pointerDragMode,
  frame,
}: MolecularSceneProps) {
  const receptorPocketAtoms = useMemo(
    () => system.receptor.atoms.filter((atom) => atom.pocket),
    [system.receptor.atoms],
  );
  const receptorScaffoldAtoms = useMemo(
    () =>
      receptorPocketAtoms.length
        ? system.receptor.atoms.filter((atom) => !atom.pocket)
        : system.receptor.atoms,
    [receptorPocketAtoms.length, system.receptor.atoms],
  );
  const rootPosition = useMemo(
    () => frame.center.clone().multiplyScalar(-frame.scale),
    [frame.center, frame.scale],
  );
  const pocketCenter = system.pocketCenter ?? vectorTuple(frame.center);

  return (
    <>
      <color attach="background" args={["#03070c"]} />
      <fog attach="fog" args={["#03070c", 8.5, 19]} />
      <ambientLight intensity={0.2} color="#9fc2ff" />
      <hemisphereLight args={["#c8dcff", "#02050a", 0.62]} />
      <spotLight
        position={[4.5, 6.5, 6]}
        angle={0.48}
        penumbra={0.9}
        intensity={28}
        color="#b9d8ff"
      />
      <spotLight
        position={[-5, -1, 3]}
        angle={0.55}
        penumbra={1}
        intensity={16}
        color="#36d9cc"
      />

      <group position={vectorTuple(rootPosition)} scale={frame.scale}>
        <InstancedAtomCloud
          atoms={receptorScaffoldAtoms}
          variant="receptor"
          scoreQuality={0}
        />
        {receptorPocketAtoms.length > 0 ? (
          <InstancedAtomCloud
            atoms={receptorPocketAtoms}
            variant="pocket"
            scoreQuality={scoreQuality}
          />
        ) : null}

        <PocketGlow center={pocketCenter} quality={scoreQuality} />

        {crystalPose && showCrystalGhost ? (
          <LigandModel
            atoms={system.ligand.atoms}
            bonds={system.ligand.bonds ?? []}
            pose={crystalPose}
            ghost
          />
        ) : null}

        <InteractiveLigand
          atoms={system.ligand.atoms}
          bonds={system.ligand.bonds ?? []}
          pose={pose}
          disabled={disabled}
          onPoseChange={onPoseChange}
          onManipulatingChange={onManipulatingChange}
          pointerDragMode={pointerDragMode}
        />

        <InteractionLayer
          system={system}
          pose={pose}
          interactions={interactions}
          reducedMotion={reducedMotion}
        />
      </group>

      <OrbitControls
        makeDefault
        enabled={!manipulating}
        enableDamping={!reducedMotion}
        dampingFactor={0.055}
        enablePan={false}
        minDistance={4.8}
        maxDistance={12}
        minPolarAngle={Math.PI * 0.15}
        maxPolarAngle={Math.PI * 0.85}
        autoRotate={!reducedMotion && !manipulating}
        autoRotateSpeed={0.32}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          intensity={0.62}
          luminanceThreshold={0.58}
          luminanceSmoothing={0.18}
          radius={0.35}
        />
      </EffectComposer>
    </>
  );
}

interface InstancedAtomCloudProps {
  atoms: MolecularAtom[];
  variant: "receptor" | "pocket";
  scoreQuality: number;
}

function InstancedAtomCloud({
  atoms,
  variant,
  scoreQuality,
}: InstancedAtomCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const isPocket = variant === "pocket";

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const baseRadius = isPocket ? 0.46 : 0.34;

    atoms.forEach((atom, index) => {
      position.set(...atom.position);
      const radius = Math.max(atom.radius ?? 1, 0.08) * baseRadius;
      scale.setScalar(radius);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(atomColor(atom)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [atoms, isPocket]);

  if (atoms.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, atoms.length]}
      frustumCulled
      renderOrder={isPocket ? 2 : 0}
    >
      <icosahedronGeometry args={[1, isPocket ? 2 : 1]} />
      <meshPhysicalMaterial
        vertexColors
        transparent
        opacity={isPocket ? 0.21 : 0.09}
        depthWrite={false}
        roughness={isPocket ? 0.22 : 0.34}
        metalness={0.04}
        clearcoat={isPocket ? 0.82 : 0.48}
        clearcoatRoughness={0.24}
        transmission={isPocket ? 0.08 : 0.16}
        emissive={isPocket ? "#35dcca" : "#071320"}
        emissiveIntensity={isPocket ? 0.18 + scoreQuality * 1.8 : 0.12}
      />
    </instancedMesh>
  );
}

interface PocketGlowProps {
  center: Vec3;
  quality: number;
}

function PocketGlow({ center, quality }: PocketGlowProps) {
  const visibleQuality = 0.12 + clamp01(quality) * 0.88;

  return (
    <group position={center}>
      <pointLight
        color="#49f6d3"
        intensity={0.45 + visibleQuality * 6.2}
        distance={3.8}
        decay={2}
      />
      <mesh scale={0.72 + visibleQuality * 0.34} renderOrder={3}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial
          color="#49f6d3"
          transparent
          opacity={0.018 + visibleQuality * 0.075}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

interface InteractiveLigandProps {
  atoms: MolecularAtom[];
  bonds: MolecularBond[];
  pose: MolecularPose;
  disabled: boolean;
  onPoseChange: MolecularStageProps["onPoseChange"];
  onManipulatingChange: (active: boolean) => void;
  pointerDragMode: PointerDragMode;
}

function InteractiveLigand({
  atoms,
  bonds,
  pose,
  disabled,
  onPoseChange,
  onManipulatingChange,
  pointerDragMode,
}: InteractiveLigandProps) {
  const groupRef = useRef<THREE.Group>(null);
  const dragRef = useRef<DragState | null>(null);
  const { camera } = useThree();

  const beginDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (disabled || !groupRef.current) return;
      event.stopPropagation();

      const rotate =
        pointerDragMode === "rotate" ||
        event.button === 2 ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey;
      const mode: DragState["mode"] = rotate ? "rotate" : "translate";
      const plane = new THREE.Plane();
      const localOffset = new THREE.Vector3();

      if (mode === "translate") {
        const worldOrigin = groupRef.current.getWorldPosition(new THREE.Vector3());
        const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
        plane.setFromNormalAndCoplanarPoint(cameraDirection, worldOrigin);
        const hit = event.ray.intersectPlane(plane, new THREE.Vector3());
        if (hit && groupRef.current.parent) {
          const localHit = groupRef.current.parent.worldToLocal(hit.clone());
          localOffset.set(...pose.position).sub(localHit);
        }
      }

      dragRef.current = {
        mode,
        pointerId: event.pointerId,
        startClient: new THREE.Vector2(event.clientX, event.clientY),
        startRotation: new THREE.Quaternion(...pose.rotation),
        plane,
        localOffset,
        lastPose: pose,
      };
      (
        event.target as EventTarget & {
          setPointerCapture?: (pointerId: number) => void;
        }
      ).setPointerCapture?.(event.pointerId);
      onManipulatingChange(true);
    },
    [camera, disabled, onManipulatingChange, pointerDragMode, pose],
  );

  const continueDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      const group = groupRef.current;
      if (!drag || !group || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();

      let nextPose: MolecularPose;
      let source: PoseChangeMeta["source"];

      if (drag.mode === "translate") {
        const hit = event.ray.intersectPlane(drag.plane, new THREE.Vector3());
        if (!hit || !group.parent) return;
        const localHit = group.parent.worldToLocal(hit.clone());
        localHit.add(drag.localOffset);
        nextPose = {
          position: vectorTuple(localHit),
          rotation: pose.rotation,
        };
        source = "pointer-translate";
      } else {
        const dx = event.clientX - drag.startClient.x;
        const dy = event.clientY - drag.startClient.y;
        const cameraRight = new THREE.Vector3(1, 0, 0)
          .applyQuaternion(camera.quaternion)
          .normalize();
        const cameraUp = new THREE.Vector3(0, 1, 0)
          .applyQuaternion(camera.quaternion)
          .normalize();
        const yaw = new THREE.Quaternion().setFromAxisAngle(cameraUp, dx * 0.008);
        const pitch = new THREE.Quaternion().setFromAxisAngle(
          cameraRight,
          dy * 0.008,
        );
        const nextRotation = yaw
          .multiply(pitch)
          .multiply(drag.startRotation)
          .normalize();
        nextPose = {
          position: pose.position,
          rotation: quaternionTuple(nextRotation),
        };
        source = "pointer-rotate";
      }

      drag.lastPose = nextPose;
      onPoseChange(nextPose, { source, committed: false });
    },
    [camera.quaternion, onPoseChange, pose.position, pose.rotation],
  );

  const endDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      (
        event.target as EventTarget & {
          releasePointerCapture?: (pointerId: number) => void;
        }
      ).releasePointerCapture?.(event.pointerId);
      dragRef.current = null;
      onManipulatingChange(false);
      onPoseChange(drag.lastPose, {
        source:
          drag.mode === "translate" ? "pointer-translate" : "pointer-rotate",
        committed: true,
      });
    },
    [onManipulatingChange, onPoseChange],
  );

  useEffect(
    () => () => {
      dragRef.current = null;
      onManipulatingChange(false);
    },
    [onManipulatingChange],
  );

  return (
    <LigandModel
      ref={groupRef}
      atoms={atoms}
      bonds={bonds}
      pose={pose}
      onPointerDown={beginDrag}
      onPointerMove={continueDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}

interface LigandModelProps {
  atoms: MolecularAtom[];
  bonds: MolecularBond[];
  pose?: MolecularPose;
  ghost?: boolean;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel?: (event: ThreeEvent<PointerEvent>) => void;
  ref?: React.Ref<THREE.Group>;
}

function LigandModel({
  atoms,
  bonds,
  pose = IDENTITY_POSE,
  ghost = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ref,
}: LigandModelProps) {
  const atomMeshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = atomMeshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    atoms.forEach((atom, index) => {
      position.set(...atom.position);
      const radius = Math.max(atom.radius ?? 1, 0.08) * 0.5;
      scale.setScalar(radius);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(atomColor(atom)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [atoms]);

  return (
    <group
      ref={ref}
      position={pose.position}
      quaternion={pose.rotation}
      renderOrder={ghost ? 1 : 5}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {bonds.map((bond, index) => {
        const from = atoms[bond.from];
        const to = atoms[bond.to];
        if (!from || !to) return null;
        return (
          <BondCylinder
            key={`${bond.from}-${bond.to}-${index}`}
            from={from.position}
            to={to.position}
            ghost={ghost}
          />
        );
      })}
      {atoms.length ? (
        <>
          {!ghost ? (
            <>
              <pointLight color="#ffd27a" intensity={0.65} distance={5.5} decay={2} />
              <mesh scale={4.2} renderOrder={4}>
                <sphereGeometry args={[1, 20, 14]} />
                <meshBasicMaterial
                  color="#ffbd55"
                  transparent
                  opacity={0.012}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={6}>
                <torusGeometry args={[4.15, 0.035, 8, 96]} />
                <meshBasicMaterial
                  color="#ffd27a"
                  transparent
                  opacity={0.3}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              <mesh rotation={[0.45, 0.9, 0.1]} renderOrder={6}>
                <torusGeometry args={[4.15, 0.022, 8, 96]} />
                <meshBasicMaterial
                  color="#ffe6b0"
                  transparent
                  opacity={0.13}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            </>
          ) : null}
          <instancedMesh
            ref={atomMeshRef}
            args={[undefined, undefined, atoms.length]}
            renderOrder={ghost ? 1 : 5}
          >
            <icosahedronGeometry args={[1, 3]} />
            {ghost ? (
              <meshBasicMaterial
                color="#7fffe7"
                wireframe
                transparent
                opacity={0.22}
                depthWrite={false}
              />
            ) : (
              <meshPhysicalMaterial
                vertexColors
                roughness={0.12}
                metalness={0.06}
                clearcoat={1}
                clearcoatRoughness={0.08}
                emissive="#ffffff"
                emissiveIntensity={0.3}
              />
            )}
          </instancedMesh>
        </>
      ) : null}
    </group>
  );
}

function BondCylinder({
  from,
  to,
  ghost,
}: {
  from: Vec3;
  to: Vec3;
  ghost: boolean;
}) {
  const transform = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const length = direction.length();
    const quaternion = new THREE.Quaternion();
    if (length > 0.0001) {
      quaternion.setFromUnitVectors(UNIT_Y, direction.normalize());
    }
    return { midpoint, length, quaternion };
  }, [from, to]);

  return (
    <mesh position={transform.midpoint} quaternion={transform.quaternion}>
      <cylinderGeometry args={[0.14, 0.14, transform.length, 12]} />
      <meshStandardMaterial
        color={ghost ? "#73f7df" : "#d7e7ef"}
        transparent={ghost}
        opacity={ghost ? 0.18 : 1}
        depthWrite={!ghost}
        roughness={0.24}
        metalness={0.22}
      />
    </mesh>
  );
}

interface InteractionLayerProps {
  system: MolecularSystem;
  pose: MolecularPose;
  interactions: MolecularInteraction[];
  reducedMotion: boolean;
}

function InteractionLayer({
  system,
  pose,
  interactions,
  reducedMotion,
}: InteractionLayerProps) {
  const visuals = useMemo(
    () =>
      interactions.flatMap((interaction) => {
        if (
          interaction.kind !== "hydrogen-bond" &&
          interaction.kind !== "clash"
        ) {
          return [];
        }
        const endpoints = resolveInteractionEndpoints(interaction, system, pose);
        return endpoints ? [{ interaction, ...endpoints }] : [];
      }),
    [interactions, pose, system],
  );

  return (
    <>
      {visuals.map(({ interaction, start, end }) =>
        interaction.kind === "hydrogen-bond" ? (
          <Line
            key={interaction.id}
            points={[start, end]}
            color="#62f5df"
            lineWidth={1.35}
            dashed
            dashSize={0.15}
            gapSize={0.09}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        ) : (
          <ClashMarker
            key={interaction.id}
            position={start.clone().add(end).multiplyScalar(0.5)}
            reducedMotion={reducedMotion}
          />
        ),
      )}
    </>
  );
}

function ClashMarker({
  position,
  reducedMotion,
}: {
  position: THREE.Vector3;
  reducedMotion: boolean;
}) {
  const markerRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!markerRef.current || reducedMotion) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 8) * 0.12;
    markerRef.current.scale.setScalar(pulse);
  });

  return (
    <group ref={markerRef} position={position}>
      <mesh renderOrder={7}>
        <icosahedronGeometry args={[0.28, 1]} />
        <meshBasicMaterial
          color="#ff3f62"
          wireframe
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={0.42} renderOrder={8}>
        <sphereGeometry args={[0.28, 12, 8]} />
        <meshBasicMaterial color="#ff234d" />
      </mesh>
      <pointLight color="#ff315a" intensity={2.6} distance={1.25} decay={2} />
    </group>
  );
}

function resolveInteractionEndpoints(
  interaction: MolecularInteraction,
  system: MolecularSystem,
  pose: MolecularPose,
): { start: THREE.Vector3; end: THREE.Vector3 } | null {
  const receptorAtom =
    interaction.receptorAtomIndex === undefined
      ? undefined
      : system.receptor.atoms[interaction.receptorAtomIndex];
  const ligandAtom =
    interaction.ligandAtomIndex === undefined
      ? undefined
      : system.ligand.atoms[interaction.ligandAtomIndex];

  const start = interaction.start
    ? new THREE.Vector3(...interaction.start)
    : receptorAtom
      ? new THREE.Vector3(...receptorAtom.position)
      : null;

  const end = interaction.end
    ? new THREE.Vector3(...interaction.end)
    : ligandAtom
      ? new THREE.Vector3(...ligandAtom.position)
          .applyQuaternion(new THREE.Quaternion(...pose.rotation))
          .add(new THREE.Vector3(...pose.position))
      : null;

  return start && end ? { start, end } : null;
}

function getSceneFrame(system: MolecularSystem): SceneFrame {
  const atoms = system.receptor.atoms;
  const pocketAtoms = atoms.filter((atom) => atom.pocket);
  const source = pocketAtoms.length >= 4 ? pocketAtoms : atoms;
  const center = system.pocketCenter
    ? new THREE.Vector3(...system.pocketCenter)
    : averagePosition(source.length ? source : system.ligand.atoms);

  let radius = 0;
  for (const atom of source) {
    radius = Math.max(
      radius,
      new THREE.Vector3(...atom.position).distanceTo(center),
    );
  }
  for (const atom of system.ligand.atoms) {
    radius = Math.max(radius, new THREE.Vector3(...atom.position).length() * 0.4);
  }
  radius = Math.max(radius, 2.5);

  return {
    center,
    radius,
    scale: 3.05 / radius,
  };
}

function averagePosition(atoms: MolecularAtom[]): THREE.Vector3 {
  if (!atoms.length) return new THREE.Vector3();
  const total = atoms.reduce(
    (sum, atom) => sum.add(new THREE.Vector3(...atom.position)),
    new THREE.Vector3(),
  );
  return total.multiplyScalar(1 / atoms.length);
}

function interpolatePose(
  from: MolecularPose,
  to: MolecularPose,
  progress: number,
): MolecularPose {
  const position = new THREE.Vector3(...from.position).lerp(
    new THREE.Vector3(...to.position),
    progress,
  );
  const rotation = new THREE.Quaternion(...from.rotation).slerp(
    new THREE.Quaternion(...to.rotation),
    progress,
  );
  return {
    position: vectorTuple(position),
    rotation: quaternionTuple(rotation),
  };
}

function atomColor(atom: MolecularAtom): string {
  if (atom.color) return atom.color;
  return ELEMENT_COLORS[atom.element.trim().toUpperCase()] ?? "#9db1c9";
}

function vectorTuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function quaternionTuple(
  quaternion: THREE.Quaternion,
): [number, number, number, number] {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reducedMotion;
}
