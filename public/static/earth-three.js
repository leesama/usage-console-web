import * as THREE from "/static/vendor/three/three.module.min.js";

const container = document.getElementById("earthOrbit");
const canvas = document.getElementById("earthThree");

if (container && canvas) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const textureRoot = "/static/assets/earth/";
  const textureFiles = {
    day: textureRoot + "earth_day_4096.jpg?v=20260722-layered-v1",
    night: textureRoot + "earth_night_4096.jpg?v=20260722-layered-v1",
    surface: textureRoot + "earth_bump_roughness_clouds_4096.jpg?v=20260722-layered-v1"
  };
  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      depth: true,
      powerPreference: "high-performance"
    });
  } catch (error) {
    container.classList.add("earth-load-failed");
    console.warn("[earth-three] WebGL renderer unavailable", error);
  }

  if (renderer) {
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    camera.position.set(0, 0, 4.28);

    const sunDirection = new THREE.Vector3(-0.78, 0.42, 1).normalize();
    const sunlight = new THREE.DirectionalLight(0xfff8ed, 3.35);
    sunlight.position.copy(sunDirection).multiplyScalar(5);
    scene.add(sunlight);
    scene.add(new THREE.HemisphereLight(0x8fc8ff, 0x020711, 0.18));
    scene.add(new THREE.AmbientLight(0x86aee0, 0.08));

    const earthTilt = new THREE.Group();
    earthTilt.rotation.z = THREE.MathUtils.degToRad(-18.5);
    earthTilt.rotation.x = THREE.MathUtils.degToRad(4.5);
    scene.add(earthTilt);

    const atmosphereGeometry = new THREE.SphereGeometry(1.055, 72, 48);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        glowColor: { value: new THREE.Color(0x42a9ff) },
        twilightColor: { value: new THREE.Color(0xf08a53) },
        sunDirection: { value: sunDirection }
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform vec3 twilightColor;
        uniform vec3 sunDirection;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec3 normalDirection = normalize(vWorldNormal);
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float facing = abs(dot(normalDirection, viewDirection));
          float rim = pow(1.0 - facing, 2.65);
          float sunAmount = dot(normalDirection, normalize(sunDirection));
          float dayAmount = smoothstep(-0.42, 0.58, sunAmount);
          float twilight = 1.0 - smoothstep(0.04, 0.40, abs(sunAmount));
          vec3 color = mix(twilightColor, glowColor, dayAmount);
          color += twilightColor * twilight * 0.24;
          float alpha = rim * mix(0.10, 0.56, dayAmount);
          gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    earthTilt.add(atmosphere);

    const loader = new THREE.TextureLoader();
    let surfaceGeometry = null;
    let surfaceMaterial = null;
    let cloudsMaterial = null;
    let dayTexture = null;
    let nightTexture = null;
    let surfaceTexture = null;
    let earthSurface = null;
    let cloudLayer = null;
    let modelReady = false;
    let disposed = false;
    let frameId = 0;
    let lastPaint = 0;
    let lastFrame = performance.now();
    let lastPointerMove = 0;
    let pointerX = 0;
    let pointerY = 0;
    let smoothPointerX = 0;
    let smoothPointerY = 0;
    let longitude = THREE.MathUtils.degToRad(118);
    let resizeObserver = null;
    const nightShaderUniforms = {
      earthNightMap: { value: null },
      earthSunDirectionView: { value: new THREE.Vector3(0, 0, 1) },
      earthNightIntensity: { value: 1.72 }
    };

    function prepareTexture(texture, colorTexture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.colorSpace = colorTexture ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      return texture;
    }

    function buildEarth() {
      surfaceGeometry = new THREE.SphereGeometry(1, 96, 64);
      surfaceMaterial = new THREE.MeshStandardMaterial({
        map: dayTexture,
        bumpMap: surfaceTexture,
        bumpScale: 0.028,
        roughnessMap: surfaceTexture,
        roughness: 0.88,
        metalness: 0
      });

      nightShaderUniforms.earthNightMap.value = nightTexture;
      surfaceMaterial.onBeforeCompile = function (shader) {
        shader.uniforms.earthNightMap = nightShaderUniforms.earthNightMap;
        shader.uniforms.earthSunDirectionView = nightShaderUniforms.earthSunDirectionView;
        shader.uniforms.earthNightIntensity = nightShaderUniforms.earthNightIntensity;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D earthNightMap;
          uniform vec3 earthSunDirectionView;
          uniform float earthNightIntensity;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          `float earthSunAmount = dot(normalize(normal), normalize(earthSunDirectionView));
          float earthNightMask = 1.0 - smoothstep(-0.18, 0.28, earthSunAmount);
          vec3 earthNightLights = texture2D(earthNightMap, vMapUv).rgb;
          outgoingLight += earthNightLights * earthNightMask * earthNightIntensity;
          #include <opaque_fragment>`
        );
      };
      surfaceMaterial.customProgramCacheKey = function () {
        return "layered-earth-day-night-v1";
      };

      earthSurface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
      earthSurface.renderOrder = 1;
      earthTilt.add(earthSurface);

      cloudsMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        uniforms: {
          surfaceMap: { value: surfaceTexture },
          sunDirection: { value: sunDirection }
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vWorldNormal;
          varying vec3 vWorldPosition;

          void main() {
            vUv = uv;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `,
        fragmentShader: `
          uniform sampler2D surfaceMap;
          uniform vec3 sunDirection;
          varying vec2 vUv;
          varying vec3 vWorldNormal;
          varying vec3 vWorldPosition;

          void main() {
            vec3 normalDirection = normalize(vWorldNormal);
            float sunAmount = dot(normalDirection, normalize(sunDirection));
            float daylight = smoothstep(-0.24, 0.72, sunAmount);
            float cloudMask = smoothstep(0.18, 0.90, texture2D(surfaceMap, vUv).b);
            float rim = pow(1.0 - max(dot(normalDirection, normalize(cameraPosition - vWorldPosition)), 0.0), 2.0);
            float twilight = 1.0 - smoothstep(0.02, 0.34, abs(sunAmount));
            vec3 cloudColor = mix(vec3(0.16, 0.24, 0.34), vec3(1.0, 0.98, 0.94), daylight);
            cloudColor += vec3(0.72, 0.28, 0.12) * twilight * 0.14;
            float alpha = cloudMask * mix(0.16, 0.70, daylight) * (0.88 + rim * 0.12);
            gl_FragColor = vec4(cloudColor, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      });

      cloudLayer = new THREE.Mesh(surfaceGeometry, cloudsMaterial);
      cloudLayer.scale.setScalar(1.008);
      cloudLayer.renderOrder = 2;
      earthTilt.add(cloudLayer);
    }

    function resize() {
      if (disposed) return;
      const bounds = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      const nativeRatio = Math.min(window.devicePixelRatio || 1, 1.6);
      const budgetRatio = Math.sqrt(900000 / Math.max(1, width * height));
      const pixelRatio = Math.max(1, Math.min(nativeRatio, budgetRatio));
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender(true);
    }

    function requestRender(force) {
      if (disposed) return;
      if (force) lastPaint = 0;
      if (!frameId && !document.hidden) frameId = requestAnimationFrame(render);
    }

    function render(now) {
      frameId = 0;
      if (disposed || document.hidden) return;

      const active = document.body.classList.contains("is-syncing") ||
        document.body.classList.contains("is-cockpit-dragging") ||
        now - lastPointerMove < 700;
      const interval = active ? 1000 / 24 : 1000 / 12;
      if (!reducedMotion.matches && lastPaint && now - lastPaint < interval) {
        frameId = requestAnimationFrame(render);
        return;
      }

      const delta = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      lastPaint = now;
      smoothPointerX += (pointerX - smoothPointerX) * Math.min(1, delta * 4.2);
      smoothPointerY += (pointerY - smoothPointerY) * Math.min(1, delta * 4.2);

      if (modelReady && !reducedMotion.matches) {
        longitude += delta * (active ? 0.052 : 0.016);
      }
      if (earthSurface) {
        earthSurface.rotation.y = longitude + smoothPointerX;
        earthSurface.rotation.x = smoothPointerY;
      }
      if (cloudLayer) {
        cloudLayer.rotation.y = longitude * 1.004 + smoothPointerX + 0.018;
        cloudLayer.rotation.x = smoothPointerY * 0.92;
      }

      camera.updateMatrixWorld();
      nightShaderUniforms.earthSunDirectionView.value
        .copy(sunDirection)
        .transformDirection(camera.matrixWorldInverse);
      renderer.render(scene, camera);

      if (!reducedMotion.matches) frameId = requestAnimationFrame(render);
    }

    Promise.all([
      loader.loadAsync(textureFiles.day),
      loader.loadAsync(textureFiles.night),
      loader.loadAsync(textureFiles.surface)
    ]).then(function (textures) {
      if (disposed) return;
      dayTexture = prepareTexture(textures[0], true);
      nightTexture = prepareTexture(textures[1], true);
      surfaceTexture = prepareTexture(textures[2], false);
      buildEarth();
      modelReady = true;
      container.dataset.renderer = "three-layered-earth-4k";
      container.classList.add("is-ready");
      requestRender(true);
    }).catch(function (error) {
      container.classList.add("earth-load-failed");
      console.warn("[earth-three] Layered Earth textures failed to load", error);
      requestRender(true);
    });

    function onPointerMove(event) {
      pointerX = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 0.12;
      pointerY = (0.5 - event.clientY / Math.max(1, window.innerHeight)) * 0.075;
      lastPointerMove = performance.now();
      requestRender(false);
    }

    function onVisibilityChange() {
      cancelAnimationFrame(frameId);
      frameId = 0;
      if (!document.hidden) requestRender(true);
    }

    function disposeEarth(event) {
      if (event && event.persisted) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      dayTexture?.dispose();
      nightTexture?.dispose();
      surfaceTexture?.dispose();
      surfaceGeometry?.dispose();
      surfaceMaterial?.dispose();
      cloudsMaterial?.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      renderer.dispose();
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.addEventListener("change", function () {
      requestRender(true);
    });
    window.addEventListener("pagehide", disposeEarth);

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener("resize", resize);
    }

    resize();
    requestRender(true);

    window.EarthOrbit3D = Object.freeze({
      render: function () {
        requestRender(true);
      },
      getStats: function () {
        return {
          ready: modelReady,
          renderer: container.dataset.renderer || "loading",
          pixelRatio: renderer.getPixelRatio(),
          textures: renderer.info.memory.textures,
          geometries: renderer.info.memory.geometries,
          textureResolution: "4096x2048"
        };
      }
    });
  }
}
