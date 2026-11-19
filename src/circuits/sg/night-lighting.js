import * as THREE from 'three';
import { night } from '../../util.js';

/** 夜赛的补光沿现有路面展开，沿用沥青的颜色、磨损与胎痕。 */
export function addRoadFill(material, length, uvMetres, strength) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const bands = Math.max(1, Math.round(length / 84));
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uRouteNight = night;
    shader.uniforms.uRouteGain = { value: strength };
    shader.uniforms.uRoutePhase = { value: 2 * Math.PI * bands * uvMetres / length };
    shader.vertexShader = `varying vec2 vRoute;
      ${shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRoute = uv;')}`;
    shader.fragmentShader = `varying vec2 vRoute;
      uniform float uRouteNight;
      uniform float uRouteGain;
      uniform float uRoutePhase;
      ${shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float phase = vRoute.x * uRoutePhase;
        float across = smoothstep(0.0, 0.19, vRoute.y) * (1.0 - smoothstep(0.81, 1.0, vRoute.y));
        float spread = 0.78 + 0.21 * across + 0.09 * cos(phase) + 0.10 * (vRoute.y - 0.5) * sin(phase * 2.0);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.025, 1.0, 0.94) * uRouteNight * uRouteGain * spread;`)}`;
  };
  material.customProgramCacheKey = () => `${key}|sg-route-fill`;
}

/** 水面的局部碎光，范围按地标到滨水区的关系近似。 */
export function addBayGlints(material, { esplanade, merlion }) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const reflection = ([x, n], dx, dz) => new THREE.Vector2(x + dx, -n + dz);
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uBayNight = night;
    shader.uniforms.uEsplanadeGlint = { value: reflection(esplanade, -10, 116) };
    shader.uniforms.uMerlionGlint = { value: reflection(merlion, 62, 49) };
    shader.vertexShader = `varying vec2 vBayXZ;
      ${shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vBayXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')}`;
    shader.fragmentShader = `varying vec2 vBayXZ;
      uniform float uBayNight;
      uniform vec2 uEsplanadeGlint;
      uniform vec2 uMerlionGlint;
      ${shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uBayNight > 0.0) {
          vec2 a = (vBayXZ - uEsplanadeGlint) / vec2(84.0, 93.0);
          vec2 b = (vBayXZ - uMerlionGlint) / vec2(54.0, 76.0);
          float arts = 1.0 - smoothstep(0.0, 1.0, length(a));
          float lion = 1.0 - smoothstep(0.0, 1.0, length(b));
          float wave = vBayXZ.y * 0.92 + sin(vBayXZ.x * 0.19 + vBayXZ.y * 0.13)
                       + 0.6 * sin(vBayXZ.x * 0.41 - vBayXZ.y * 0.31);
          float streak = smoothstep(0.58, 0.99, sin(wave));
          float breakup = 0.6 + 0.4 * sin(vBayXZ.x * 0.27 + vBayXZ.y * 0.61 + 1.7 * sin(vBayXZ.x * 0.081));
          float glints = 0.26 + 0.62 * streak * breakup * (1.0 - smoothstep(0.6, 2.4, fwidth(wave)));
          totalEmissiveRadiance += uBayNight * glints * (arts * vec3(0.068, 0.041, 0.018) + lion * vec3(0.039, 0.051, 0.065));
        }`)}`;
  };
  material.customProgramCacheKey = () => `${key}|sg-water-light`;
}
