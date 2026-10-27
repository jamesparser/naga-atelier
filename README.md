# AgentAsia Voxel

**Talk it into the room. Sculpt it with your hands.**

AgentAsia Voxel is a seated mixed-reality block studio for Meta Quest 3. It runs in the browser (WebXR, nothing to install). Talk to **Naga**, a glass orb wrapped in a coiled serpent of light, and your hands do the rest.
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
| Quick pinch-tap on a block | Paints it with the active colour; tap a block that's *already* that colour to grow a new block out of the face you tapped (build sideways and up) |
| Pinch in empty space | A see-through cube shows where the block will go; move to aim, open your fingers to place it. Blocks **stick to any neighbour** (side, below or above), so doorways, arches and overhangs work; a block touching nothing drops onto what's below |
| Release over the red bin | Deletes what you are carrying |
| Invalid drop (out of bounds, blocked) | Springs back with an audio cue |
| Poke (or pinch) a dock button | Mic · Undo · Redo · 8 colours · ★ draft a blueprint · Re-centre desk |
| TURN ⟲ / TURN ⟳ | Turn the whole game 45° either way (e.g. to face someone beside you); RECENTER puts it back in front of you |
| SPIN | Spins your build a quarter turn on the board, like a turntable, to see its other sides (or say “spin the board”) |

Hand tracking has no haptics, so every action has a sound: pickup tick, snap thunk, delete whoosh, undo chime.
Everything sits within about 60 cm of a seated user, and the dock is in the lower field of view.

## Tetris mode

