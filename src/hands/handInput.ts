/**
 * Turns WebXR input (articulated hands first, controllers optional) into simple "pointers":
 * a pinch point + pinch state + index fingertip, in world (reference-space) coordinates.
 */
import {
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { PINCH_END, PINCH_START } from '../config.js';

export type PointerKind = 'hand' | 'controller' | 'mouse';

export interface Pointer {
  id: number;
  kind: PointerKind;
  handedness: XRHandedness;
  active: boolean;
  pinching: boolean;
  /** 0 = open, 1 = fully pinched (for cursor feedback) */
  strength: number;
  pinchPoint: Vector3;
  indexTip: Vector3 | null;
  /** Wrist/grip position, used for the palm-facing check of the help gesture. */
  wrist: Vector3 | null;
  /** Wrist (hand) or grip (controller) orientation, for twist-to-flip in Tetris mode. */
  wristQuat: Quaternion | null;
  /** Raw gamepad of a controller pointer (thumbstick / face buttons in Tetris mode). */
  gamepad: Gamepad | null;
}

const JOINTS: XRHandJoint[] = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpM = new Matrix4();
const tmpQ = new Quaternion();

export class HandTracker {
  readonly pointers: Pointer[] = [];
  /** Draw joint spheres (VR mode only; in passthrough you see your real hands). */
  showJoints = false;
  private jointMesh: InstancedMesh;
  private cursors = new Map<number, Mesh>();
  private cursorRoot = new Group();

  constructor(scene: Object3D) {
    this.jointMesh = new InstancedMesh(
      new SphereGeometry(0.0075, 10, 8),
      new MeshBasicMaterial({ color: 0xe8d6c4 }),
      JOINTS.length * 2,
    );
    this.jointMesh.count = 0;
    this.jointMesh.frustumCulled = false;
    scene.add(this.jointMesh, this.cursorRoot);
  }

  private pointer(id: number, kind: PointerKind, handedness: XRHandedness): Pointer {
    let p = this.pointers.find((x) => x.id === id);
    if (!p) {
      p = { id, kind, handedness, active: false, pinching: false, strength: 0, pinchPoint: new Vector3(), indexTip: null, wrist: null, wristQuat: null, gamepad: null };
      this.pointers.push(p);
    }
    return p;
  }

  /** Read all XR input sources for this frame. */
  update(frame: XRFrame, ref: XRReferenceSpace): void {
    for (const p of this.pointers) if (p.kind !== 'mouse') p.active = false;
    let jointCount = 0;
    for (const src of frame.session.inputSources) {
      const side = src.handedness === 'left' ? 0 : src.handedness === 'right' ? 1 : 2;
      if (src.hand) {
        const p = this.pointer(10 + side, 'hand', src.handedness);
        const thumb = frame.getJointPose?.(src.hand.get('thumb-tip')!, ref);
        const index = frame.getJointPose?.(src.hand.get('index-finger-tip')!, ref);
        const wrist = frame.getJointPose?.(src.hand.get('wrist')!, ref);
        if (!thumb || !index) continue;
        tmpA.set(thumb.transform.position.x, thumb.transform.position.y, thumb.transform.position.z);
        tmpB.set(index.transform.position.x, index.transform.position.y, index.transform.position.z);
        const dist = tmpA.distanceTo(tmpB);
        if (p.pinching) p.pinching = dist < PINCH_END;
        else p.pinching = dist < PINCH_START;
        p.strength = Math.min(1, Math.max(0, (PINCH_END + 0.02 - dist) / (PINCH_END + 0.02 - PINCH_START)));
        const mid = tmpA.add(tmpB).multiplyScalar(0.5);
        // Light smoothing kills tracking jitter without feeling laggy.
        if (!p.active && p.pinchPoint.lengthSq() === 0) p.pinchPoint.copy(mid);
        else p.pinchPoint.lerp(mid, p.pinching ? 0.55 : 0.7);
        p.indexTip = (p.indexTip ?? new Vector3()).copy(tmpB);
        p.wrist = wrist ? (p.wrist ?? new Vector3()).set(wrist.transform.position.x, wrist.transform.position.y, wrist.transform.position.z) : null;
        if (wrist) {
          const o = wrist.transform.orientation;
          p.wristQuat = (p.wristQuat ?? new Quaternion()).set(o.x, o.y, o.z, o.w);
        } else p.wristQuat = null;
        p.gamepad = null;
        p.active = true;
        if (this.showJoints) {
          for (const j of JOINTS) {
            const jp = frame.getJointPose?.(src.hand.get(j)!, ref);
            if (!jp) continue;
            const t = jp.transform.position;
            tmpM.compose(tmpA.set(t.x, t.y, t.z), tmpQ.identity(), tmpB.setScalar(Math.max(0.6, (jp.radius ?? 0.008) / 0.0075)));
            this.jointMesh.setMatrixAt(jointCount++, tmpM);
          }
        }
      } else if (src.gripSpace || src.targetRaySpace) {
        // Optional controller support: trigger = pinch, point = a few cm ahead of the grip.
        const pose = frame.getPose(src.gripSpace ?? src.targetRaySpace, ref);
        if (!pose) continue;
        const p = this.pointer(20 + side, 'controller', src.handedness);
        const o = pose.transform.orientation;
        tmpQ.set(o.x, o.y, o.z, o.w);
        const pos = pose.transform.position;
        const tip = tmpA.set(0, -0.01, -0.05).applyQuaternion(tmpQ).add(tmpB.set(pos.x, pos.y, pos.z));
        p.pinchPoint.copy(tip);
        p.indexTip = (p.indexTip ?? new Vector3()).copy(tip);
        p.wrist = null;
        p.wristQuat = (p.wristQuat ?? new Quaternion()).copy(tmpQ);
        p.gamepad = src.gamepad ?? null;
        const trig = src.gamepad?.buttons[0];
        p.pinching = !!trig && (trig.pressed || trig.value > 0.6);
        p.strength = trig?.value ?? 0;
        p.active = true;
      }
    }
    this.jointMesh.count = jointCount;
    this.jointMesh.instanceMatrix.needsUpdate = true;
    this.updateCursors();
  }

  /** Small ring at each pinch point; closes as the fingers close. */
  private updateCursors(): void {
    for (const p of this.pointers) {
      let c = this.cursors.get(p.id);
      if (!c) {
        c = new Mesh(
          new RingGeometry(0.006, 0.0085, 24),
          new MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85, depthTest: false }),
        );
        c.renderOrder = 10;
        this.cursorRoot.add(c);
        this.cursors.set(p.id, c);
      }
      c.visible = p.active && p.kind !== 'mouse';
      if (!c.visible) continue;
      c.position.copy(p.pinchPoint);
      const s = p.pinching ? 0.6 : 1.4 - 0.6 * p.strength;
      c.scale.setScalar(s);
      (c.material as MeshBasicMaterial).color.setHex(p.pinching ? 0xffd166 : 0x9fe8ff);
    }
  }

  /** Billboard cursors toward the viewer. */
  faceCursors(cameraPos: Vector3): void {
    for (const c of this.cursors.values()) if (c.visible) c.lookAt(cameraPos);
  }

  /** Mouse pointer (desktop dev / emulator without XR). */
  mouse(): Pointer {
    return this.pointer(1, 'mouse', 'none');
  }
}
