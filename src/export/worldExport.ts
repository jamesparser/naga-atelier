/**
 * Export the desk as a standalone HTML file (Three.js from a CDN + orbit controls).
 */
import { CELL } from '../config.js';
import { PALETTE } from '../blocks/palette.js';
import type { VoxelModel } from '../blocks/voxelModel.js';

export function worldHtml(model: VoxelModel, title = 'My AgentAsia Voxel desk'): string {
  const cells = [...model.cells].map(([k, c]) => [...k.split(',').map(Number), PALETTE[c.c]]);
  const data = JSON.stringify({ cell: CELL, cells });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/</g, '&lt;')}</title>
<style>html,body{margin:0;height:100%;background:#0e1620;color:#cfe;font:14px system-ui,sans-serif}#h{position:fixed;left:12px;bottom:10px;opacity:.7}</style>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.181.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.181.0/examples/jsm/"}}</script>
</head><body><div id="h">Built with AgentAsia Voxel · drag to orbit</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const D = ${data};
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(devicePixelRatio); r.setSize(innerWidth, innerHeight); r.shadowMap.enabled = true;
document.body.appendChild(r.domElement);
const s = new THREE.Scene(); s.background = new THREE.Color(0x0e1620);
const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 20); cam.position.set(0.5, 0.55, 0.8);
const ctl = new OrbitControls(cam, r.domElement); ctl.target.set(0, 0.08, 0); ctl.update();
s.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(0.4, 1, 0.6); sun.castShadow = true; s.add(sun);
const g = new THREE.BoxGeometry(D.cell * 0.98, D.cell * 0.98, D.cell * 0.98);
const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.7 }), Math.max(1, D.cells.length));
const M = new THREE.Matrix4(), C = new THREE.Color();
D.cells.forEach(([x, y, z, hex], i) => { M.makeTranslation((x + .5) * D.cell, (y + .5) * D.cell, (z + .5) * D.cell); m.setMatrixAt(i, M); m.setColorAt(i, C.setHex(hex)); });
m.castShadow = m.receiveShadow = true; s.add(m);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: 0x6b4f3a })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight); });
r.setAnimationLoop(() => { ctl.update(); r.render(s, cam); });
</script></body></html>`;
}

export function downloadWorld(model: VoxelModel): void {
  const blob = new Blob([worldHtml(model)], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'agentasia-voxel-world.html';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
