# Naga Atelier

**Talk it into the room. Sculpt it with your hands.**

A seated, hands-first mixed-reality block studio for Meta Quest 3, built for the web (WebXR, no install).
You speak, Naga — a small spatial companion — drafts a structure on your real desk, and you fix it with
your hands: pinch, slide, snap, tap, undo. No controllers required.

> Agent drafts, human sculpts. AI placement will not always be right — hand correction is not a fallback, it is the product.

Status: in active development for the Meta VR Start Developer Competition 2026 (Productivity · New Experience).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (add ?emulate=1 for the desktop XR emulator, ?debug=1 for the debug panel)
npm test             # unit tests (model, blueprints, intent parser, protocol)
npm run build        # typecheck + production bundle in dist/
```

On a Quest 3, open the deployed HTTPS URL in Quest Browser and tap **Enter**.

## License

MIT
