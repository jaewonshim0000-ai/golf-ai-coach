"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Pause, Play } from "lucide-react";

import { LM, modelSpace, unpackFrames, type PoseModel } from "@/lib/golf/pose";
import { cn } from "@/lib/utils";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";

/*
  The mannequin is built from the detector's own joints: a cylinder per bone
  and a sphere at each end. Three extra points fill in what the detector does
  not name - the middle of the shoulders, the middle of the hips, and the
  centre of the head between the ears.
*/
const SHOULDERS = 33;
const HIPS = 34;
const HEAD = 35;

/** [from, to, radius in metres] */
const BONES: [number, number, number][] = [
  [LM.leftShoulder, 13, 0.045],
  [13, LM.leftWrist, 0.037],
  [LM.rightShoulder, 14, 0.045],
  [14, LM.rightWrist, 0.037],
  [LM.leftHip, LM.leftKnee, 0.068],
  [LM.leftKnee, LM.leftAnkle, 0.052],
  [LM.rightHip, LM.rightKnee, 0.068],
  [LM.rightKnee, LM.rightAnkle, 0.052],
  [LM.leftHeel, LM.leftFootIndex, 0.036],
  [LM.rightHeel, LM.rightFootIndex, 0.036],
  [LM.leftAnkle, LM.leftHeel, 0.04],
  [LM.rightAnkle, LM.rightHeel, 0.04],
  [LM.leftShoulder, LM.leftHip, 0.075],
  [LM.rightShoulder, LM.rightHip, 0.075],
  [SHOULDERS, HIPS, 0.12],
  [SHOULDERS, HEAD, 0.05],
  // Drawn in colour and out past the body, so the turn of each can be read
  // against the other the way a coach draws it on a still.
  [LM.leftShoulder, LM.rightShoulder, 0.018],
  [LM.leftHip, LM.rightHip, 0.018],
];
/** How far past each joint the turn lines run, in metres. */
const TURN_LINE_OVERHANG = 0.18;
const SHOULDER_LINE = BONES.length - 2;
const HIP_LINE = BONES.length - 1;

const PHASES = ["address", "top", "impact"] as const;
type View = "face" | "line" | "above";

type Scene = {
  show: (position: number) => void;
  view: (view: View) => void;
  ghost: (on: boolean) => void;
};

/** One point per joint per frame, in the player's frame, metres. */
function buildTrack(model: PoseModel): THREE.Vector3[][] | null {
  const frames = unpackFrames(model);
  const address = frames[model.phases.address];
  if (!address) return null;
  const space = modelSpace(address, model.handedness);
  if (!space) return null;
  return frames.map((frame) => {
    const points = frame.landmarks.map((point) => {
      const at = space.toModel(point);
      return new THREE.Vector3(at.x, at.y, at.z);
    });
    const midpoint = (a: number, b: number) => points[a]!.clone().lerp(points[b]!, 0.5);
    points[SHOULDERS] = midpoint(LM.leftShoulder, LM.rightShoulder);
    points[HIPS] = midpoint(LM.leftHip, LM.rightHip);
    // Ears are 7 and 8; the head sits between them.
    points[HEAD] = midpoint(7, 8);
    return points;
  });
}

