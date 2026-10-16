/**
 * Naga Atelier — entry point. Wires scene, hands, voxel world, agent and onboarding.
 */
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DEBUG, DESK_BELOW_HEAD, DESK_FORWARD, LOW_FX, QUERY, CELL } from './config.js';
import { sanitizeCommand, BLUEPRINT_IDS, type AgentEnvelope, type BuildCommand, type BlueprintId } from '../shared/protocol.js';
import { VoxelModel, key } from './blocks/voxelModel.js';
import { VoxelRenderer } from './blocks/voxelRenderer.js';
import { buildDesk } from './scene/desk.js';
import { Dock, type DockAction } from './ui/dock.js';
import { HandTracker } from './hands/handInput.js';
import { Interaction, type InteractionEvent } from './hands/interaction.js';
import { Naga } from './naga/naga.js';
import { sfx } from './audio/sfx.js';
import { AgentClient } from './agent/client.js';
import { VoiceInput } from './agent/voice.js';
import { Speaker } from './agent/tts.js';
import { executeCommand } from './agent/executor.js';
import { BLUEPRINTS } from './blueprints/index.js';
import { Onboarding } from './onboarding.js';
import { downloadWorld } from './export/worldExport.js';
import { mountDebugPanel } from './debug.js';

async function boot(): Promise<void> {
  if (QUERY.has('emulate')) {
    const { XRDevice, metaQuest3 } = await import('iwer');
    const device = new XRDevice(metaQuest3);
    device.installRuntime({ forceInstall: true });
    device.primaryInputMode = 'hand';
    (window as unknown as { __iwer: unknown }).__iwer = device;
  }
  start();
}

