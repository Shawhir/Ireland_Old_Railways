// The coastlines of Ireland and Britain inked as on the 1920 sheet, for the opening: the map's own
// inked coast is drawn by the sea (sea3d.js), which only starts once the flight has landed, and
// outlines on the draped land fills made the flight hitch. So this draws both coasts with our own
// WebGL (a RenderNode, like the railway lines): every stretch of coast a screen-space capsule a
// pixel and a bit wide, uploaded once. Britain's ink fades out as Britain does; Ireland's hands
// over to the sea's once that has faded in.

const VERT = `#version 300 es
in vec3 aA;
in vec3 aB;
in float aIsle;    // 0 Ireland, 1 Britain
uniform mat4 uMV, uProj;
uniform vec2 uViewport;
uniform float uHalf;
uniform vec2 uAlpha;   // Ireland, Britain
out vec2 vP;
flat out vec2 vA, vB;
flat out float vAlpha;
void main() {
  vAlpha = aIsle < 0.5 ? uAlpha.x : uAlpha.y;
  vec4 ca = uProj * (uMV * vec4(aA, 1.0)), cb = uProj * (uMV * vec4(aB, 1.0));
  if (vAlpha <= 0.0 || ca.w <= 0.0 || cb.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uViewport, sb = (cb.xy / cb.w * 0.5 + 0.5) * uViewport;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  float u = float(gl_VertexID & 1), s = float(gl_VertexID >> 1) * 2.0 - 1.0;
  float r = uHalf + 1.5;
  vec2 p = mix(sa, sb, u) + dir * (u * 2.0 - 1.0) * r + nrm * s * r;
  vP = p; vA = sa; vB = sb;
  gl_Position = vec4(p / uViewport * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vP;
flat in vec2 vA, vB;
flat in float vAlpha;
uniform float uHalf;
uniform vec3 uInk;
out vec4 fragColor;
void main() {
  vec2 pa = vP - vA, ba = vB - vA;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float a = clamp(uHalf + 0.5 - length(pa - ba * h), 0.0, 1.0) * vAlpha;
  if (a <= 0.0) discard;
  fragColor = vec4(uInk * a, a);
}`;

export function createCoastInk({ view, RenderNode, webgl, SpatialReference, islands, ink = [0.227, 0.227, 0.196] }) {
  // `islands`: [Ireland polygon, Britain polygon or null], in WGS84.
  const rings = [];
  islands.forEach((poly, isle) => { if (poly) for (const ring of poly.rings) rings.push({ ring, isle }); });
  const segCount = rings.reduce((n, r) => n + r.ring.length - 1, 0);
  const lonlat = new Float64Array(rings.reduce((n, r) => n + r.ring.length, 0) * 3);
  { let k = 0; for (const { ring } of rings) for (const [lon, lat] of ring) { lonlat[k++] = lon; lonlat[k++] = lat; lonlat[k++] = 30; } }
  const alpha = [1, 1];
  let origin = null, inst = null;
  const mv = new Float32Array(16);

  const InkNode = RenderNode.createSubclass({
    // Over the land (and anything draped on it), under the clouds.
    consumes: { required: ["opaque-color"] },
    produces: "opaque-color",
    setup(gl) {
      const world = new Float64Array(lonlat.length);
      webgl.toRenderCoordinates(view, lonlat, 0, SpatialReference.WGS84, world, 0, lonlat.length / 3);
      origin = [world[0], world[1], world[2]];
      inst = new Float32Array(segCount * 7);
      let v = 0, s = 0;
      for (const { ring, isle } of rings) {
        for (let i = 1; i < ring.length; i++) {
          const a = (v + i - 1) * 3, b = (v + i) * 3, o = s * 7;
          for (let c = 0; c < 3; c++) { inst[o + c] = world[a + c] - origin[c]; inst[o + 3 + c] = world[b + c] - origin[c]; }
          inst[o + 6] = isle;
          s++;
        }
        v += ring.length;
      }
      const shader = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        return sh;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      this.prog = prog;
      this.loc = Object.fromEntries(["uMV", "uProj", "uViewport", "uHalf", "uAlpha", "uInk"].map((n) => [n, gl.getUniformLocation(prog, n)]));
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
      const attr = (name, size, offset) => {
        const l = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, 28, offset * 4);
        gl.vertexAttribDivisor(l, 1);
      };
      attr("aA", 3, 0); attr("aB", 3, 3); attr("aIsle", 1, 6);
      gl.bindVertexArray(null);
    },
    render() {
      const output = this.bindRenderTarget();
      if (alpha[0] <= 0 && alpha[1] <= 0) return output;
      const gl = this.gl;
      if (!this.prog) this.setup(gl);
      const V = this.camera.viewMatrix;
      for (let i = 0; i < 12; i++) mv[i] = V[i];
      for (let r = 0; r < 3; r++) mv[12 + r] = V[r] * origin[0] + V[4 + r] * origin[1] + V[8 + r] * origin[2] + V[12 + r];
      mv[15] = 1;
      const [, , w, h] = gl.getParameter(gl.VIEWPORT);
      const dpr = this.camera.pixelRatio || window.devicePixelRatio || 1;
      const L = this.loc;
      gl.useProgram(this.prog);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(L.uMV, false, mv);
      gl.uniformMatrix4fv(L.uProj, false, this.camera.projectionMatrix);
      gl.uniform2f(L.uViewport, w, h);
      gl.uniform1f(L.uHalf, 0.7 * dpr);   // about a pixel and a half of ink, as the sea's coast
      gl.uniform2f(L.uAlpha, alpha[0], alpha[1]);
      gl.uniform3fv(L.uInk, ink);
      gl.bindVertexArray(this.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segCount);
      gl.bindVertexArray(null);
      this.resetWebGLState();
      return output;
    },
  });
  const node = new InkNode({ view });

  return {
    // How much of each coast's ink shows, 0..1.
    set(ireland, britain) {
      alpha[0] = ireland; alpha[1] = britain;
      node.requestRender();
    },
    destroy() { node.destroy(); },
  };
}
