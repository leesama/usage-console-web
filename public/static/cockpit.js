(function () {
  "use strict";

  const scene = document.getElementById("cockpitScene");
  const deck = document.querySelector(".cockpit-deck") || document.querySelector(".app-shell");
  const monitors = document.querySelector(".dashboard-main");
  const orbitDistance = document.getElementById("earthOrbitDistance");
  const jumpImpact = document.getElementById("jumpImpact");
  if (!scene || !monitors) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const CAMERA_X_LIMIT = 184;
  const CAMERA_Y_LIMIT = 104;
  const CAMERA_DEPTH_MIN = -150;
  const CAMERA_DEPTH_MAX = 190;
  const HYPERJUMP_DURATION = 1480;
  let focused = null;
  let parallaxX = 0;
  let parallaxY = 0;
  let targetX = 0;
  let targetY = 0;
  let cameraX = 0;
  let targetCameraX = 0;
  let cameraY = 0;
  let targetCameraY = 0;
  let cameraDepth = 0;
  let targetCameraDepth = 0;
  let cameraVelocityX = 0;
  let cameraVelocityY = 0;
  let dragging = false;
  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartCameraX = 0;
  let dragStartCameraY = 0;
  let dragLastX = 0;
  let dragLastY = 0;
  let dragLastTime = 0;
  let dragMoved = false;
  let suppressClickUntil = 0;
  let frameId = 0;
  let hyperjumpStartedAt = 0;
  let hyperjumpActive = false;
  let hyperjumpCleanupTimer = 0;

  function scheduleParallax() {
    if (frameId) return;
    frameId = requestAnimationFrame(animateParallax);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function cameraXLimit() {
    return Math.min(CAMERA_X_LIMIT, Math.max(64, window.innerWidth * 0.105));
  }

  function cameraYLimit() {
    return Math.min(CAMERA_Y_LIMIT, Math.max(52, window.innerHeight * 0.11));
  }

  function emptyHyperjumpMotion() {
    return {
      active: false,
      intensity: 0,
      deckX: 0,
      deckY: 0,
      deckZ: 0,
      deckRoll: 0,
      hullX: 0,
      hullY: 0,
      hullRoll: 0,
      hullScale: 1,
      earthScale: 1,
      cosmosScale: 1
    };
  }

  function finishHyperjump() {
    if (!hyperjumpActive && !document.body.classList.contains("is-hyperjump")) return;
    hyperjumpActive = false;
    window.clearTimeout(hyperjumpCleanupTimer);
    hyperjumpCleanupTimer = 0;
    document.body.classList.remove("is-hyperjump");
    scheduleParallax();
  }

  function getHyperjumpMotion(now) {
    if (!hyperjumpActive) return emptyHyperjumpMotion();

    const duration = reducedMotion.matches ? 280 : HYPERJUMP_DURATION;
    const elapsed = Math.max(0, now - hyperjumpStartedAt);
    if (elapsed >= duration) {
      finishHyperjump();
      return emptyHyperjumpMotion();
    }

    const t = clamp(elapsed / duration, 0, 1);
    if (reducedMotion.matches) {
      return Object.assign(emptyHyperjumpMotion(), { active: true, intensity: 0.18 });
    }

    const attackProgress = clamp(t / 0.085, 0, 1);
    const attack = 1 - Math.pow(1 - attackProgress, 3);
    const decay = t <= 0.085 ? 1 : Math.pow(1 - (t - 0.085) / 0.915, 1.72);
    const surge = attack * decay;
    const rebound = Math.exp(-Math.pow((t - 0.34) / 0.085, 2));
    const shakeEnvelope = Math.pow(1 - t, 2.35) * Math.min(1, t / 0.026);
    const jitterX = (Math.sin(elapsed * 0.071) + Math.sin(elapsed * 0.137) * 0.46) * shakeEnvelope;
    const jitterY = (Math.cos(elapsed * 0.083) + Math.sin(elapsed * 0.151) * 0.32) * shakeEnvelope;

    return {
      active: true,
      intensity: surge,
      deckX: jitterX * 8.5,
      deckY: jitterY * 5.4,
      deckZ: surge * 104 - rebound * 17,
      deckRoll: jitterX * 0.23,
      hullX: -jitterX * 3.1,
      hullY: -jitterY * 2.2,
      hullRoll: -jitterX * 0.09,
      hullScale: 1 + surge * 0.018,
      earthScale: 1 + surge * 0.145,
      cosmosScale: 1 + surge * 0.09
    };
  }

  function launchHyperjump(x, y) {
    const originX = clamp(Number.isFinite(x) ? x : 0.5, 0.08, 0.92);
    const originY = clamp(Number.isFinite(y) ? y : 0.42, 0.08, 0.84);
    const now = performance.now();

    hyperjumpStartedAt = now;
    hyperjumpActive = true;
    cameraVelocityX = 0;
    cameraVelocityY = 0;
    scene.style.setProperty("--jump-origin-x", (originX * 100).toFixed(2) + "%");
    scene.style.setProperty("--jump-origin-y", (originY * 100).toFixed(2) + "%");
    if (jumpImpact) {
      jumpImpact.style.setProperty("--jump-origin-x", (originX * 100).toFixed(2) + "%");
      jumpImpact.style.setProperty("--jump-origin-y", (originY * 100).toFixed(2) + "%");
    }

    document.body.classList.remove("is-hyperjump");
    if (jumpImpact) void jumpImpact.offsetWidth;
    document.body.classList.add("is-hyperjump");

    window.clearTimeout(hyperjumpCleanupTimer);
    hyperjumpCleanupTimer = window.setTimeout(
      finishHyperjump,
      (reducedMotion.matches ? 280 : HYPERJUMP_DURATION) + 80
    );

    if (!reducedMotion.matches && window.CosmosWebGL && typeof window.CosmosWebGL.triggerJump === "function") {
      window.CosmosWebGL.triggerJump(originX, originY);
    }
    scheduleParallax();
  }

  function isInteractiveTarget(target) {
    if (!target || !target.closest) return false;
    return Boolean(
      target.closest(
        "button, a, input, textarea, select, summary, label, .glm-copy-button, .switch-control, .key-row, details"
      )
    );
  }

  function clearFocus() {
    if (!focused) return;
    focused.classList.remove("is-focused", "screen-incoming");
    focused = null;
    monitors.classList.remove("has-focus");
    scene.classList.remove("screen-focus-mode");
    document.body.classList.remove("cockpit-screen-focus");
  }

  function focusScreen(panel) {
    if (!panel || !monitors.contains(panel)) return;
    if (focused === panel) {
      clearFocus();
      return;
    }
    if (focused) {
      focused.classList.remove("is-focused", "screen-incoming");
    }
    focused = panel;
    monitors.classList.add("has-focus");
    scene.classList.add("screen-focus-mode");
    document.body.classList.add("cockpit-screen-focus");
    panel.classList.add("is-focused", "screen-incoming");
    window.setTimeout(function () {
      panel.classList.remove("screen-incoming");
    }, 700);
    if (!reducedMotion.matches) {
      try {
        panel.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      } catch (_) {
        panel.scrollIntoView();
      }
    }
  }

  monitors.addEventListener("click", function (event) {
    if (performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const panel = event.target.closest(".provider-panel");
    if (!panel || !monitors.contains(panel)) return;
    if (isInteractiveTarget(event.target) && event.target.closest(".provider-panel") === panel) {
      // Allow buttons/inputs without stealing focus toggle, but still bring panel forward once.
      if (focused !== panel) focusScreen(panel);
      return;
    }
    focusScreen(panel);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") clearFocus();
  });

  monitors.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const panel = event.target.closest(".provider-panel");
    if (!panel || event.target !== panel || !monitors.contains(panel)) return;
    event.preventDefault();
    focusScreen(panel);
  });

  scene.addEventListener("click", function (event) {
    if (performance.now() < suppressClickUntil) return;
    if (!focused) return;
    if (event.target.closest(".provider-panel") || event.target.closest(".topbar") || event.target.closest(".status-rail") || event.target.closest(".footer") || event.target.closest(".actions")) {
      return;
    }
    clearFocus();
  });

  function ensureBezel(surface, extraClass) {
    if (!surface || surface.querySelector(":scope > .screen-bezel")) return;
    const bezel = document.createElement("div");
    bezel.className = "screen-bezel" + (extraClass ? " " + extraClass : "");
    bezel.setAttribute("aria-hidden", "true");
    bezel.innerHTML =
      '<span class="bezel-edge tl"></span><span class="bezel-edge tr"></span><span class="bezel-edge bl"></span><span class="bezel-edge br"></span><span class="bezel-glow"></span><span class="screen-hint">点击推近屏幕</span>';
    surface.appendChild(bezel);
  }

  function bindHoverState(surface) {
    if (!surface || surface.dataset.cockpitHoverBound === "true") return;
    surface.dataset.cockpitHoverBound = "true";
    surface.addEventListener("pointerenter", function () {
      surface.classList.add("is-hovering");
    });
    surface.addEventListener("pointerleave", function () {
      surface.classList.remove("is-hovering");
    });
  }

  // Observe Grok overlay panel injection and tag every physical display.
  function tagMonitors() {
    monitors.querySelectorAll(".provider-panel").forEach(function (panel, index) {
      panel.classList.add("cockpit-screen");
      if (!panel.dataset.screenSlot) {
        panel.dataset.screenSlot = String(index + 1);
      }
      panel.tabIndex = 0;
      panel.setAttribute("aria-keyshortcuts", "Enter Space");
      ensureBezel(panel, "");
      bindHoverState(panel);
    });

    monitors.querySelectorAll(".provider-gpt .gpt-pane").forEach(function (pane, index) {
      pane.classList.add("cockpit-subscreen");
      pane.dataset.subscreenSlot = String(index + 1);
      ensureBezel(pane, "subscreen-bezel");
      bindHoverState(pane);
    });
  }

  tagMonitors();
  if (typeof MutationObserver === "function") {
    new MutationObserver(function () {
      tagMonitors();
    }).observe(monitors, { childList: true });
  }

  function applyMotionState(now) {
    const jump = getHyperjumpMotion(Number.isFinite(now) ? now : performance.now());
    const yaw = clamp(-cameraX * 0.014, -2.65, 2.65);
    const pitch = clamp(cameraY * 0.014, -1.65, 1.65);
    const hullX = cameraX * 0.24;
    const hullY = cameraY * 0.18;
    const earthX = -cameraX * 0.18;
    const earthY = cameraDepth * 0.025 - cameraY * 0.22;
    const earthScale = clamp(1 + cameraDepth / 920, 0.84, 1.23);
    const hullScale = clamp(1 + cameraDepth / 3500, 0.95, 1.055);
    const cosmosScale = clamp(1.024 + cameraDepth / 7200, 1.003, 1.052);

    scene.style.setProperty("--cockpit-camera-x", cameraX.toFixed(2) + "px");
    scene.style.setProperty("--cockpit-camera-y", cameraY.toFixed(2) + "px");
    scene.style.setProperty("--cockpit-camera-z", cameraDepth.toFixed(2) + "px");
    scene.style.setProperty("--cockpit-camera-yaw", yaw.toFixed(3) + "deg");
    scene.style.setProperty("--cockpit-camera-pitch", pitch.toFixed(3) + "deg");
    scene.style.setProperty("--cockpit-hull-x", hullX.toFixed(2) + "px");
    scene.style.setProperty("--cockpit-hull-y", hullY.toFixed(2) + "px");
    scene.style.setProperty("--cockpit-hull-scale", hullScale.toFixed(4));
    scene.style.setProperty("--earth-shift-x", earthX.toFixed(2) + "px");
    scene.style.setProperty("--earth-shift-y", earthY.toFixed(2) + "px");
    scene.style.setProperty("--earth-camera-scale", earthScale.toFixed(4));
    scene.style.setProperty("--cosmos-shift-x", (-cameraX * 0.055).toFixed(2) + "px");
    scene.style.setProperty("--cosmos-shift-y", (-cameraDepth * 0.012 - cameraY * 0.065).toFixed(2) + "px");
    scene.style.setProperty("--cosmos-camera-scale", cosmosScale.toFixed(4));
    scene.style.setProperty("--jump-deck-x", jump.deckX.toFixed(2) + "px");
    scene.style.setProperty("--jump-deck-y", jump.deckY.toFixed(2) + "px");
    scene.style.setProperty("--jump-deck-z", jump.deckZ.toFixed(2) + "px");
    scene.style.setProperty("--jump-deck-roll", jump.deckRoll.toFixed(3) + "deg");
    scene.style.setProperty("--jump-hull-x", jump.hullX.toFixed(2) + "px");
    scene.style.setProperty("--jump-hull-y", jump.hullY.toFixed(2) + "px");
    scene.style.setProperty("--jump-hull-roll", jump.hullRoll.toFixed(3) + "deg");
    scene.style.setProperty("--jump-hull-scale", jump.hullScale.toFixed(4));
    scene.style.setProperty("--jump-earth-scale", jump.earthScale.toFixed(4));
    scene.style.setProperty("--jump-cosmos-scale", jump.cosmosScale.toFixed(4));

    if (deck) {
      deck.style.setProperty("--cockpit-parallax-x", parallaxX.toFixed(3) + "deg");
      deck.style.setProperty("--cockpit-parallax-y", parallaxY.toFixed(3) + "deg");
    }

    if (orbitDistance) {
      if (jump.active) {
        orbitDistance.textContent = "IMPULSE VECTOR · " + Math.max(12, Math.round(jump.intensity * 100)) + "%";
      } else {
        const distance = Math.round(42180 - cameraDepth * 38);
        orbitDistance.textContent = "HOME ORBIT · " + distance.toLocaleString("en-US") + " KM";
      }
    }

    return jump.active;
  }

  function animateParallax(now) {
    frameId = 0;

    if (!dragging && !reducedMotion.matches) {
      if (Math.abs(cameraVelocityX) > 0.02) {
        const limitX = cameraXLimit();
        targetCameraX = clamp(targetCameraX + cameraVelocityX, -limitX, limitX);
        cameraVelocityX *= 0.88;
      }
      if (Math.abs(cameraVelocityY) > 0.02) {
        const limitY = cameraYLimit();
        targetCameraY = clamp(targetCameraY + cameraVelocityY, -limitY, limitY);
        cameraVelocityY *= 0.86;
      }
    }

    const parallaxEase = reducedMotion.matches ? 1 : 0.14;
    const cameraEase = reducedMotion.matches ? 1 : 0.18;
    const depthEase = reducedMotion.matches ? 1 : 0.15;
    parallaxX += (targetX - parallaxX) * parallaxEase;
    parallaxY += (targetY - parallaxY) * parallaxEase;
    cameraX += (targetCameraX - cameraX) * cameraEase;
    cameraY += (targetCameraY - cameraY) * cameraEase;
    cameraDepth += (targetCameraDepth - cameraDepth) * depthEase;
    const jumpActive = applyMotionState(now);

    if (
      Math.abs(targetX - parallaxX) > 0.002 ||
      Math.abs(targetY - parallaxY) > 0.002 ||
      Math.abs(targetCameraX - cameraX) > 0.08 ||
      Math.abs(targetCameraY - cameraY) > 0.08 ||
      Math.abs(targetCameraDepth - cameraDepth) > 0.08 ||
      Math.abs(cameraVelocityX) > 0.02 ||
      Math.abs(cameraVelocityY) > 0.02 ||
      jumpActive
    ) {
      scheduleParallax();
    }
  }

  function shouldKeepNativeGesture(target) {
    if (!target || !target.closest) return false;
    return Boolean(
      target.closest(
        "button, a, input, textarea, select, summary, label, details, .topbar, .status-rail, .footer, .provider-content, .key-content, .glm-key-list, .ds-content"
      )
    );
  }

  function scrollableConsumesWheel(target, deltaY) {
    if (!target || !target.closest) return false;
    const scroller = target.closest(".provider-content, .key-content, .glm-key-list, .ds-content");
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 2) return false;
    if (deltaY < 0) return scroller.scrollTop > 0;
    if (deltaY > 0) return scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
    return false;
  }

  function beginDrag(event) {
    if (event.button !== 0 || shouldKeepNativeGesture(event.target)) return;
    dragging = true;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartCameraX = targetCameraX;
    dragStartCameraY = targetCameraY;
    dragLastX = event.clientX;
    dragLastY = event.clientY;
    dragLastTime = performance.now();
    dragMoved = false;
    cameraVelocityX = 0;
    cameraVelocityY = 0;
    scene.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-cockpit-dragging");
  }

  function moveDrag(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    const now = performance.now();
    const totalDeltaX = event.clientX - dragStartX;
    const totalDeltaY = event.clientY - dragStartY;
    const stepDeltaX = event.clientX - dragLastX;
    const stepDeltaY = event.clientY - dragLastY;
    const elapsed = Math.max(8, now - dragLastTime);
    const limitX = cameraXLimit();
    const limitY = cameraYLimit();
    targetCameraX = clamp(dragStartCameraX + totalDeltaX * 0.72, -limitX, limitX);
    targetCameraY = clamp(dragStartCameraY + totalDeltaY * 0.62, -limitY, limitY);
    cameraVelocityX = clamp((stepDeltaX / elapsed) * 6.5, -16, 16);
    cameraVelocityY = clamp((stepDeltaY / elapsed) * 5.6, -13, 13);
    dragLastX = event.clientX;
    dragLastY = event.clientY;
    dragLastTime = now;
    if (Math.hypot(totalDeltaX, totalDeltaY) > 4) {
      dragMoved = true;
      event.preventDefault();
    }
    scheduleParallax();
  }

  function endDrag(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    if (scene.hasPointerCapture?.(event.pointerId)) {
      scene.releasePointerCapture(event.pointerId);
    }
    dragging = false;
    dragPointerId = null;
    document.body.classList.remove("is-cockpit-dragging");
    if (dragMoved) suppressClickUntil = performance.now() + 220;
    else {
      cameraVelocityX = 0;
      cameraVelocityY = 0;
    }
    scheduleParallax();
  }

  scene.addEventListener("pointerdown", beginDrag);
  scene.addEventListener("pointermove", moveDrag, { passive: false });
  scene.addEventListener("pointerup", endDrag);
  scene.addEventListener("pointercancel", endDrag);
  scene.addEventListener("dblclick", function (event) {
    if (event.button !== 0 || !event.target || !event.target.closest) return;
    if (
      event.target.closest(
        "button, a, input, textarea, select, summary, label, details, .topbar, .status-rail, .footer, .provider-panel, .gpt-pane"
      )
    ) {
      return;
    }
    event.preventDefault();
    launchHyperjump(
      event.clientX / Math.max(1, window.innerWidth),
      event.clientY / Math.max(1, window.innerHeight)
    );
  });
  scene.addEventListener(
    "wheel",
    function (event) {
      if (window.innerWidth < 1200) return;
      if (event.ctrlKey || scrollableConsumesWheel(event.target, event.deltaY)) return;
      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? window.innerHeight : 1);
      const delta = clamp(event.deltaY * multiplier, -220, 220);
      targetCameraDepth = clamp(targetCameraDepth - delta * 0.22, CAMERA_DEPTH_MIN, CAMERA_DEPTH_MAX);
      scheduleParallax();
    },
    { passive: false }
  );

  function syncNarrowViewportDepth() {
    if (window.innerWidth >= 1200) return;
    const scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = clamp(window.scrollY / scrollRange, 0, 1);
    targetCameraDepth = progress * 140;
    scheduleParallax();
  }

  window.addEventListener("scroll", syncNarrowViewportDepth, { passive: true });
  window.addEventListener("resize", function () {
    const limitX = cameraXLimit();
    const limitY = cameraYLimit();
    targetCameraX = clamp(targetCameraX, -limitX, limitX);
    targetCameraY = clamp(targetCameraY, -limitY, limitY);
    if (window.innerWidth < 1200) {
      syncNarrowViewportDepth();
    } else if (window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
    scheduleParallax();
  });

  if (!reducedMotion.matches) {
    window.addEventListener(
      "pointermove",
      function (event) {
        if (dragging) return;
        const nx = event.clientX / Math.max(1, window.innerWidth);
        const ny = event.clientY / Math.max(1, window.innerHeight);
        // Keep the bridge alive without letting the deck run away from the pointer.
        targetX = (nx - 0.5) * 0.9;
        targetY = (0.5 - ny) * 0.62;
        scheduleParallax();
      },
      { passive: true }
    );
  }

  reducedMotion.addEventListener("change", function () {
    cancelAnimationFrame(frameId);
    frameId = 0;
    targetX = 0;
    targetY = 0;
    cameraVelocityX = 0;
    cameraVelocityY = 0;
    if (reducedMotion.matches) {
      parallaxX = 0;
      parallaxY = 0;
    }
    scheduleParallax();
  });

  window.addEventListener("pagehide", function () {
    window.clearTimeout(hyperjumpCleanupTimer);
    hyperjumpCleanupTimer = 0;
    hyperjumpActive = false;
    document.body.classList.remove("is-hyperjump");
  });

  applyMotionState(performance.now());
  if (window.innerWidth >= 1200 && window.scrollY !== 0) {
    try {
      window.history.scrollRestoration = "manual";
    } catch (_) {
      // Some embedded browsers expose a read-only history object.
    }
    window.scrollTo(0, 0);
  } else {
    syncNarrowViewportDepth();
  }

  window.CockpitBay = Object.freeze({
    focusScreen: focusScreen,
    clearFocus: clearFocus,
    tagMonitors: tagMonitors,
    resetView: function () {
      finishHyperjump();
      targetCameraX = 0;
      targetCameraY = 0;
      targetCameraDepth = 0;
      cameraVelocityX = 0;
      cameraVelocityY = 0;
      scheduleParallax();
    },
    triggerJump: launchHyperjump,
    getViewState: function () {
      return {
        x: cameraX,
        targetX: targetCameraX,
        y: cameraY,
        targetY: targetCameraY,
        depth: cameraDepth,
        targetDepth: targetCameraDepth,
        dragging: dragging,
        hyperjumpActive: hyperjumpActive,
        hyperjumpElapsed: hyperjumpActive ? performance.now() - hyperjumpStartedAt : 0
      };
    }
  });
})();