function start(): void {
  // ------------------------------------------------------------------ renderer
  const shadows = !LOW_FX;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(0.6);
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = true;
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new Scene();
  const bg = new Color(0x0e1620);
  scene.background = bg;
  const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 50);
  camera.position.set(0, 1.36, 0.5);

  scene.add(new HemisphereLight(0xffffff, 0x3a4656, 1.5));

  // ---------------------------------------------------------------- desk space
  const desk = buildDesk(shadows);
  const deskRoot = desk.root;
  deskRoot.position.set(0, 0.76, -0.22);
  scene.add(deskRoot);
  desk.vrDesk.visible = true;
  camera.lookAt(new Vector3(0, 0.84, -0.3));

  const sun = new DirectionalLight(0xffffff, 1.9);
  sun.position.set(0.25, 0.9, 0.4);
  sun.target = deskRoot;
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = -0.5; c.right = 0.5; c.top = 0.5; c.bottom = -0.5; c.near = 0.1; c.far = 2.5;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.01;
  }
  deskRoot.add(sun);

  const model = new VoxelModel();
  const voxels = new VoxelRenderer(model, deskRoot, shadows);
  const dock = new Dock();
  deskRoot.add(dock.root);
  const naga = new Naga();
  deskRoot.add(naga.root, naga.caption.mesh);
  const hands = new HandTracker(scene);

  const agent = new AgentClient();
  const voice = new VoiceInput();
  const speaker = new Speaker(() => sfx.ctx);

  // ------------------------------------------------------------- persistence
  const SAVE_KEY = 'naga-atelier:world:v1';
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved && !QUERY.has('fresh')) model.load(JSON.parse(saved));
  } catch {
    /* ignore */
  }
  let saveTimer = 0;
  model.on((e) => {
    if (e.source === 'silent') return; // mid-carry states are not saved
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(model.toJSON()));
      } catch {
        /* quota / private mode */
      }
    }, 800);
  });

  // ------------------------------------------------------------- toasts
  const toastEl = document.getElementById('toast')!;
  let toastTimer = 0;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3200);
  };

  // ------------------------------------------------------------- agent glue
  const say = (text: string, audio?: AgentEnvelope['audio']) => {
    if (!text) return;
    naga.caption.say(text);
    naga.setMood('speaking');
    void speaker.speak(text, audio).finally(() => {
      if (naga.currentMood === 'speaking') naga.setMood('idle');
    });
  };

  const pending: BuildCommand[] = [];
  let onboarding: Onboarding;

  /** Apply one command now (caller guarantees hands are not mid-carry). */
  const apply = (cmd: BuildCommand): { ok: boolean; speech?: string } => {
    const res = executeCommand(model, cmd);
    const now = performance.now();
    if (res.spawn) {
      voxels.animateSpawn(res.spawn.order, now);
      sfx.play('cast');
      naga.setMood('casting', 900, now);
      onboarding.event('built');
    } else if (res.ok) {
      if (cmd.type === 'undo') {
        sfx.play('undo');
        onboarding.event('undo');
      } else if (cmd.type === 'redo') sfx.play('redo');
      else if (cmd.type === 'clear') sfx.play('delete');
      else sfx.play('paint');
      if (res.keys) voxels.pulse(res.keys, now);
    } else {
      sfx.play('error');
    }
    return res;
  };

  const handleEnvelope = (env: AgentEnvelope) => {
    if (env.transcript) naga.caption.heard(env.transcript);
    let speech = env.speech;
    if (env.build) {
      if (interaction.busy) {
        pending.push(env.build); // hands win: apply after the drop
      } else {
        const res = apply(env.build);
        if (!res.ok && res.speech) speech = res.speech;
      }
    }
    say(speech, speech === env.speech ? env.audio : null);
    if (DEBUG) console.info('[agent]', env.source, env.transcript, env.build);
  };

  const runText = async (text: string) => {
    naga.caption.heard(text);
    naga.setMood('thinking');
    dock.setMicState('thinking');
    const env = await agent.sendText(text);
    dock.setMicState('idle');
    handleEnvelope(env);
  };

  const onMic = async () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    speaker.stop();
    sfx.play('listen');
    naga.setMood('listening');
    dock.setMicState('listening');
    naga.caption.say('Listening…', 8000);
    const r = await voice.listen(sfx.ctx, agent.caps.stt);
    if (r.kind === 'text') {
      await runText(r.text);
      return;
    }
    if (r.kind === 'audio') {
      naga.setMood('thinking');
      dock.setMicState('thinking');
      naga.caption.say('…');
      try {
        handleEnvelope(await agent.sendAudio(r.blob));
      } catch (e) {
        say((e as Error).message === 'stt_unavailable' ? "I can't hear in this browser yet — tap the star instead." : "Agent busy — sculpt with your hands, I'll be right back.");
        naga.setMood('resting', 3000);
      }
      dock.setMicState('idle');
      return;
    }
    dock.setMicState('idle');
    naga.setMood('idle');
    if (r.reason === 'mic_denied' || r.reason === 'not-allowed') say('I need microphone access to hear you.');
    else if (r.reason === 'no_stt') say("Voice isn't available here — tap the star or use your hands.");
    else if (r.reason !== 'stopped') say("I didn't catch that. Tap the mic and try again.");
  };

  let magicIndex = 0;
  const magicOrder: BlueprintId[] = ['house_small', 'tower', 'garden', 'arch', 'bench', 'stairs', 'fireplace', 'desk_shelf', 'maze_tiny', 'wall'];
  const onMagic = () => {
    const id = magicOrder[magicIndex++ % magicOrder.length];
    const res = apply({ v: 1, type: 'build', blueprintId: id, anchor: 'desk_center' });
    say(res.ok ? `Here's a ${BLUEPRINTS[id].label.toLowerCase()}.` : res.speech ?? 'No room for that.');
  };

  let placeDeskNextFrame = false;

  const onDock = (action: DockAction) => {
    if (action.startsWith('swatch:')) {
      dock.setActiveSwatch(action.slice(7) as never);
      sfx.play('click');
      return;
    }
    switch (action) {
      case 'mic': void onMic(); break;
      case 'undo':
      case 'redo':
        interaction.cancelAll();
        if (!apply({ v: 1, type: action }).ok) toast(`Nothing to ${action}`);
        break;
      case 'magic': interaction.cancelAll(); onMagic(); break;
      case 'recenter':
        sfx.play('click');
        placeDeskNextFrame = true;
        say('Desk re-centred.');
        break;
    }
  };

  const onInteraction = (e: InteractionEvent) => {
    switch (e.type) {
      case 'dock': onDock(e.action); break;
      case 'carried': if (e.moved) onboarding.event('carried'); break;
      case 'placed': onboarding.event('placed'); break;
      case 'painted': onboarding.event('painted'); break;
      case 'deleted': onboarding.event('deleted'); break;
      case 'detached': onboarding.event('detached'); break;
    }
  };

  const interaction = new Interaction(model, voxels, desk, dock, deskRoot, shadows, onInteraction);

  onboarding = new Onboarding({
    say: (t) => say(t),
    hint: (t) => naga.caption.setHint(t),
    attention: (id) => dock.setAttention(id),
    chime: () => sfx.play('chime'),
    voiceReady: () => VoiceInput.browserSttAvailable() || (agent.caps.stt && VoiceInput.recordingAvailable()),
    spawnStarterBlock: () => {
      const k = key(0, 0, 0);
      if (model.cells.has(k)) return;
      model.commit('starter', model.diff([[k, { c: 'gold', cl: null }]]));
      voxels.animateSpawn([k], performance.now());
      voxels.pulse([k], performance.now() + 2e4);
    },
  });

  // ------------------------------------------------------------- XR session
  const enterBtn = document.getElementById('enter') as HTMLButtonElement;
  const micBtn = document.getElementById('mic') as HTMLButtonElement;
  const statusEl = document.getElementById('status')!;
  const landing = document.getElementById('landing')!;
  let xrMode: XRSessionMode | null = null;
  let session: XRSession | null = null;
  let firstSession = true;

  const sessionInit: XRSessionInit = {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['hand-tracking', 'plane-detection'],
  };

  const onSessionStarted = async (s: XRSession) => {
    session = s;
    sfx.unlock();
    const passthrough = xrMode === 'immersive-ar';
    scene.background = passthrough ? null : bg;
    desk.vrDesk.visible = !passthrough;
    hands.showJoints = !passthrough;
    await renderer.xr.setSession(s);
    landing.classList.add('hidden');
    placeDeskNextFrame = true;
    s.addEventListener('end', () => {
      session = null;
      voice.stop();
      speaker.stop();
      interaction.cancelAll();
      scene.background = bg;
      desk.vrDesk.visible = true;
      hands.showJoints = false;
      deskRoot.position.set(0, 0.76, -0.22);
      deskRoot.rotation.set(0, 0, 0);
      landing.classList.remove('hidden');
      enterBtn.textContent = 'Resume';
    });
    s.addEventListener('visibilitychange', () => {
      if (s.visibilityState === 'visible') {
        sfx.resume();
        say('Welcome back.');
      } else {
        voice.stop();
        speaker.stop();
        interaction.cancelAll();
        sfx.suspend();
      }
    });
    if (firstSession) {
      firstSession = false;
      setTimeout(() => onboarding.start(QUERY.has('tutorial')), 600);
    } else {
      say('Welcome back.');
    }
  };

  const enter = async () => {
    if (!xrMode || session) return;
    sfx.unlock();
    try {
      const s = await navigator.xr!.requestSession(xrMode, sessionInit);
      await onSessionStarted(s);
    } catch (e) {
      statusEl.textContent = `Could not start XR: ${(e as Error).message}`;
    }
  };
  enterBtn.addEventListener('click', () => void enter());

  micBtn.addEventListener('click', async () => {
    sfx.unlock();
    const ok = await voice.warmUp();
    micBtn.textContent = ok ? 'Microphone ready ✓' : 'Microphone blocked';
    micBtn.classList.toggle('ok', ok);
  });

  (async () => {
    const caps = agent.probe();
    let ar = false, vr = false;
    try {
      ar = (await navigator.xr?.isSessionSupported('immersive-ar')) ?? false;
      vr = (await navigator.xr?.isSessionSupported('immersive-vr')) ?? false;
    } catch {
      /* no WebXR */
    }
    xrMode = QUERY.has('vr') && vr ? 'immersive-vr' : ar ? 'immersive-ar' : vr ? 'immersive-vr' : null;
    const c = await caps;
    const voiceNote = VoiceInput.browserSttAvailable() || c.stt ? 'Voice ready.' : 'Voice: hands + ★ mode (no speech service).';
    if (xrMode) {
      enterBtn.disabled = false;
      enterBtn.textContent = xrMode === 'immersive-ar' ? 'Enter (passthrough)' : 'Enter (VR)';
      statusEl.textContent = `${xrMode === 'immersive-ar' ? 'Mixed reality' : 'VR'} ready · hands only · ${voiceNote}`;
      // Quest Browser can offer the session from its own UI (one tap from the address bar).
      const xr = navigator.xr as XRSystem & { offerSession?: (m: XRSessionMode, i: XRSessionInit) => Promise<XRSession> };
      if (xr.offerSession && !QUERY.has('emulate')) {
        xr.offerSession(xrMode, sessionInit).then((s) => { if (!session) void onSessionStarted(s); }).catch(() => {});
      }
    } else {
      enterBtn.textContent = 'Open on Quest 3';
      statusEl.textContent = 'No WebXR here — preview with your mouse (click to add, drag to move). Add ?emulate=1 for the XR emulator.';
      landing.addEventListener('click', (e) => {
        if (e.target === landing) landing.classList.add('hidden');
      });
      setTimeout(() => landing.classList.add('hidden'), 4000);
      onboarding.start(QUERY.has('tutorial'));
    }
    if (!VoiceInput.browserSttAvailable() && !VoiceInput.recordingAvailable()) micBtn.style.display = 'none';
  })();

  // ------------------------------------------------------------- desk placement
  const placeDesk = (frame: XRFrame | undefined) => {
    // Read the head pose straight from the frame: the XR camera object is only refreshed during render.
    const ref0 = renderer.xr.getReferenceSpace();
    const vp = frame && ref0 ? frame.getViewerPose(ref0) : null;
    if (!vp) {
      placeDeskNextFrame = true; // try again next frame
      return;
    }
    const tp = vp.transform.position, to = vp.transform.orientation;
    const head = new Vector3(tp.x, tp.y, tp.z);
    const fwd = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(to.x, to.y, to.z, to.w));
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const pos = head.clone().addScaledVector(fwd, DESK_FORWARD);
    pos.y = head.y - DESK_BELOW_HEAD;
    // If the headset knows where the real table is, sit exactly on it.
    const planes = (frame as XRFrame & { detectedPlanes?: Set<XRPlane & { semanticLabel?: string }> })?.detectedPlanes;
    const ref = renderer.xr.getReferenceSpace();
    if (planes && ref && frame) {
      let bestY: number | null = null;
      let bestD = 0.9;
      for (const p of planes) {
        if (p.orientation !== 'horizontal' || (p.semanticLabel && !/table|desk|other/i.test(p.semanticLabel))) continue;
        const pose = frame.getPose(p.planeSpace, ref);
        if (!pose) continue;
        const py = pose.transform.position.y;
        const dxz = Math.hypot(pose.transform.position.x - pos.x, pose.transform.position.z - pos.z);
        if (py < head.y - 0.15 && py > head.y - 0.9 && dxz < bestD) {
          bestD = dxz;
          bestY = py;
        }
      }
      if (bestY !== null) pos.y = bestY + 0.002;
    }
    deskRoot.position.copy(pos);
    deskRoot.rotation.set(0, Math.atan2(fwd.x, fwd.z) + Math.PI, 0);
  };

  // ------------------------------------------------------------- mouse (desktop preview)
  const mouse = hands.mouse();
  const ray = new Raycaster();
  const ndc = new Vector2();
  let dragPlaneY: number | null = null;
  const deskPlane = new Plane();
  const setMouse = (ev: PointerEvent) => {
    ndc.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const up = new Vector3(0, 1, 0).applyQuaternion(deskRoot.quaternion);
    if (dragPlaneY === null) {
      const hit = ray.intersectObject(voxels.mesh, false)[0];
      if (hit) {
        mouse.pinchPoint.copy(hit.point).addScaledVector(ray.ray.direction, CELL * 0.3);
        mouse.active = true;
        return;
      }
      deskPlane.setFromNormalAndCoplanarPoint(up, deskRoot.position.clone().addScaledVector(up, CELL * 0.5));
    } else {
      deskPlane.setFromNormalAndCoplanarPoint(up, deskRoot.localToWorld(new Vector3(0, dragPlaneY, 0)));
    }
    const p = ray.ray.intersectPlane(deskPlane, new Vector3());
    mouse.active = !!p;
    if (p) mouse.pinchPoint.copy(p);
  };
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', (ev) => {
    if (!session) setMouse(ev);
  });
  canvas.addEventListener('pointerdown', (ev) => {
    if (session) return;
    sfx.unlock();
    setMouse(ev);
    dragPlaneY = deskRoot.worldToLocal(mouse.pinchPoint.clone()).y;
    mouse.pinching = true;
  });
  window.addEventListener('pointerup', () => {
    mouse.pinching = false;
    dragPlaneY = null;
  });
  canvas.addEventListener('wheel', (ev) => {
    if (dragPlaneY !== null) {
      dragPlaneY = Math.max(0, dragPlaneY - Math.sign(ev.deltaY) * CELL);
      ev.preventDefault();
    }
  }, { passive: false });
  window.addEventListener('keydown', (ev) => {
    if ((ev.target as HTMLElement).tagName === 'INPUT' || (ev.target as HTMLElement).tagName === 'TEXTAREA') return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') onDock(ev.shiftKey ? 'redo' : 'undo');
    else if (ev.key === ' ') { ev.preventDefault(); void onMic(); }
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ------------------------------------------------------------- frame loop
  let last = performance.now();
  let fps = 0, frames = 0, fpsT = last;
  const camPos = new Vector3();
  renderer.setAnimationLoop((_t, frame) => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frames++;
    if (now - fpsT > 1000) {
      fps = (frames * 1000) / (now - fpsT);
      frames = 0;
      fpsT = now;
    }
    if (frame && session) {
      if (placeDeskNextFrame) {
        placeDeskNextFrame = false;
        placeDesk(frame);
      }
      const ref = renderer.xr.getReferenceSpace();
      if (ref) hands.update(frame, ref);
      mouse.active = false;
    }
    interaction.update(hands.pointers, now);
    while (pending.length && !interaction.busy) apply(pending.shift()!);
    voxels.update(now);
    naga.setLevel(voice.listening ? voice.level : speaker.level);
    naga.update(now, dt);
    onboarding.tick(now);
    camPos.setFromMatrixPosition((session ? renderer.xr.getCamera() : camera).matrixWorld);
    hands.faceCursors(camPos);
    renderer.render(scene, camera);
  });

  // ------------------------------------------------------------- debug / test hooks
  const api = {
    model,
    apply: (raw: unknown) => {
      const cmd = sanitizeCommand(raw);
      if (!cmd) return { ok: false, speech: 'invalid command' };
      return apply(cmd);
    },
    say: (text: string) => runText(text),
    envelope: handleEnvelope,
    export: () => downloadWorld(model),
    stats: () => ({ fps: Math.round(fps), blocks: model.size, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, session: !!session, mode: xrMode }),
    blueprints: BLUEPRINT_IDS,
    onboarding,
    enter,
    caps: () => agent.caps,
    /** test hooks: desk-cell centre -> world, and live pointer state */
    deskToWorld: (x: number, y: number, z: number) => deskRoot.localToWorld(new Vector3((x + 0.5) * CELL, (y + 0.5) * CELL, (z + 0.5) * CELL)).toArray(),
    pointers: () => hands.pointers.map((p) => ({ id: p.id, kind: p.kind, active: p.active, pinching: p.pinching, pinch: p.pinchPoint.toArray(), tip: p.indexTip?.toArray() ?? null })),
    caption: () => naga.caption,
    interaction,
  };
  (window as unknown as { __naga: typeof api }).__naga = api;
  if (DEBUG) mountDebugPanel(api);
}

void boot();
