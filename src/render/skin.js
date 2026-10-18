import * as THREE from 'three';

// A transparent paint layer replaces clay only where it has alpha. Do not turn the
// body transparent: erased areas reveal the original opaque clay, not a hole in the hero.
export function setSkinMap(mesh, texture, premultiplied = false) {
  if (!mesh.userData.skinMaterial) {
    mesh.material = mesh.material.clone();
    mesh.userData.skinMaterial = true;
  }
  const material = mesh.material;
  material.map = texture;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 paint = texture2D(map, vMapUv);
        diffuseColor.rgb = diffuseColor.rgb * (1.0 - paint.a)
          + paint.rgb ${premultiplied ? '' : '* paint.a'};
      #endif
    `);
  };
  material.customProgramCacheKey = () => `skin-texture-v2-${premultiplied}`;
  material.needsUpdate = true;
}

// Bake the standing pose once: picking and projection painting must not repeatedly run
// CPU skinning, and must address exactly the same UVs as the animated game mesh.
export function createSkinPicker(mesh) {
  mesh.skeleton?.update();
  const source = mesh.geometry, position = source.attributes.position;
  if (!source.attributes.uv) throw new Error('The character has no SkinUV atlas');
  const geometry = new THREE.BufferGeometry();
  const posed = new Float32Array(position.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) { mesh.getVertexPosition(i, v); v.toArray(posed, i * 3); }
  geometry.setAttribute('position', new THREE.BufferAttribute(posed, 3));
  geometry.setAttribute('uv', source.attributes.uv.clone());
  if (source.index) geometry.setIndex(source.index.clone());
  geometry.computeBoundingSphere();
  const picker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: mesh.material.side }));
  picker.matrixAutoUpdate = false;
  picker.matrix.copy(mesh.matrixWorld); picker.matrixWorld.copy(mesh.matrixWorld);
  return picker;
}