function mannequin(material: THREE.Material, accents?: [THREE.Material, THREE.Material]) {
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 18);
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const group = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();

  const bones = BONES.map(([, , radius], index) => {
    const paint =
      index === SHOULDER_LINE ? (accents?.[0] ?? material) : index === HIP_LINE ? (accents?.[1] ?? material) : material;
    const bone = new THREE.Mesh(cylinder, paint);
    const ends = [new THREE.Mesh(sphere, paint), new THREE.Mesh(sphere, paint)];
    for (const end of ends) end.scale.setScalar(radius);
    group.add(bone, ...ends);
    return { bone, ends, radius };
  });
  const head = new THREE.Mesh(sphere, material);
  head.scale.set(0.095, 0.115, 0.095);
  group.add(head);

  return {
    group,
    geometries: [cylinder, sphere],
    pose(points: THREE.Vector3[]) {
      BONES.forEach(([from, to], index) => {
        let a = points[from];
        let b = points[to];
        const part = bones[index]!;
        if (!a || !b) return;
        if (accents && (index === SHOULDER_LINE || index === HIP_LINE)) {
          direction.subVectors(b, a).setLength(TURN_LINE_OVERHANG);
          [a, b] = [a.clone().sub(direction), b.clone().add(direction)];
        }
        direction.subVectors(b, a);
        const length = direction.length();
        part.bone.position.copy(a).lerp(b, 0.5);
        part.bone.scale.set(part.radius, length, part.radius);
        if (length > 1e-6) part.bone.quaternion.setFromUnitVectors(up, direction.divideScalar(length));
        part.ends[0]!.position.copy(a);
        part.ends[1]!.position.copy(b);
      });
      if (points[HEAD]) head.position.copy(points[HEAD]);
    },
  };
}

/** Joints between two sampled frames, so slow motion is smooth. */
function between(track: THREE.Vector3[][], position: number): THREE.Vector3[] {
  const index = Math.max(0, Math.min(track.length - 1, Math.floor(position)));
  const next = Math.min(track.length - 1, index + 1);
  const fraction = position - index;
  return track[index]!.map((point, joint) => point.clone().lerp(track[next]![joint] ?? point, fraction));
}

