# Submission kit (draft)

## Devpost form

| Field | Draft |
|---|---|
| Name | AgentAsia Voxel |
| Tagline (≤140) | Talk it into the room. Sculpt it with your hands. |
| Track / Division | Productivity · New Experience |
| Build URL | https://naga-atelier.vercel.app (WebXR, opens in Quest Browser) |
| Video | `<YouTube/Vimeo, public, < 3:00>` |
| Repo | public mirror of this repository |

### Description (≤500 words)

**Inspiration.** Sketching ideas in 3D is still slow: you either learn a CAD tool or settle for flat drawings. Mixed reality puts a canvas right on your desk, and voice can get the first draft there in seconds. But AI placement is never quite right. So we built around a simple idea: *the agent drafts, the human sculpts.*

**What it does (Productivity).** Sit at any desk, put on a Quest 3 and open a URL. Talk to Naga in English, Japanese, French and more — it answers out loud and looks things up on the live web (Tavily + LLM). Ask it to build almost anything in blocks on your real desk, then sculpt with your hands. Switch block size 12×12 → 64×64 for engineering/art prototypes at multiple levels of detail. Export as HTML. Nine desk games for breaks: Tetris, Sling, Star Swarm, Marble Maze, Whack-a-Gloom, Breakout 3D, Block Tower, Flap Bro, and Mike Penguin.


**How we built it.** WebXR (immersive-ar with hand tracking) on Three.js. The whole voxel world is one instanced draw call, and every edit (place, move, paint, spawn, scale, rotate, clear) is a reversible cell-change list, which gives a 20-step undo for free. A small serverless agent turns speech into a versioned `{speech, build}` envelope. A deterministic parser handles clear commands in milliseconds, an LLM handles open-ended requests, and every command is validated before it touches the world. If the network drops, hands keep working and commands fall back to on-device parsing.

**Hand interactions.** Pinch-grab with snap-to-grid and gravity settle, part grabbing (whole roof or wall as one piece), hold-to-detach, pinch-tap place/paint, trash zone, spring-back on invalid drops, poke buttons, and two hands working independently.

**What's next.** More blueprints and user-saved blueprints, two-hand scale and rotate, real-table detection everywhere, multiplayer desks, and export to common 3D formats.

## Video beat sheet (< 3:00, real headset capture)

| Time | Shot |
|---|---|
| 0:00–0:15 | Title card + "Talk it into the room. Sculpt it with your hands." |
| 0:15–0:40 | Put on headset, open URL, Enter. Passthrough desk, Naga greets, pinch-drag the glowing block (snap sound). |
| 0:40–1:20 | Tap mic: "Build a small house on the desk." Agent voice + layered spawn. Keep agent audio audible. |
| 1:20–2:10 | Pinch roof → slide; hold a wall block → pop free → drop in bin; undo; "make the roof red"; "build a tower on the left". |
| 2:10–2:40 | Why it matters: agent drafts, hands correct; hands-only, seated, works offline. |
| 2:40–3:00 | Name + URL. |

Capture tips: record from the headset (Quest screen recording) at 1080p, seated, with good room lighting for passthrough. Do one dry run with captions visible.
