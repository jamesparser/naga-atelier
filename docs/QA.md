# QA checklist (run on a real Quest 3 before submitting)

## Hands
- [ ] Every flow completes with controllers off (Settings → Hands and controllers → hands only)
- [ ] Pinch-grab / move / snap / delete (bin) / undo work reliably at arm's length
- [ ] Both hands work, including carrying two things at once
- [ ] Nothing requires standing up or walking

## Agent
- [ ] "Build a …" works for all 10 blueprints (house, stairs, wall, tower, garden, shelf, arch, bench, fireplace, maze)
- [ ] Naga's spoken reply is audible and the caption shows both lines
- [ ] Clear / undo / redo / "make the roof red" / bigger / rotate / move left
- [ ] With Wi-Fi off mid-session: hands still fully usable and Naga shows a resting state

## Build
- [ ] ≥ 60 fps (OVR Metrics Tool or `?debug=1`) in the heaviest scene (6 blueprints)
- [ ] Quest 3S if available
- [ ] Remove headset and put it back on: world intact, "Welcome back"
- [ ] Production HTTPS URL, opened fresh in Quest Browser (no cache)

## Content
- [ ] English only, no third-party logos
- [ ] Captions for every voice line
- [ ] A new user reaches the first "wow" within 2 minutes, without help

## Tetris mode
- [ ] Dock T-block button / "let's play Tetris" starts a game, "back to building" restores the desk untouched
- [ ] Pinch-steer feels 1:1; twisting the wrist flips reliably without accidental flips while steering
- [ ] Flick down hard-drops; pinch-tap spins; the dock flip buttons work by poking
- [ ] Line clear sparkles + sound; full layer gives a bigger burst and "Full layer!"
- [ ] Top of the well comfortably visible while seated; 60 fps during clears