export function SwingModel({ model }: { model: PoseModel }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const last = model.frames.length - 1;
  const [position, setPosition] = useState(model.phases.top);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(true);
  const [ghost, setGhost] = useState(true);
  const [view, setView] = useState<View>("face");
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const track = buildTrack(model);
    if (!track) {
      setFailed("This model has no clear address position to stand it up from.");
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed("This browser cannot draw 3D graphics.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "3D model of your swing. Drag to turn it.");
    renderer.domElement.className = "block h-full w-full touch-none";
    element.appendChild(renderer.domElement);

    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
    world.add(new THREE.HemisphereLight(0xffffff, 0x1c2b27, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(2, 4, 3);
    world.add(sun);

    const grid = new THREE.GridHelper(4, 16, 0x5d7a70, 0x2e433c);
    world.add(grid);

    const ballSide = modelSpace(unpackFrames(model)[model.phases.address]!, model.handedness)!.ballSide;

    // The target line runs through the stance, with an arrow at the target end.
    const gold = new THREE.LineBasicMaterial({ color: 0xe6b85c });
    const targetLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.8, 0.002, 0), new THREE.Vector3(1.8, 0.002, 0)]),
      gold,
    );
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xe6b85c });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 16), arrowMaterial);
    arrow.rotation.z = -Math.PI / 2;
    arrow.position.set(1.85, 0.03, 0);
    world.add(targetLine, arrow);

    // Where the hands travelled, the closest this can get to the swing plane.
    const handPath = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        track.map((points) => points[LM.leftWrist]!.clone().lerp(points[LM.rightWrist]!, 0.5)),
      ),
      new THREE.LineBasicMaterial({ color: 0xe6b85c, transparent: true, opacity: 0.7 }),
    );
    world.add(handPath);

    const body = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.55, metalness: 0.05 });
    const shoulderPaint = new THREE.MeshStandardMaterial({ color: 0xff7a59, roughness: 0.5 });
    const hipPaint = new THREE.MeshStandardMaterial({ color: 0x3fc1a5, roughness: 0.5 });
    const ghostPaint = new THREE.MeshStandardMaterial({
      color: 0x9fc4ff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const player = mannequin(body, [shoulderPaint, hipPaint]);
    const addressGhost = mannequin(ghostPaint);
    addressGhost.pose(track[model.phases.address]!);
    world.add(player.group, addressGhost.group);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 9;
    controls.target.set(0, 0.95, 0);

    const draw = () => renderer.render(world, camera);
    controls.addEventListener("change", draw);

    const resize = () => {
      const { clientWidth, clientHeight } = element;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    scene.current = {
      show(at) {
        player.pose(between(track, at));
        draw();
      },
      view(next) {
        const spots: Record<View, [number, number, number]> = {
          face: [0, 1.0, 4.4 * ballSide],
          line: [-4.6, 1.2, 0.3 * ballSide],
          above: [0, 5, 0.01 * ballSide],
        };
        camera.position.set(...spots[next]);
        controls.update();
        draw();
      },
      ghost(on) {
        addressGhost.group.visible = on;
        draw();
      },
    };
    scene.current.view("face");
    resize();

    return () => {
      scene.current = null;
      observer.disconnect();
      controls.dispose();
      for (const geometry of [...player.geometries, ...addressGhost.geometries]) geometry.dispose();
      for (const thing of [targetLine, arrow, handPath]) thing.geometry.dispose();
      for (const material of [body, shoulderPaint, hipPaint, ghostPaint, gold, arrowMaterial, handPath.material]) {
        material.dispose();
      }
      grid.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model]);

  useEffect(() => scene.current?.show(position), [position]);
  useEffect(() => scene.current?.ghost(ghost), [ghost]);
  useEffect(() => scene.current?.view(view), [view]);

  useEffect(() => {
    if (!playing) return;
    const span = Math.max(0.1, (model.t[last] ?? 1) - (model.t[0] ?? 0));
    const framesPerSecond = (last / span) * (slow ? 0.25 : 1);
    let previous = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const step = ((now - previous) / 1000) * framesPerSecond;
      previous = now;
      setPosition((at) => (at + step >= last ? 0 : at + step));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, slow, last, model.t]);

  const nearest = PHASES.find((phase) => Math.abs(model.phases[phase] - position) < 0.5);
  const seconds = (model.t[Math.round(position)] ?? 0) - (model.t[0] ?? 0);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>3D swing model</CardTitle>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Camera">
          {(
            [
              ["face", "Face on"],
              ["line", "Down the line"],
              ["above", "Above"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={view === id ? "primary" : "secondary"}
              aria-pressed={view === id}
              onClick={() => {
                setView(id);
                // The same button twice still snaps back after dragging.
                scene.current?.view(id);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative overflow-hidden rounded-xl bg-ink">
          <div ref={host} className="aspect-[4/5] w-full sm:aspect-[16/10]" />
          {failed ? (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-ink-fg/75">
              {failed}
            </p>
          ) : (
            <p className="pointer-events-none absolute left-3 top-3 text-[10.5px] leading-[1.5] text-ink-fg/60">
              <span className="text-[#ff7a59]">Shoulders</span> ·{" "}
              <span className="text-[#3fc1a5]">Hips</span> ·{" "}
              <span className="text-[#e6b85c]">Hand path, target line</span>
              <br />
              Drag to turn · pinch or scroll to zoom
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => setPlaying((on) => !on)}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <input
            type="range"
            aria-label="Position in the swing"
            min={0}
            max={last}
            step={0.01}
            value={position}
            onChange={(event) => {
              setPlaying(false);
              setPosition(Number(event.target.value));
            }}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-track accent-accent"
          />
          <span className="tabular w-12 shrink-0 text-right text-[11px] text-fg-muted">
            {seconds.toFixed(2)}s
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PHASES.map((phase) => (
            <Button
              key={phase}
              type="button"
              size="sm"
              variant={nearest === phase ? "primary" : "secondary"}
              onClick={() => {
                setPlaying(false);
                setPosition(model.phases[phase]);
              }}
              className="capitalize"
            >
              {phase}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={slow}
            onClick={() => setSlow((on) => !on)}
          >
            {slow ? "¼ speed" : "Full speed"}
          </Button>
          <label className={cn("ml-auto flex items-center gap-2 text-[12px] text-fg-muted")}>
            <input
              type="checkbox"
              checked={ghost}
              onChange={(event) => setGhost(event.target.checked)}
              className="accent-accent"
            />
            Show address
          </label>
        </div>
        <p className="text-[11px] leading-[1.5] text-fg-subtle">
          Built from one camera, so depth is inferred: turns are the softest numbers. The club is
          not tracked.
        </p>
      </CardContent>
    </Card>
  );
}
