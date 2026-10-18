// Render real, posed character thumbnails, not the flattened UV atlas. Reuse the
// editor's WebGL context and one small render target; never create a context per card.
import * as THREE from 'three';
import { createFigure } from './figure.js';
import { setSkinMap } from './skin.js';
import { skinImage } from '../game/skinfiles.js';
import { linearPaintToPNG } from '../core/skin.js';

export class SkinPreview {
  constructor(renderer) {
    this.renderer = renderer;
    this.figure = createFigure(); this.meshes = [];
    this.figure.model.traverse(o => {
      if (o.isMesh) { o.userData.skinMaterial = true; this.meshes.push(o); }
    });
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#19212f');
    this.scene.add(this.figure.group, new THREE.HemisphereLight(0xffffff, 0x8293ac, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(2, 4, 5); this.scene.add(light);
    this.figure.group.updateMatrixWorld(true);
    this.meshes.forEach(mesh => mesh.skeleton?.update());
    const box = new THREE.Box3().setFromObject(this.figure.group), centre = box.getCenter(new THREE.Vector3());
    const height = box.getSize(new THREE.Vector3()).y;
    this.camera = new THREE.PerspectiveCamera(30, 144 / 180, .01, 100);
    const distance = height / 2 / Math.tan(Math.PI / 12) * 1.15;
    this.camera.position.copy(centre).add(new THREE.Vector3(distance * .2, height * .03, distance));
    this.camera.lookAt(centre); this.camera.updateMatrixWorld();
    this.target = new THREE.WebGLRenderTarget(144, 180, { generateMipmaps: false });
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.disposed = false;
  }
  render(blob) {
    this.pending = (this.pending ?? Promise.resolve()).catch(() => {}).then(() => this.renderOne(blob));
    return this.pending;
  }
  async renderOne(blob) {
    if (this.disposed) return null;
    const image = await skinImage(blob);
    if (this.disposed) return null;
    const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
    try {
      this.meshes.forEach(mesh => setSkinMap(mesh, texture));
      const r = this.renderer, previous = r.getRenderTarget();
      r.setRenderTarget(this.target); r.render(this.scene, this.camera); r.setRenderTarget(previous);
      const pixels = new Uint8Array(144 * 180 * 4);
      await r.readRenderTargetPixelsAsync(this.target, 0, 0, 144, 180, pixels);
      if (this.disposed) return null;
      const canvas = document.createElement('canvas'); canvas.width = 144; canvas.height = 180;
      canvas.getContext('2d').putImageData(new ImageData(linearPaintToPNG(pixels, 144, 180), 144, 180), 0, 0);
      return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    } finally {
      if (!this.disposed) this.meshes.forEach(mesh => setSkinMap(mesh, null));
      texture.dispose();
    }
  }
  dispose() {
    this.disposed = true; this.target.dispose();
    // Geometry and custom shadow materials are owned by the shared rig.
    this.meshes.forEach(mesh => mesh.material.dispose());
  }
}
