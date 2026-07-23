(function () {
  "use strict";

  const canvas = document.getElementById("cosmosWebgl");
  if (!canvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const maxCanvasPixels = 720000;
  const idleFrameInterval = 1000 / 12;
  const activeFrameInterval = 1000 / 24;
  const gl =
    canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance"
    }) ||
    canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance"
    });

  if (!gl) {
    canvas.classList.add("cosmos-fallback");
    return;
  }

  const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  const precision = isWebGL2 ? "precision highp float;" : "precision mediump float;";
  const vertSrc = isWebGL2
    ? `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`
    : `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

  const fragmentHeader = isWebGL2
    ? `#version 300 es
${precision}
in vec2 v_uv;
out vec4 outColor;
#define FRAG_COLOR outColor`
    : `${precision}
varying vec2 v_uv;
#define FRAG_COLOR gl_FragColor`;

  const fragSrc = `${fragmentHeader}
uniform vec2 u_res;
uniform float u_time;
uniform float u_sync;
uniform float u_burst;
uniform float u_jump;
uniform vec2 u_pointer;
uniform vec2 u_jump_origin;
uniform float u_theme;

#define PI 3.14159265359

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.56;
  mat2 turn = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = turn * p * 2.03 + vec2(0.31, -0.17);
    amplitude *= 0.46;
  }
  return value;
}

vec3 starLayer(vec2 uv, float density, float size, float threshold, float timeValue) {
  vec2 grid = uv * density;
  vec2 id = floor(grid);
  vec2 cell = fract(grid) - 0.5;
  float seed = hash(id);
  vec2 offset = vec2(hash(id + 19.4), hash(id + 57.1)) - 0.5;
  float distanceToStar = length(cell - offset * 0.54);
  float twinkle = 0.62 + 0.38 * sin(timeValue * (0.7 + seed * 2.4) + seed * 45.0);
  float core = smoothstep(size, 0.0, distanceToStar) * step(threshold, seed);
  float glow = smoothstep(size * 5.0, 0.0, distanceToStar) * step(threshold + 0.014, seed) * 0.26;
  vec3 cold = vec3(0.66, 0.80, 1.0);
  vec3 warm = vec3(1.0, 0.80, 0.57);
  return mix(cold, warm, smoothstep(0.975, 1.0, seed)) * (core + glow) * twinkle;
}

void main() {
  vec2 screenUv = v_uv;
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec2 pointer = (u_pointer - 0.5) * vec2(0.05, 0.035);
  float timeValue = u_time * (0.13 + u_sync * 0.32);

  vec3 col = mix(vec3(0.002, 0.005, 0.012), vec3(0.012, 0.022, 0.042), screenUv.y);
  col += vec3(0.02, 0.035, 0.064) * (1.0 - length(uv) * 0.38);

  // A restrained Milky Way band, angled across the panoramic window.
  float galaxyAngle = -0.31;
  mat2 galaxyRotation = mat2(cos(galaxyAngle), -sin(galaxyAngle), sin(galaxyAngle), cos(galaxyAngle));
  vec2 galaxyUv = galaxyRotation * (uv + pointer * 0.32);
  float galaxyNoise = fbm(galaxyUv * 2.2 + vec2(timeValue * 0.018, 7.4));
  float galaxyFine = noise(galaxyUv * 7.2 + vec2(-timeValue * 0.011, 22.0));
  float galaxyDistance = abs(galaxyUv.y - 0.18 + (galaxyNoise - 0.5) * 0.16);
  float galaxyBand = exp(-pow(galaxyDistance * 3.4, 2.0));
  float galaxyCore = exp(-pow(galaxyDistance * 9.0, 2.0));
  vec3 galaxyWarm = vec3(0.47, 0.35, 0.28);
  vec3 galaxyCold = vec3(0.22, 0.34, 0.53);
  col += mix(galaxyCold, galaxyWarm, galaxyFine) * galaxyBand * (0.38 + galaxyNoise * 0.92);
  col += vec3(0.72, 0.68, 0.62) * galaxyCore * pow(galaxyFine, 2.3) * 0.60;
  col -= vec3(0.035, 0.026, 0.022) * galaxyCore * smoothstep(0.48, 0.74, galaxyNoise) * 0.8;

  // Two star layers preserve depth while keeping the full-screen shader light.
  col += starLayer(uv + pointer * 0.22, 42.0, 0.020, 0.958, timeValue) * 0.72;
  col += starLayer(uv * 1.72 + pointer * 0.86, 82.0, 0.010, 0.973, timeValue * 1.35) * 0.58;

  // Denser dust inside the galactic band.
  vec2 dustUv = (galaxyUv + vec2(2.0)) * 145.0;
  vec2 dustGrid = floor(dustUv);
  vec2 dustCell = fract(dustUv) - 0.5;
  float dustSeed = hash(dustGrid);
  vec2 dustOffset = vec2(hash(dustGrid + 13.1), hash(dustGrid + 31.7)) - 0.5;
  float dustDistance = length(dustCell - dustOffset * 0.45);
  float dust = smoothstep(0.12, 0.0, dustDistance) * step(0.978, dustSeed) * galaxyBand * (0.35 + 0.65 * galaxyFine);
  col += mix(vec3(0.54, 0.70, 1.0), vec3(1.0, 0.77, 0.52), dustSeed) * dust * 0.72;

  // Synchronizing is restrained; a cockpit hyperjump punches a much brighter
  // radial tunnel through the same lightweight shader.
  float warp = clamp(u_sync * 0.92 + u_burst * 0.24 + u_jump * 1.72, 0.0, 2.8);
  if (warp > 0.01) {
    vec2 jumpCenter = (u_jump_origin - vec2(0.5)) * u_res / min(u_res.x, u_res.y);
    vec2 warpPoint = uv - mix(vec2(0.0, 0.02), jumpCenter, min(1.0, u_jump * 0.86));
    float angle = atan(warpPoint.y, warpPoint.x);
    float radius = length(warpPoint);
    float spokes = pow(max(0.0, sin(angle * 47.0 + hash(vec2(floor(angle * 31.0), 4.0)) * 4.0)), 18.0);
    float streak = spokes * smoothstep(0.11, 0.82, radius) * (1.0 - smoothstep(0.78, 1.18, radius));
    col += mix(vec3(0.34, 0.66, 1.0), vec3(0.86, 0.76, 0.57), hash(vec2(angle, 9.0))) * streak * warp * 0.44;
    col += vec3(0.22, 0.48, 0.92) * exp(-radius * 4.2) * warp * 0.10;

    if (u_jump > 0.001) {
      float angularCell = (angle + PI) / (2.0 * PI) * 132.0;
      float rayId = floor(angularCell);
      float raySeed = hash(vec2(rayId, 73.4));
      float rayCore = exp(-abs(fract(angularCell) - 0.5) * 74.0) * step(0.54, raySeed);
      float rayWindow = smoothstep(0.045, 0.15, radius) * (1.0 - smoothstep(0.76, 1.42, radius));
      float flow = 0.68 + 0.32 * sin(radius * 24.0 - u_time * 42.0 + raySeed * 8.0);
      vec3 rayColor = mix(vec3(0.16, 0.56, 1.0), vec3(0.90, 0.96, 1.0), raySeed);
      col += rayColor * rayCore * rayWindow * flow * u_jump * 2.35;
      col += vec3(0.34, 0.73, 1.0) * exp(-radius * 9.0) * u_jump * 0.72;
      col += vec3(0.12, 0.42, 0.92) * exp(-abs(radius - 0.29) * 20.0) * u_jump * 0.22;
    }
  }

  float vignette = smoothstep(1.28, 0.28, length((screenUv - 0.5) * vec2(1.13, 1.24)));
  col *= mix(0.28, 1.0, vignette);
  col = mix(col, col * vec3(0.82, 0.91, 1.05), 0.16);
  col = mix(col, col * 1.12 + vec3(0.008, 0.012, 0.02), u_theme * 0.16);
  col = pow(max(col, 0.0), vec3(0.91));
  FRAG_COLOR = vec4(col, 1.0);
}`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("[cosmos-webgl] shader compile failed", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) {
    canvas.classList.add("cosmos-fallback");
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("[cosmos-webgl] program link failed", gl.getProgramInfoLog(program));
    canvas.classList.add("cosmos-fallback");
    return;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, "a_pos");
  const uRes = gl.getUniformLocation(program, "u_res");
  const uTime = gl.getUniformLocation(program, "u_time");
  const uSync = gl.getUniformLocation(program, "u_sync");
  const uBurst = gl.getUniformLocation(program, "u_burst");
  const uJump = gl.getUniformLocation(program, "u_jump");
  const uPointer = gl.getUniformLocation(program, "u_pointer");
  const uJumpOrigin = gl.getUniformLocation(program, "u_jump_origin");
  const uTheme = gl.getUniformLocation(program, "u_theme");

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let frameId = 0;
  const start = performance.now();
  let syncTarget = 0;
  let syncLevel = 0;
  let burst = 0.2;
  const pointer = { x: 0.5, y: 0.45 };
  const pointerSmooth = { x: 0.5, y: 0.45 };
  const jumpOrigin = { x: 0.5, y: 0.52 };
  const hyperjumpDuration = 1480;
  const hyperjumpFrameInterval = 1000 / 30;
  let jumpStartedAt = -Infinity;
  let lastFrame = performance.now();
  let lastPaint = 0;
  let lastPointerMove = 0;
  let forcePaint = true;
  let cachedThemeValue = document.documentElement.dataset.theme === "light" ? 1 : 0;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function getJumpLevel(now) {
    const elapsed = now - jumpStartedAt;
    if (elapsed < 0 || elapsed >= hyperjumpDuration) {
      if (elapsed >= hyperjumpDuration) jumpStartedAt = -Infinity;
      return 0;
    }
    const t = clamp(elapsed / hyperjumpDuration, 0, 1);
    const attackProgress = clamp(t / 0.075, 0, 1);
    const attack = 0.38 + 0.62 * (1 - Math.pow(1 - attackProgress, 3));
    const decay = t <= 0.075 ? 1 : Math.pow(1 - (t - 0.075) / 0.925, 1.58);
    const aftershock = Math.exp(-Math.pow((t - 0.29) / 0.055, 2)) * 0.17;
    return clamp(attack * decay + aftershock, 0, 1.18);
  }

  function resize() {
    width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const nativeRatio = Math.min(window.devicePixelRatio || 1, 1);
    const budgetRatio = Math.sqrt(maxCanvasPixels / Math.max(1, width * height));
    pixelRatio = Math.max(0.42, Math.min(nativeRatio, budgetRatio));
    const nextWidth = Math.max(1, Math.round(width * pixelRatio));
    const nextHeight = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    forcePaint = true;
  }

  function render(now) {
    frameId = 0;
    if (document.hidden) return;
    const delta = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    const jumpLevel = getJumpLevel(now);
    syncLevel += (syncTarget - syncLevel) * Math.min(1, delta * 3.5);
    burst = Math.max(0, burst - delta * 0.55);
    pointerSmooth.x += (pointer.x - pointerSmooth.x) * Math.min(1, delta * 3.2);
    pointerSmooth.y += (pointer.y - pointerSmooth.y) * Math.min(1, delta * 3.2);

    const isActive = syncLevel > 0.015 || burst > 0.05 || jumpLevel > 0.01 || now - lastPointerMove < 520;
    const frameInterval = jumpLevel > 0.01 ? hyperjumpFrameInterval : (isActive ? activeFrameInterval : idleFrameInterval);
    if (!forcePaint && now - lastPaint < frameInterval) {
      if (!reducedMotion.matches) frameId = requestAnimationFrame(render);
      return;
    }
    forcePaint = false;
    lastPaint = now;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.uniform1f(uSync, syncLevel);
    gl.uniform1f(uBurst, burst);
    gl.uniform1f(uJump, jumpLevel);
    gl.uniform2f(uPointer, pointerSmooth.x, 1 - pointerSmooth.y);
    gl.uniform2f(uJumpOrigin, jumpOrigin.x, jumpOrigin.y);
    gl.uniform1f(uTheme, cachedThemeValue);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!reducedMotion.matches && !document.hidden) {
      frameId = requestAnimationFrame(render);
    }
  }

  function ensureLoop() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrame = performance.now();
    forcePaint = true;
    if (reducedMotion.matches) {
      render(lastFrame);
    } else if (!document.hidden) {
      frameId = requestAnimationFrame(render);
    }
  }

  function onPointer(event) {
    pointer.x = Math.min(1, Math.max(0, event.clientX / Math.max(1, window.innerWidth)));
    pointer.y = Math.min(1, Math.max(0, event.clientY / Math.max(1, window.innerHeight)));
    lastPointerMove = performance.now();
    forcePaint = true;
    if (!frameId && !document.hidden) frameId = requestAnimationFrame(render);
  }

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("visibilitychange", ensureLoop);
  reducedMotion.addEventListener("change", ensureLoop);

  resize();
  ensureLoop();

  window.CosmosWebGL = Object.freeze({
    startSync: function () {
      syncTarget = 1;
      burst = Math.max(burst, 0.9);
      ensureLoop();
    },
    sourceComplete: function () {
      burst = Math.min(1.6, burst + 0.45);
      forcePaint = true;
      if (!frameId && !document.hidden) frameId = requestAnimationFrame(render);
    },
    finishSync: function (success) {
      syncTarget = 0;
      burst = success ? 1.2 : 0.7;
      ensureLoop();
    },
    themeChanged: function () {
      cachedThemeValue = document.documentElement.dataset.theme === "light" ? 1 : 0;
      ensureLoop();
    },
    setPointer: function (x, y) {
      pointer.x = x;
      pointer.y = y;
      lastPointerMove = performance.now();
      forcePaint = true;
    },
    triggerJump: function (x, y) {
      const normalizedX = clamp(Number.isFinite(x) ? x : 0.5, 0, 1);
      const normalizedY = clamp(Number.isFinite(y) ? y : 0.42, 0, 1);
      jumpOrigin.x = 0.5 + (normalizedX - 0.5) * 0.22;
      jumpOrigin.y = 0.5 + ((1 - normalizedY) - 0.5) * 0.14;
      jumpStartedAt = performance.now();
      burst = Math.max(burst, 1.1);
      forcePaint = true;
      ensureLoop();
    },
    stopJump: function () {
      jumpStartedAt = -Infinity;
      forcePaint = true;
      ensureLoop();
    },
    getStats: function () {
      return {
        width: canvas.width,
        height: canvas.height,
        pixelRatio: pixelRatio,
        jumpActive: performance.now() - jumpStartedAt < hyperjumpDuration
      };
    }
  });
})();
