# Quest 3 test runbook — AgentAsia Voxel

**Live URL:** https://naga-atelier.vercel.app  
**Date:** keep this next to the headset. Work through top to bottom.

---

## 0. Before you put the headset on (2 min on Mac)

1. **Optional voice keys** (only if you want “build a house” by voice):
   ```bash
   cd ~/Developer/projects/naga-atelier
   # paste each key when prompted — do not paste keys into chat
   vercel env add ASSEMBLYAI_API_KEY production
   vercel env add LLM_API_KEY production
   vercel env add LLM_MODEL production   # e.g. nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B
   vercel --prod   # or push to private main to redeploy
   ```
   Verify:
   ```bash
   curl -s https://naga-atelier.vercel.app/api/quest/chat
   ```
   Want: `{"stt":true,"llm":true}`.  
   **Without keys that is fine** — hands + ★ star button still work. Rule parser still answers typed/demo commands.

2. Optional desktop warm-up (no headset):
   - https://naga-atelier.vercel.app/?emulate=1  
   - Click **Enter XR**, move the fake hands, pinch the gold block.

---

## 1. Put on Quest 3 (5 min setup)

1. **Wi-Fi on**, same network as nothing special (it’s a public URL).
2. **Quest Browser** (the globe / Browser app) — not a random browser.
3. Go to: `https://naga-atelier.vercel.app`
4. First time: tap **Allow microphone** on the landing page (needed for voice later).
5. Tap **Enter VR** (or Enter AR if offered).
6. If a system chip appears (offerSession / “Enter virtual world”), **select it** so audio unlocks.

**Hands only (required for judging):**
- Quick settings → **Hands and controllers** → **Hands** (controllers off / put them down).

---

## 2. First-run checklist (do in order)

### A. Desk looks right
- [ ] Passthrough on — you see your real room  
- [ ] Grid/desk sits in front of you at a comfortable height (blocks glued to desk, not floating at your face)  
- [ ] Dock buttons along the front edge of the desk (mic, undo, redo, colors, ★, export, recenter)  
- [ ] Naga orb + caption panel visible, not covering the build area  

If desk is wrong: poke **recenter** on the dock.

### B. Hands feel right (the important part)
1. **Pinch the gold block** (thumb + index). It should highlight, then lift.  
2. **Drag it** left/right. It should follow your hand.  
3. **Release** — it **snaps** to the grid with a soft click.  
4. **Poke / pinch empty grid** — place a new block.  
5. Drag a block into the **trash zone** (right edge) — it deletes.  
6. Dock → **undo** — block comes back.  

If pinches miss:
| Symptom | Tune in `src/config.ts` |
|---|---|
| Hard to start a grab | lower `PINCH_START` (0.022 → 0.018) |
| Drops too early | raise `PINCH_END` (0.04 → 0.05) |
| Accidental grabs | raise `GRAB_RADIUS` down / raise firm-pinch strength |
| Jittery drag | raise `DRAG_THRESHOLD` slightly |
| Dock hard to poke | `BUTTON_Y` in `src/ui/dock.ts` |

### C. Agent builds (works with ★ even without API keys)
1. Poke **★ (magic)** on the dock.  
   → House (or next shape) should **cast in** with sound + caption.  
2. **Pinch the roof** as one cluster and slide it.  
3. **Undo**.  
4. Cycle ★ through house / tower / garden…  

With **voice keys set**: tap **mic**, say *“build a small house”* → Naga speaks + structure appears.

### D. Export (nice video beat)
- Poke the **download** dock button (or say *“export my desk”*).  
- On Quest Browser this may download HTML — check Downloads.

### E. Session health
- [ ] Take headset **off**, put it **back on** → world intact, “Welcome back”  
- [ ] Heaviest scene (~6 shapes) stays smooth  
- [ ] If stutter: add `?lowfx=1` to the URL and retest  

---

## 3. FPS check

- Fast: does it **feel** smooth while dragging?  
- Better: `https://naga-atelier.vercel.app/?debug=1` then look for FPS / draw calls.  
- Target: **≥60 fps**. If not: `?lowfx=1`, or we lower shadows (tell me the number you see).

---

## 4. 10-minute judge rehearsal

Time yourself. A stranger should finish this without help:

1. Put on headset → open URL → Enter VR (≤2 min)  
2. Grab gold block, move it, snap  
3. ★ → house appears  
4. Move roof, undo, clear (voice or dock)  
5. Smile moment — under **10 minutes** total  

---

## 5. Report back (copy this)

When you finish one pass, tell me:

```
Desk placement: good / too high / too low / too far
Pinch grab: good / misses often / drops early
Snap: good / too sticky / not snapping
Dock poke: good / hard to hit
★ build: good / ...
Voice: not tested / works / mic denied / STT fail / LLM fail
FPS: ~__ (or "felt smooth" / "felt choppy")
Export: works / blocked
Worst thing that broke: ________
```

I’ll tune `config.ts` / interaction from that report and push a new deploy.

---

## 6. URL cheatsheet

| URL | Use |
|---|---|
| `https://naga-atelier.vercel.app` | normal |
| `?debug=1` | debug panel (FPS, export, tutorial) |
| `?tutorial` | replay onboarding |
| `?fresh` | ignore saved desk |
| `?lowfx=1` | no shadows (perf) |
| `?emulate=1` | desktop XR emulator (no headset) |

---

**You cannot break the public app by poking it. Worst case: close the tab and reopen the URL.**
