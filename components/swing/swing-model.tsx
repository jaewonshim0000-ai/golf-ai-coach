"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Pause, Play } from "lucide-react";

import { retimeSwingAction } from "@/app/actions";
import {
  LM,
  unpackFrames,
  type PoseModel,
  type SwingPhases,
} from "@/lib/golf/pose";
import { positionTime, reconstructionTrack, samplePosition } from "@/lib/golf/reconstruction";
import { visibleHands } from "@/lib/golf/motion-analysis";
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
type View = "recorded" | "side" | "above";

type Scene = {
  show: (position: number) => void;
  view: (view: View) => void;
  ghost: (on: boolean) => void;
};

/** One point per joint per frame, in the player's frame, metres. */
function buildTrack(model: PoseModel): THREE.Vector3[][] | null {
  const frames = reconstructionTrack(model);
  if (!frames) return null;
  return frames.map((frame) => {
    const points = frame.map((point) => new THREE.Vector3(point.x, point.y, point.z));
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
    const ownPaint = paint.clone();
    ownPaint.transparent = true;
    const bone = new THREE.Mesh(cylinder, ownPaint);
    const ends = [new THREE.Mesh(sphere, ownPaint), new THREE.Mesh(sphere, ownPaint)];
    for (const end of ends) end.scale.setScalar(radius);
    group.add(bone, ...ends);
    return { bone, ends, radius, paint: ownPaint, opacity: ownPaint.opacity };
  });
  const head = new THREE.Mesh(sphere, material);
  head.scale.set(0.095, 0.115, 0.095);
  group.add(head);

  return {
    group,
    geometries: [cylinder, sphere],
    materials: bones.map((bone) => bone.paint),
    pose(points: THREE.Vector3[], visibility?: number[]) {
      BONES.forEach(([from, to], index) => {
        let a = points[from];
        let b = points[to];
        const part = bones[index]!;
        if (visibility) part.paint.opacity = part.opacity * (Math.min(visibility[from] ?? 0.8, visibility[to] ?? 0.8) < 0.6 ? 0.25 : 1);
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

export function SwingModel({ model, sessionId }: { model: PoseModel; sessionId: string }) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const last = model.t.length - 1;
  const [position, setPosition] = useState(model.phases.top);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(true);
  const [ghost, setGhost] = useState(true);
  const [view, setView] = useState<View>("recorded");
  const [failed, setFailed] = useState<string | null>(null);
  const [phaseDraft, setPhaseDraft] = useState<SwingPhases>(model.phases);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const [phasePending, startPhaseTransition] = useTransition();

  useEffect(() => {
    setPhaseDraft(model.phases);
    setPosition(model.phases.top);
  }, [model]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const track = buildTrack(model);
    if (!track) {
      setFailed("Reconstruct this swing again to create the 3D replay.");
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
    setFailed(null);
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

    const trail: THREE.Vector3[] = [];
    const observed = unpackFrames(model);
    const handAt = (index: number) => {
      if (!visibleHands(observed[index]!, model.aspect ?? 1)) return null;
      const left = model.frames[index]![15]!, right = model.frames[index]![16]!;
      if (left[3] >= 0.6 && right[3] >= 0.6) return track[index]![15]!.clone().lerp(track[index]![16]!, 0.5);
      return left[3] >= 0.6 ? track[index]![15]! : right[3] >= 0.6 ? track[index]![16]! : null;
    };
    for (let index = 1; index < track.length; index++) {
      const before = handAt(index - 1), after = handAt(index);
      if (before && after && model.t[index]! - model.t[index - 1]! <= 0.12) trail.push(before, after);
    }
    const handPath = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(
        trail,
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
        const index = Math.min(last, Math.max(0, Math.floor(at)));
        const next = Math.min(last, index + 1);
        player.group.visible = !(model.t[next]! - model.t[index]! > 0.12 && at - index > 0.05 && at - index < 0.95);
        player.pose(between(track, at), model.frames[index]!.map((point) => point[3]));
        draw();
      },
      view(next) {
        const spots: Record<View, [number, number, number]> = {
          recorded: [0, 1.0, 4.4],
          side: [-4.6, 1.2, 0.3],
          above: [0, 5, 0.01],
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
    scene.current.view(view);
    scene.current.ghost(ghost);
    scene.current.show(model.phases.top);
    resize();

    return () => {
      scene.current = null;
      observer.disconnect();
      controls.dispose();
      for (const geometry of [...player.geometries, ...addressGhost.geometries]) geometry.dispose();
      handPath.geometry.dispose();
      for (const material of [body, shoulderPaint, hipPaint, ghostPaint, handPath.material, ...player.materials, ...addressGhost.materials]) {
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
    const followVideo = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; time: number; paused: boolean }>).detail;
      if (detail?.id !== sessionId) return;
      setPosition(samplePosition(model.t, detail.time));
      setPlaying(!detail.paused);
    };
    window.addEventListener("swing:frame", followVideo);
    return () => window.removeEventListener("swing:frame", followVideo);
  }, [sessionId, model.t]);

  useEffect(() => {
    if (!playing) return;
    const span = Math.max(0.1, (model.t[last] ?? 1) - (model.t[0] ?? 0));
    let previous = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const video = document.querySelector<HTMLVideoElement>("video[data-swing-player]");
      if (video) {
        setPosition(samplePosition(model.t, video.currentTime));
        frame = requestAnimationFrame(tick);
        return;
      }
      const step = ((now - previous) / 1000) * (slow ? 0.25 : 1);
      previous = now;
      setPosition((at) => samplePosition(model.t, model.t[0]! + ((positionTime(model.t, at) - model.t[0]! + step) % span)));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, slow, last, model.t]);

  const nearest = PHASES.find((phase) => Math.abs(phaseDraft[phase] - position) < 0.5);
  const seconds = positionTime(model.t, position) - (model.t[0] ?? 0);
  const seekPosition = (at: number) => {
    setPlaying(false);
    setPosition(at);
    const video = document.querySelector<HTMLVideoElement>("video[data-swing-player]");
    if (video) { video.pause(); video.currentTime = positionTime(model.t, at); }
  };
  const togglePlayback = () => {
    const video = document.querySelector<HTMLVideoElement>("video[data-swing-player]");
    if (video) {
      if (playing) video.pause();
      else { video.playbackRate = slow ? 0.25 : 1; void video.play().catch(() => setPlaying(false)); }
    }
    setPlaying((on) => !on);
  };
  const validPhaseOrder =
    phaseDraft.address < phaseDraft.top && phaseDraft.top < phaseDraft.impact;

  const markPhase = (phase: keyof SwingPhases) => {
    seekPosition(position);
    setPhaseMessage(null);
    setPhaseDraft((current) => ({ ...current, [phase]: Math.round(position) }));
  };

  const recalculate = () => {
    if (!validPhaseOrder) return;
    startPhaseTransition(async () => {
      const result = await retimeSwingAction({ swing_session_id: sessionId, phases: phaseDraft });
      setPhaseMessage(
        result.ok
          ? "Timing saved. The measurements now use these three frames."
          : (result.message ?? "The phase timing could not be saved."),
      );
      if (result.ok) router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Your swing in 3D</CardTitle>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Camera">
          {(
            [
              ["recorded", "Recorded view"],
              ["side", "Side"],
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
              <span className="text-[#e6b85c]">Hand path</span>
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
            onClick={togglePlayback}
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
              seekPosition(Number(event.target.value));
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
                seekPosition(phaseDraft[phase]);
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
            onClick={() => { const video = document.querySelector<HTMLVideoElement>("video[data-swing-player]"); if (video) video.playbackRate = slow ? 1 : 0.25; setSlow((on) => !on); }}
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
        <details className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
          <summary className="cursor-pointer text-[12px] font-medium">Adjust swing timing</summary>
          <div>
            <p className="text-[12px] font-semibold text-fg">Correct phase timing</p>
            <p className="mt-0.5 text-[11px] leading-[1.5] text-fg-muted">
              Scrub to the exact frame, mark it, then recalculate the measurements.
            </p>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {PHASES.map((phase) => (
              <Button
                key={`mark-${phase}`}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => markPhase(phase)}
                className="justify-between capitalize"
              >
                <span>Mark {phase}</span>
                <span className="ml-2 tabular-nums text-fg-muted">
                  {((model.t[phaseDraft[phase]] ?? 0) - (model.t[0] ?? 0)).toFixed(2)}s
                </span>
              </Button>
            ))}
          </div>
          {!validPhaseOrder ? (
            <p className="text-[11px] text-red-700">Mark address first, top second, and impact third.</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!validPhaseOrder || phasePending}
              onClick={recalculate}
            >
              {phasePending ? "Recalculating…" : "Use these frames"}
            </Button>
            {phaseMessage ? (
              <p className="text-[11px] leading-[1.4] text-fg-muted" role="status">
                {phaseMessage}
              </p>
            ) : null}
          </div>
        </details>
        <p className="text-[11px] leading-[1.5] text-fg-subtle">
          Reconstructed with MediaPipe’s 3D body model. Depth and faint limbs are estimated from one camera. The gold trail follows the hands; the club is not tracked.
        </p>
      </CardContent>
    </Card>
  );
}
