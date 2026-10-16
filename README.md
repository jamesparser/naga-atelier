# AgentAsia Voxel

**Talk it into the room. Sculpt it with your hands.**

AgentAsia Voxel is a seated mixed-reality block studio for Meta Quest 3. It runs in the browser (WebXR, nothing to install). Talk to **Naga**, the coiled-serpent companion, and your hands do the rest.
You say what you want and Naga, a small coiled-serpent companion, drafts it on your real desk in passthrough.
Then you fix it with your hands: pinch, slide, snap, tap, drop it in the bin, undo. You never need to pick up a controller.

> **Agent drafts, human sculpts.** AI placement won't always be right, and that's expected.
> Correcting it by hand isn't a fallback. It's the product.

Built for the Meta VR Start Developer Competition 2026 (Productivity track, New Experience division).

**Try it:** open **https://naga-atelier.vercel.app** in Quest Browser on a Quest 3 / 3S.

## The 60-second loop

1. Open the URL in Quest Browser and tap **Enter**. Passthrough fades in and a build grid sits on your desk.
2. Pinch the glowing block and drag it. It snaps to the grid with a soft *thunk*.
3. Tap the mic and say **“Build a small house.”** Naga answers out loud and the cottage pops in layer by layer.
4. Pinch the roof and slide it off. Hold a wall block still to pop it free, then drop it in the bin. Tap **undo** to bring it back.
5. Say **“Make the roof red,”** **“a bit bigger,”** **“rotate it,”** or **“build a tower on the left.”**

## Hand interactions (no controllers)

| Gesture | Result |
|---|---|
| Pinch a block and move | Carries its whole part (roof, walls, tower…), snaps to a 4 cm grid on release, settles under gravity |
| Pinch a block and hold still (~0.8 s) | Pops that single block free from its part |
| Quick pinch-tap on a block | Paints it with the active colour |
| Quick pinch-tap on empty desk | Places a block (it stacks onto whatever is below) |
| Release over the red bin | Deletes what you are carrying |
| Invalid drop (out of bounds, blocked) | Springs back with an audio cue |
| Poke (or pinch) a dock button | Mic · Undo · Redo · 8 colours · ★ draft a blueprint · Re-centre desk |

Hand tracking has no haptics, so every action has a sound: pickup tick, snap thunk, delete whoosh, undo chime.
Everything sits within about 60 cm of a seated user, and the dock is in the lower field of view.

## Tetris mode

Tap the **T-block** button on the dock (or say **“let's play Tetris”**) and the desk turns into a 10 × 4 × 14 glass well.
The same cube blocks fall as the seven classic tetrominoes. Fill a straight row from left to right and it blows up
in sparkles. Fill a whole layer and you get a big bonus. Blocks above a cleared row fall into its slice.

| Hands | Controller (optional) | Keyboard (desktop) |
|---|---|---|
| Pinch anywhere and move: steer left/right and toward/away | Thumbstick | Arrows / WASD |
| Pinch and twist your wrist about 50°: flip about that axis | A/X spin · B/Y flip · grip tilt | Q/E spin · R flip · F tilt |
| Quick pinch-tap: spin | | |
| Pinch and pull down: soft drop · flick down fast: hard drop | Stick click: hard drop | Shift soft · Enter hard |
| Dock: tilt · flip · spin · drop · pause · back to build (house) | | P pause · Esc exit |

Your build desk is untouched while you play. Say **“back to building”** to return to it. Your best score is saved on the device.

## Voice commands

Naga understands open phrasing through an LLM, with a fast deterministic parser for clear commands:

- **Build:** house / cottage, stairs, wall, tower / castle, garden, shelf, arch / gate, bench, fireplace, maze. Add *on the left / right*, *floating*, *tiny / big / huge*, or a colour.
- **Edit:** “make the roof red”, “paint the windows blue”, “a bit bigger / smaller”, “rotate it”, “move it left”.
- **History:** “undo”, “redo”, “clear the desk”.

If the agent is unreachable, every hand interaction still works, and typed or recognised commands fall back to the on-device parser.

## Architecture

```
Quest Browser (WebXR immersive-ar, hand-tracking)          Vercel
┌─────────────────────────────────────────────┐            ┌──────────────────────────────┐
│ hands/   pinch · poke · carry state machine │            │ api/quest/chat.ts            │
│ blocks/  VoxelModel (undo/redo) + 1 instanced│  HTTPS     │  audio → STT (AssemblyAI)    │
│          mesh renderer                      │ ─────────▶ │  text  → rules ∥ LLM         │
│ agent/   client · push-to-talk · TTS        │ ◀───────── │  → {speech, build} (+ TTS)   │
│ naga/    presence orb + captions            │  envelope  └──────────────────────────────┘
│ onboarding · dock · export                  │
└─────────────────────────────────────────────┘
```

- **Protocol** (`shared/protocol.ts`): versioned `BuildCommand` (`build | clear | color | move | undo | redo | scale | rotate`) inside an `{speech, build}` envelope. Every command is validated before it touches the world.
- **Blueprints** (`scripts/genBlueprints.mjs` → `src/blueprints/*.json`): 10 hand-authored voxel structures (40–185 blocks each). Each has named parts (`roof`, `walls/windows`, …) that you grab as one piece and can refer to by voice.
- **World** (`src/blocks/voxelModel.ts`): every edit is a list of cell changes, so place, move, paint, spawn, scale, rotate and clear all share one 20-step undo stack.
- **Rendering:** the whole world is a single `InstancedMesh` draw call. Each carried group is one more call. Typical scenes use fewer than 35 draw calls.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
#   ?emulate=1  Quest 3 emulator (IWER) with hands, for desktop development
#   ?debug=1    debug panel: spawn blueprints, raw commands, FPS / draw calls
#   ?tutorial   replay onboarding   ?fresh  ignore the saved desk   ?vr  force VR instead of passthrough
npm test               # unit tests: protocol, intent parser, voxel model, blueprints, undo
npm run e2e            # headless emulator run of the judge loop (needs `npm run dev` running)
npm run build          # blueprints + typecheck + production bundle
```

To test on a headset over your LAN, run `npm run dev:https` and open `https://<your-ip>:5173` in Quest Browser.

### Agent configuration (server only)

Copy `.env.example` to `.env` for local dev, or set these in your Vercel project. Keys never reach the client bundle.

| Variable | Purpose |
|---|---|
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Any OpenAI-compatible chat endpoint (default: Nemotron 3 Nano on Nebius Token Factory) |
| `ASSEMBLYAI_API_KEY` | Speech-to-text for Quest Browser (it has no built-in speech recognition) |
| `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_VOICE` | Optional OpenAI-compatible TTS (e.g. Kokoro, `am_adam`); otherwise the browser voice is used |
| `AGENT_MODE` | `hybrid` (default), `llm`, or `rules` |
| `ALLOWED_ORIGINS` | CORS allow-list if the client is hosted on another origin |

The endpoint is public and rate-limited (30 requests per minute per IP). `GET /api/quest/chat` reports which capabilities are configured.

## Without the agent

Remove the agent and you still have a complete tool: hand sculpting, 10 blueprints from the ★ button, colours, undo/redo, persistence, and **HTML export** (in the debug panel) that saves your desk as a standalone, orbitable 3D page.

## License

MIT
