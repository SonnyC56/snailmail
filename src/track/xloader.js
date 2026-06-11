/**
 * Loader for the original game's ".X2" meshes — a flattened DirectX .x text
 * format. Layout (one mesh per file):
 *
 *   Frame MeshMaterialList { nMat; nFaceIdx; <face material idxs>;
 *       Material <name> { r;g;b;a;; power; sr;sg;sb;; er;eg;eb;;
 *           TextureFilename { "tex.tga"; } } ... }
 *   MeshTextureCoords { nUV; u;v;, ... }
 *   Mesh <shape> { nVerts; x;y;z;, ... nFaces; 4;a,b,c,d;, 3;a,b,c;, ... }
 *
 * UVs are per-vertex (nUV == nVerts). Faces are tris or quads (triangulated
 * here). DirectX is left-handed, so we negate Z and reverse winding to match
 * three.js' right-handed space.
 */

import * as THREE from 'three';
import { assets } from '../assets.js';

/** Pure parse → plain geometry arrays (unit-testable, no three.js needed). */
export function parseX(text) {
  // strip /* */ and // comments
  const src = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  const texMatch = src.match(/TextureFilename\s*\{\s*"([^"]+)"/);
  const texture = texMatch ? texMatch[1] : null;

  // a forward number reader anchored at an index
  const numReader = (fromIdx) => {
    const re = /-?\d+\.?\d*(?:[eE][-+]?\d+)?/g;
    re.lastIndex = fromIdx;
    return () => { const m = re.exec(src); return m ? parseFloat(m[0]) : null; };
  };

  // --- UVs ---
  let uvs = [];
  const tcIdx = src.indexOf('MeshTextureCoords');
  if (tcIdx >= 0) {
    const open = src.indexOf('{', tcIdx);
    const next = numReader(open + 1);
    const nUV = Math.round(next());
    for (let i = 0; i < nUV; i++) {
      const u = next(), v = next();
      // TGALoader already decodes top-down, so the .x V maps directly — an
      // extra 1-v flip rendered flat meshes (the post-office banner) upside down.
      uvs.push(u, v);
    }
  }

  // --- Mesh (vertices + faces): the geometry "Mesh <name> {", not the
  //     MeshMaterialList / MeshTextureCoords / MeshNormals templates ---
  const meshRe = /Mesh\s+(?!MaterialList|TextureCoords|Normals)[A-Za-z_]\w*\s*\{/g;
  const mm = meshRe.exec(src);
  if (!mm) throw new Error('parseX: no Mesh block');
  const meshOpen = mm.index + mm[0].length;
  const next = numReader(meshOpen);

  const nVerts = Math.round(next());
  const positions = new Array(nVerts * 3);
  for (let i = 0; i < nVerts; i++) {
    const x = next(), y = next(), z = next();
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = -z; // LH → RH
  }

  const nFaces = Math.round(next());
  const indices = [];
  for (let f = 0; f < nFaces; f++) {
    const cnt = Math.round(next());
    const idx = [];
    for (let k = 0; k < cnt; k++) idx.push(Math.round(next()));
    // reverse winding (LH → RH), triangulate fans
    if (cnt === 3) indices.push(idx[0], idx[2], idx[1]);
    else if (cnt === 4) indices.push(idx[0], idx[2], idx[1], idx[0], idx[3], idx[2]);
    else for (let k = 1; k < cnt - 1; k++) indices.push(idx[0], idx[k + 1], idx[k]);
  }

  return { positions, uvs, indices, texture, nVerts, nFaces };
}

export class XLoader {
  constructor() { this._cache = new Map(); }

  /**
   * Load a mesh. `dir` is the staged folder (e.g. 'X' or 'OBJECTS/BARRIER').
   * Returns a Promise<THREE.Mesh> (geometry cached by path).
   */
  async geometry(dir, name) {
    const key = `${dir}/${name}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const p = (async () => {
      const text = await assets.text(`${dir}/${name}.X2`);
      const g = parseX(text);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
      if (g.uvs.length === g.positions.length / 3 * 2) geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
      geo.setIndex(g.indices);
      geo.computeVertexNormals();
      geo.userData.texture = g.texture;
      return geo;
    })();
    this._cache.set(key, p);
    return p;
  }

  /** Build a textured mesh; texture resolved from the same dir by basename. */
  async mesh(dir, name, { color = 0xffffff, doubleSide = true } = {}) {
    const geo = await this.geometry(dir, name);
    const matOpts = { color, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide };
    const texName = geo.userData.texture;
    if (texName) {
      const base = texName.replace(/\.[^.]+$/, '').toUpperCase();
      matOpts.map = assets.texture(`${dir}/${base}`, {});
      matOpts.transparent = true;
      matOpts.alphaTest = 0.3;
    }
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial(matOpts));
  }
}

export const xloader = new XLoader();
