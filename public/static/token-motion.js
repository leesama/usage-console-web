(function () {
  "use strict";

  const fieldCanvas = document.getElementById("aiParticleField");
  const tokenCanvas = document.getElementById("tokenField");
  if (!fieldCanvas && !tokenCanvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cockpitPerformanceMode = document.body.classList.contains("cosmos-body");
  const scenes = [];

  let syncTarget = 0;
  let syncLevel = 0;
  let burst = 0.45;
  let completeTimer = 0;
  let frameId = 0;
  let lastFrame = performance.now();
  let lastPaint = 0;
  let palette = resolvePalette();
  let pointer = { x: 0.5, y: 0.35, active: false };
  let pointerStrength = 0;
  let neuralPulse = 0;

  function resolvePalette() {
    const isLight = document.documentElement.dataset.theme === "light";
    return isLight
      ? {
          primary: "37, 99, 235",
          secondary: "14, 165, 233",
          gold: "180, 132, 42",
          violet: "124, 58, 237",
          white: "255, 255, 255",
          composite: "source-over",
          baseOpacity: 0.5,
          linkOpacity: 0.12
        }
      : {
          primary: "92, 225, 255",
          secondary: "124, 162, 247",
          gold: "240, 196, 110",
          violet: "176, 132, 255",
          white: "236, 245, 255",
          composite: "screen",
          baseOpacity: 0.78,
          linkOpacity: 0.22
        };
  }

  function createScene(canvas, mode) {
    if (!canvas || !canvas.getContext) return null;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return null;
    return {
      canvas: canvas,
      context: context,
      mode: mode,
      width: 1,
      height: 1,
      pixelRatio: 1,
      nodes: [],
      streams: [],
      sparks: [],
      glyphs: []
    };
  }

  // WebGL already owns the full-screen cosmos in cockpit mode. Running another
  // transparent full-screen 2D particle canvas duplicated most of the GPU work.
  if (fieldCanvas && !cockpitPerformanceMode) scenes.push(createScene(fieldCanvas, "field"));
  if (tokenCanvas) scenes.push(createScene(tokenCanvas, "token"));

  function countsFor(scene) {
    const area = scene.width * scene.height;
    if (scene.mode === "token") {
      if (scene.width < 520) return { nodes: 8, streams: 5, sparks: 10, glyphs: 2 };
      if (scene.width < 900) return { nodes: 12, streams: 8, sparks: 16, glyphs: 3 };
      return { nodes: 16, streams: 11, sparks: 22, glyphs: 4 };
    }
    if (area < 420000) return { nodes: 28, streams: 10, sparks: 18, glyphs: 4 };
    if (area < 1200000) return { nodes: 48, streams: 16, sparks: 30, glyphs: 7 };
    return { nodes: 72, streams: 22, sparks: 42, glyphs: 10 };
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickColor(kind) {
    if (kind === "gold") return palette.gold;
    if (kind === "violet") return palette.violet;
    if (kind === "secondary") return palette.secondary;
    if (kind === "white") return palette.white;
    return palette.primary;
  }

  function seedNodes(scene, count) {
    scene.nodes = Array.from({ length: count }, function (_, index) {
      const layer = index % 4;
      return {
        x: Math.random(),
        y: Math.random(),
        z: layer === 0 ? 0.35 : layer === 1 ? 0.55 : layer === 2 ? 0.75 : 1,
        vx: rand(-0.018, 0.018),
        vy: rand(-0.014, 0.014),
        size: rand(0.8, 2.4) * (scene.mode === "token" ? 0.85 : 1),
        phase: Math.random() * Math.PI * 2,
        pulse: rand(0.6, 1.5),
        hue: index % 5 === 0 ? "gold" : index % 4 === 0 ? "violet" : index % 3 === 0 ? "secondary" : "primary",
        hub: index % 7 === 0
      };
    });
  }

  function seedStreams(scene, count) {
    scene.streams = Array.from({ length: count }, function (_, index) {
      return {
        x: (index / count + Math.random() * 0.18) % 1,
        y: rand(0.08, 0.92),
        speed: rand(0.05, 0.14),
        length: rand(0.04, 0.14),
        size: rand(0.7, 1.8),
        amplitude: rand(4, 18),
        frequency: rand(0.5, 1.4),
        phase: Math.random() * Math.PI * 2,
        hue: index % 3 === 0 ? "gold" : index % 2 === 0 ? "primary" : "secondary"
      };
    });
  }

  function seedSparks(scene, count) {
    scene.sparks = Array.from({ length: count }, function () {
      return {
        x: Math.random(),
        y: Math.random(),
        life: Math.random(),
        decay: rand(0.12, 0.35),
        size: rand(0.4, 1.4),
        driftX: rand(-0.03, 0.03),
        driftY: rand(-0.05, -0.01),
        hue: Math.random() > 0.55 ? "gold" : "primary"
      };
    });
  }

  function seedGlyphs(scene, count) {
    const alphabet = ["0", "1", "Σ", "λ", "∇", "∞", "◈", "⬢"];
    scene.glyphs = Array.from({ length: count }, function (_, index) {
      return {
        x: Math.random(),
        y: Math.random(),
        text: alphabet[index % alphabet.length],
        speed: rand(0.01, 0.035),
        size: rand(9, 14),
        phase: Math.random() * Math.PI * 2,
        opacity: rand(0.08, 0.22),
        hue: index % 2 === 0 ? "gold" : "primary"
      };
    });
  }

  function seedScene(scene) {
    const counts = countsFor(scene);
    seedNodes(scene, counts.nodes);
    seedStreams(scene, counts.streams);
    seedSparks(scene, counts.sparks);
    seedGlyphs(scene, counts.glyphs);
  }

  function resizeScene(scene) {
    const bounds = scene.canvas.getBoundingClientRect();
    scene.width = Math.max(1, bounds.width);
    scene.height = Math.max(1, bounds.height);
    scene.pixelRatio = Math.min(window.devicePixelRatio || 1, cockpitPerformanceMode ? 1 : 1.5);
    scene.canvas.width = Math.round(scene.width * scene.pixelRatio);
    scene.canvas.height = Math.round(scene.height * scene.pixelRatio);
    scene.context.setTransform(scene.pixelRatio, 0, 0, scene.pixelRatio, 0, 0);
    seedScene(scene);
  }

  function resizeAll() {
    scenes.forEach(resizeScene);
    if (reducedMotion.matches) draw(performance.now(), true);
  }

  function wrap01(value) {
    if (value < 0) return value + 1;
    if (value > 1) return value - 1;
    return value;
  }

  function updateNodes(scene, delta, energy, timestamp) {
    const attract = pointer.active ? pointerStrength : pointerStrength * 0.35;
    scene.nodes.forEach(function (node) {
      const wobbleX = Math.sin(timestamp * 0.00035 * node.pulse + node.phase) * 0.004;
      const wobbleY = Math.cos(timestamp * 0.00042 * node.pulse + node.phase) * 0.0035;
      node.vx += wobbleX * delta;
      node.vy += wobbleY * delta;

      if (attract > 0.02) {
        const dx = pointer.x - node.x;
        const dy = pointer.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.0001;
        const pull = (node.hub ? 0.08 : 0.045) * attract / dist;
        node.vx += dx * pull * delta;
        node.vy += dy * pull * delta;
      }

      const damp = 1 - Math.min(0.9, delta * 1.8);
      node.vx *= damp;
      node.vy *= damp;
      node.x = wrap01(node.x + node.vx * delta * energy);
      node.y = wrap01(node.y + node.vy * delta * energy);
    });
  }

  function updateStreams(scene, delta, energy, timestamp) {
    scene.streams.forEach(function (stream) {
      stream.x = wrap01(stream.x + stream.speed * delta * energy);
      stream.y = wrap01(
        stream.y +
          Math.sin(timestamp * 0.0008 * stream.frequency + stream.phase) * 0.0008 * energy
      );
    });
  }

  function updateSparks(scene, delta, energy) {
    scene.sparks.forEach(function (spark) {
      spark.life -= spark.decay * delta * (0.7 + energy * 0.25);
      if (spark.life <= 0) {
        spark.x = Math.random();
        spark.y = Math.random();
        spark.life = 1;
        spark.decay = rand(0.12, 0.35);
        spark.driftX = rand(-0.04, 0.04);
        spark.driftY = rand(-0.06, -0.01);
        spark.hue = Math.random() > 0.5 ? "gold" : Math.random() > 0.5 ? "primary" : "violet";
      } else {
        spark.x = wrap01(spark.x + spark.driftX * delta * energy);
        spark.y = wrap01(spark.y + spark.driftY * delta * energy);
      }
    });
  }

  function updateGlyphs(scene, delta, energy) {
    scene.glyphs.forEach(function (glyph) {
      glyph.y = wrap01(glyph.y - glyph.speed * delta * energy);
      glyph.x = wrap01(glyph.x + Math.sin(glyph.phase + glyph.y * 8) * 0.0008);
    });
  }

  function drawLinks(scene, energy) {
    const ctx = scene.context;
    const maxDist = scene.mode === "token" ? 0.22 : 0.16;
    const maxDistSq = maxDist * maxDist;
    const nodes = scene.nodes;
    const limit = scene.mode === "token" ? 48 : 96;
    let drawn = 0;

    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (drawn >= limit) return;
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > maxDistSq) continue;
        const dist = Math.sqrt(distSq);
        const strength = (1 - dist / maxDist) * palette.linkOpacity * (0.55 + energy * 0.55);
        if (strength < 0.01) continue;
        const ax = a.x * scene.width;
        const ay = a.y * scene.height;
        const bx = b.x * scene.width;
        const by = b.y * scene.height;
        const color = a.hub || b.hub ? palette.gold : palette.primary;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = "rgba(" + color + ", " + Math.min(0.45, strength) + ")";
        ctx.lineWidth = a.hub || b.hub ? 1.15 : 0.7;
        ctx.stroke();
        drawn += 1;

        if (syncLevel > 0.35 && drawn % 4 === 0) {
          const t = (neuralPulse + i * 0.07 + j * 0.03) % 1;
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          ctx.beginPath();
          ctx.arc(px, py, 1.2 + syncLevel * 1.4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(" + palette.white + ", " + (0.18 + syncLevel * 0.35) + ")";
          ctx.fill();
        }
      }
    }
  }

  function drawNodes(scene, energy, timestamp) {
    const ctx = scene.context;
    scene.nodes.forEach(function (node) {
      const x = node.x * scene.width;
      const y = node.y * scene.height;
      const breathe = 0.7 + 0.3 * Math.sin(timestamp * 0.002 * node.pulse + node.phase);
      const radius = node.size * node.z * (1 + syncLevel * 0.35 + burst * 0.12) * breathe;
      const color = pickColor(node.hue);
      const alpha = palette.baseOpacity * (0.28 + node.z * 0.42) * (1 + burst * 0.15);

      if (node.hub || syncLevel > 0.4) {
        ctx.beginPath();
        ctx.arc(x, y, radius * (2.8 + syncLevel * 1.8), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + color + ", " + Math.min(0.16, alpha * 0.18) + ")";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + color + ", " + Math.min(0.92, alpha) + ")";
      ctx.shadowColor = "rgba(" + color + ", 0.55)";
      ctx.shadowBlur = 6 + radius * 2.4 + burst * 4 + syncLevel * 6;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (node.hub) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.6, radius * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + palette.white + ", 0.85)";
        ctx.fill();
      }
    });
  }

  function drawStreams(scene, energy, timestamp) {
    const ctx = scene.context;
    scene.streams.forEach(function (stream) {
      const wave = Math.sin(timestamp * 0.001 * stream.frequency + stream.phase + stream.x * 8);
      const x = stream.x * scene.width;
      const y = stream.y * scene.height + wave * stream.amplitude * (1 + syncLevel * 0.4);
      const tail = stream.length * scene.width * (1 + syncLevel * 0.35 + burst * 0.2);
      const color = pickColor(stream.hue);
      const alpha = palette.baseOpacity * (0.25 + stream.size * 0.12) * (1 + energy * 0.12);

      const gradient = ctx.createLinearGradient(x - tail, y, x, y);
      gradient.addColorStop(0, "rgba(" + color + ", 0)");
      gradient.addColorStop(0.55, "rgba(" + color + ", " + Math.min(0.35, alpha * 0.45) + ")");
      gradient.addColorStop(1, "rgba(" + color + ", " + Math.min(0.85, alpha) + ")");

      ctx.beginPath();
      ctx.moveTo(x - tail, y - wave * 0.6);
      ctx.quadraticCurveTo(x - tail * 0.45, y + wave * 1.2, x, y);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = Math.max(0.8, stream.size * (0.8 + syncLevel * 0.5));
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, stream.size * (0.9 + syncLevel * 0.35), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + color + ", " + Math.min(0.95, alpha + 0.15) + ")";
      ctx.shadowColor = "rgba(" + color + ", 0.6)";
      ctx.shadowBlur = 8 + stream.size * 2 + burst * 3;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function drawSparks(scene) {
    const ctx = scene.context;
    scene.sparks.forEach(function (spark) {
      if (spark.life < 0.05) return;
      const x = spark.x * scene.width;
      const y = spark.y * scene.height;
      const color = pickColor(spark.hue);
      const alpha = spark.life * palette.baseOpacity * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, spark.size * (0.6 + spark.life), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + color + ", " + alpha + ")";
      ctx.fill();
    });
  }

  function drawGlyphs(scene, timestamp) {
    const ctx = scene.context;
    ctx.save();
    ctx.font = "600 11px Cascadia Mono, SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "center";
    scene.glyphs.forEach(function (glyph) {
      const x = glyph.x * scene.width;
      const y = glyph.y * scene.height;
      const flicker = 0.7 + 0.3 * Math.sin(timestamp * 0.003 + glyph.phase);
      const color = pickColor(glyph.hue);
      ctx.fillStyle =
        "rgba(" + color + ", " + Math.min(0.4, glyph.opacity * flicker * (1 + syncLevel * 0.5)) + ")";
      ctx.font = "600 " + glyph.size + "px Cascadia Mono, SFMono-Regular, Consolas, monospace";
      ctx.fillText(glyph.text, x, y);
    });
    ctx.restore();
  }

  function drawCore(scene, timestamp, energy) {
    if (scene.mode !== "field" || scene.width < 640) return;
    const ctx = scene.context;
    const cx = scene.width * 0.5;
    const cy = scene.height * 0.28;
    const radius = Math.min(scene.width, scene.height) * (0.08 + syncLevel * 0.02);
    const pulse = 0.85 + 0.15 * Math.sin(timestamp * 0.0024);

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 3.2);
    glow.addColorStop(0, "rgba(" + palette.gold + ", " + (0.1 + syncLevel * 0.12) + ")");
    glow.addColorStop(0.35, "rgba(" + palette.primary + ", " + (0.05 + burst * 0.04) + ")");
    glow.addColorStop(1, "rgba(" + palette.primary + ", 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(" + palette.gold + ", " + (0.18 + energy * 0.08) + ")";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.42 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(" + palette.white + ", " + (0.08 + syncLevel * 0.12) + ")";
    ctx.fill();

    const arms = 6;
    for (let i = 0; i < arms; i += 1) {
      const angle = (Math.PI * 2 * i) / arms + timestamp * 0.00035 * (1 + syncLevel);
      const inner = radius * 0.7;
      const outer = radius * (1.55 + syncLevel * 0.35);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.strokeStyle = "rgba(" + palette.primary + ", " + (0.08 + syncLevel * 0.1) + ")";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawScene(scene, timestamp, delta, staticFrame) {
    const ctx = scene.context;
    const energy = 1 + syncLevel * 0.95 + burst * 0.22;
    ctx.clearRect(0, 0, scene.width, scene.height);
    ctx.globalCompositeOperation = palette.composite;

    if (!staticFrame) {
      updateNodes(scene, delta, energy, timestamp);
      updateStreams(scene, delta, energy, timestamp);
      updateSparks(scene, delta, energy);
      updateGlyphs(scene, delta, energy);
    }

    drawCore(scene, timestamp, energy);
    drawLinks(scene, energy);
    drawStreams(scene, energy, timestamp);
    drawNodes(scene, energy, timestamp);
    drawSparks(scene);
    drawGlyphs(scene, timestamp);

    if (burst > 0.2) {
      const flash = ctx.createRadialGradient(
        scene.width * pointer.x,
        scene.height * pointer.y,
        0,
        scene.width * pointer.x,
        scene.height * pointer.y,
        Math.max(scene.width, scene.height) * 0.35
      );
      flash.addColorStop(0, "rgba(" + palette.gold + ", " + Math.min(0.12, burst * 0.08) + ")");
      flash.addColorStop(1, "rgba(" + palette.primary + ", 0)");
      ctx.fillStyle = flash;
      ctx.fillRect(0, 0, scene.width, scene.height);
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function draw(timestamp, staticFrame) {
    const frameInterval = cockpitPerformanceMode
      ? (syncLevel > 0.04 || burst > 0.08 ? 50 : 84)
      : 33;
    if (!staticFrame && timestamp - lastPaint < frameInterval) {
      frameId = requestAnimationFrame(draw);
      return;
    }
    lastPaint = timestamp;
    const delta = Math.min(0.045, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    syncLevel += (syncTarget - syncLevel) * Math.min(1, delta * 4.2);
    burst = Math.max(0, burst - delta * 0.42);
    pointerStrength += ((pointer.active ? 1 : 0) - pointerStrength) * Math.min(1, delta * 5);
    neuralPulse = (neuralPulse + delta * (0.35 + syncLevel * 0.9)) % 1;

    scenes.forEach(function (scene) {
      if (scene) drawScene(scene, timestamp, delta, staticFrame);
    });

    if (!reducedMotion.matches && !staticFrame && !document.hidden) {
      frameId = requestAnimationFrame(draw);
    }
  }

  function ensureAnimation() {
    cancelAnimationFrame(frameId);
    lastFrame = performance.now();
    if (reducedMotion.matches) draw(lastFrame, true);
    else if (!document.hidden) frameId = requestAnimationFrame(draw);
  }

  function spawnBurstSparks() {
    scenes.forEach(function (scene) {
      if (!scene) return;
      const extra = scene.mode === "field" ? 12 : 6;
      for (let i = 0; i < extra; i += 1) {
        scene.sparks.push({
          x: pointer.active ? pointer.x + rand(-0.12, 0.12) : rand(0.2, 0.8),
          y: pointer.active ? pointer.y + rand(-0.1, 0.1) : rand(0.15, 0.75),
          life: 1,
          decay: rand(0.35, 0.7),
          size: rand(0.8, 2.2),
          driftX: rand(-0.08, 0.08),
          driftY: rand(-0.1, 0.02),
          hue: i % 3 === 0 ? "gold" : i % 2 === 0 ? "primary" : "violet"
        });
      }
      if (scene.sparks.length > 80) scene.sparks.length = 80;
    });
  }

  function startSync() {
    syncTarget = 1;
    burst = Math.max(burst, 0.72);
    neuralPulse = 0;
    document.body.classList.remove("sync-complete");
    document.body.classList.add("is-syncing");
    spawnBurstSparks();
    ensureAnimation();
  }

  function sourceComplete() {
    burst = Math.min(1.55, burst + 0.42);
    spawnBurstSparks();
  }

  function finishSync(success) {
    syncTarget = 0;
    burst = success ? 1.35 : 0.85;
    document.body.classList.remove("is-syncing");
    document.body.classList.add("sync-complete");
    spawnBurstSparks();
    window.clearTimeout(completeTimer);
    completeTimer = window.setTimeout(function () {
      document.body.classList.remove("sync-complete");
    }, 1100);
  }

  function themeChanged() {
    palette = resolvePalette();
    if (reducedMotion.matches) draw(performance.now(), true);
  }

  function handleVisibility() {
    if (document.hidden) cancelAnimationFrame(frameId);
    else ensureAnimation();
  }

  function updatePointer(event, active) {
    const scene = scenes[0];
    if (!scene) return;
    const bounds = scene.canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;
    pointer.x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    pointer.y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    pointer.active = active;
  }

  function onPointerMove(event) {
    updatePointer(event, true);
  }

  function onPointerLeave() {
    pointer.active = false;
  }

  scenes.forEach(function (scene) {
    if (!scene) return;
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(function () {
        resizeScene(scene);
        if (reducedMotion.matches) draw(performance.now(), true);
      }).observe(scene.canvas);
    }
  });
  if (typeof ResizeObserver !== "function") {
    window.addEventListener("resize", resizeAll);
  }

  if (!cockpitPerformanceMode) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
  }
  document.addEventListener("visibilitychange", handleVisibility);
  reducedMotion.addEventListener("change", ensureAnimation);

  resizeAll();
  ensureAnimation();

  function bridgeCosmos(method, arg) {
    const cosmos = window.CosmosWebGL;
    if (cosmos && typeof cosmos[method] === "function") {
      cosmos[method](arg);
    }
  }

  window.TokenPulse = Object.freeze({
    startSync: function () {
      bridgeCosmos("startSync");
      startSync();
    },
    sourceComplete: function () {
      bridgeCosmos("sourceComplete");
      sourceComplete();
    },
    finishSync: function (success) {
      bridgeCosmos("finishSync", success);
      finishSync(success);
    },
    themeChanged: function () {
      bridgeCosmos("themeChanged");
      themeChanged();
    }
  });
})();