Open **ARCADE** and pick **Tetris** (or say **“let's play Tetris”**) and the desk turns into a 10 × 4 × 14 neon well.
The room dims, a hue-cycling vector tunnel and a warp starfield stream out behind the well, and a synthwave loop speeds up with every level.
The same cube blocks fall as the seven classic tetrominoes. Fill a straight row from left to right and it blows up
in sparkles. Fill a whole layer and you get a big bonus. Blocks above a cleared row fall into its slice.

| Action | Keyboard | Mouse / touch | Quest hands | Quest controller |
|---|---|---|---|---|
| Move left / right | ← → (or A/D) | drag sideways, or Left / Right buttons | pinch and move your hand | thumbstick left / right |
| Back row / front row (4 deep) | ↑ ↓ (or W/S) | drag up / down the screen, or Back row / Front row | pinch and move away / toward you | thumbstick up / down |
| Spin · Flip · Tilt | Q or E · R · F | quick tap = spin, or the buttons | quick pinch = spin; pinch + twist wrist = flip / tilt | A/X · B/Y · press stick |
| Fall faster · Drop now | hold Shift · Space | Faster (hold) · Drop | pull down · flick down | hold grip · trigger |
| Pause · Help · Back | P · ? · Esc | buttons in the control bar | poke PAUSE / BACK on the desk | press the desk buttons |

**Pick how deep the well is: 1–4 rows.** 1 row plays like classic Tetris (↑ rotates, ↓ falls faster); 2–4 rows add the 3D back/front rows. Use the row buttons on screen, keys 1–4, or poke **ROWS 1-4** on the desk. Changing rows starts a new game, and your choice is remembered (default: 1 row).

Your build desk is untouched while you play. Say **“back to building”** to return to it. Your best score is saved on the device.

## Angry Sling

Open **ARCADE** and pick **Angry Sling**, or say **“angry sling”**. A tabletop physics puzzle appears:
pull back the slingshot, let a glowing pebble fly, and knock down glass, wood and stone towers to pop the purple
*gloomlings* hiding in them. There are **12 levels** (First flight → Citadel), 3 stars each, and progress is saved on the device.

- **Hands:** pinch (on the pebble or anywhere), pull back toward you, release. The dotted arc shows where it will go.
- **Controller:** hold the trigger, pull back, let go.
- **Look from any angle:** lean in or walk around, or use the dock to **turn the arena** 45° left/right and **zoom** (1.15× ↔ 1.8×).
- **Clearing a level moves you straight to the next one** (after a 3-second celebration). After level 12 it starts over. **Dock:** back · retry · skip level · turn left · turn right · zoom · voice.
- **Desktop:** left-drag to pull (wheel while pulling aims higher), right-drag to orbit, R retry, N next, Q/E turn, Z zoom.

The physics (cannon-es) is simulated at full scale (1 m blocks) and rendered at 1:10, so towers fall with real weight.
Glass shatters easily, wood takes a few hits, stone is tough. Every level is unit-tested to stand still until hit and not collapse on its own.

## Arcade (9 games)

The mode bar on the left edge of the desk has two buttons: **BUILD** and **ARCADE**. Tap **ARCADE** (or say **“open the arcade”**, **“play star swarm”**, **“mike penguin”**…) and nine tiles appear on the desk: Tetris, Angry Sling and the seven below. Poke or pinch one, press 1–9, or click the buttons. Every game works with hands, Quest controllers, mouse, touch and keyboard. Each one has its own synthesised theme tune and sound effects, its best score is saved on the device, and a How to play card is on the desk and on screen.

| Game | What you do | Hands | Keyboard |
|---|---|---|---|
| **Star Swarm** | Space shooter: an alien swarm hovers at the back of the desk and dives at you in 3D curves | pinch + move to fly, hold to fire | arrows + Space |
| **Marble Maze** | Tilt a wooden board to roll a steel marble to the goal. A fresh maze each level, holes from level 4, auto-advance | pinch and push the way it should roll | hold arrows |
| **Whack-a-Gloom** | 60-second rounds: bop gloomlings (gold = 3 points, pebbles = −1), combos | poke with a finger or pinch | Q W E / A S D / Z X C |
| **Breakout 3D** | A glass box with a brick wall at the back. Your glass paddle follows your hand; a marker shows where the ball arrives | raise your hand, pinch to launch | arrows + Space |
| **Block Tower** | Real-physics stacking tower: pull a loose block out slowly, it goes on top. One collapse ends the game | pinch a block and pull | arrows pick, Space pushes, T to top |
| **Flap Bro** | *First person:* you are the bird. Flap through the gaps in the walls | pinch, or flap your arm down | Space |
| **Mike Penguin** | *First person:* race down a 3-lane ice road; jump holes and cracks, dodge seals, grab fish, reach each flag before the clock runs out | pinch-swipe to change lane, quick pinch to jump | ← → Space, hold ↓ to slow |

First-person comfort: you never move. The world moves past you, and the desk and dock stay fixed in front of you.

## Voice commands

Naga understands open phrasing through an LLM, with a fast deterministic parser for clear commands:

- **Build (29 ready-made models):** house, castle, tower, lighthouse, windmill, bridge, pyramid, arch, wall, stairs, maze, garden, tree, tent, car, train, sailboat, aeroplane, rocket, robot, dog, snowman, heart, table, chair, bench, bed, shelf, fireplace. Add *on the left / right*, *floating*, *tiny / big / huge*, or a colour.
- **Anything else:** “build me a dragon”, “a guitar”, “a laptop”. When there is no ready-made model, Naga sculpts one from blocks on the spot: a stronger model (DeepSeek V4 Flash, with gpt-oss-120b as backup) composes it from up to 60 boxes, with named parts you can grab and recolour. It's validated and capped at 600 blocks. Simple objects come out clearly recognisable; complex creatures are rougher.
- **Parts by name:** “paint the wheels gold”, “make the sail blue”, “move the roof left” work on every model's named parts.
- **Edit:** “make the roof red”, “paint the windows blue”, “a bit bigger / smaller”, “rotate it”, “move it left”.
- **Desk tools (productivity):**
  - “make three more chairs”, “duplicate it”, “copy the car”: copies laid out in a row, each one grabbable
  - “get rid of the chimney”, “remove the roof”: delete a part by name
  - “mirror it”: flip left-right
  - “replace red with blue”: swap a colour everywhere
  - “write HELLO”, “spell TEAM in red”: block lettering for signs and labels
  - “make a bar chart of 3, 7, 5 and 9”, “graph our sales 12 18 9”: a 3D bar chart, bars to scale
  - “sketch a floor plan with 3 rooms”: a room layout with walls, doorways and a front door
  - “how many blocks”, “what's on my desk”, “how tall is the castle”: spoken answers with real-world sizes in centimetres
  - “save this as kitchen”, “load kitchen”, “list my saves”: named layouts kept on the device; loading is one step you can undo
- **Context-aware:** each request sends the AI a short summary of what's on the desk (objects, where they are, their parts), so “put a lamp next to the bed” and “paint the table legs black” refer to real things.
- **Board colour:** the build board starts green; “make the board blue”, “board colour black”, “clear board” (see-through), or tap **BOARD** on the dock to cycle colours. Your choice is remembered.
- **Grid and history:** “I need more room” (a finer grid that keeps your build), “undo”, “redo”, “clear the desk” (or the CLEAR button; UNDO brings it back).

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

- **Protocol** (`shared/protocol.ts`): versioned `BuildCommand` (`build | sculpt | clear | color | move | undo | redo | scale | rotate`) inside an `{speech, build}` envelope. Every command is validated before it touches the world.
- **Blueprints** (`scripts/genBlueprints.mjs` → `src/blueprints/*.json`): 29 hand-authored voxel models (40–265 blocks each). Each has named parts (`roof`, `walls/windows`, …) that you grab as one piece and can refer to by voice.
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
| `SCULPT_MODEL` | Optional override for open-ended sculpt requests (default DeepSeek V4 Flash, then gpt-oss-120b) |
| `AGENT_MODE` | `hybrid` (default), `llm`, or `rules` |
| `ALLOWED_ORIGINS` | CORS allow-list if the client is hosted on another origin |

The endpoint is public and rate-limited (30 requests per minute per IP). `GET /api/quest/chat` reports which capabilities are configured.

## Without the agent

Remove the agent and you still have a complete tool: hand sculpting, 29 blueprints from the ★ button, colours, undo/redo, persistence, and **HTML export** (in the debug panel) that saves your desk as a standalone, orbitable 3D page.

## License

MIT
