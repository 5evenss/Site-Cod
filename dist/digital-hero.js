"use strict";

(() => {
  const CONFIG = {
    text: "Веб-Технологии",
    color: "#dddfe3",
    particleCount: 1800,
    mobileRatio: 0.7,
    maxDpr: 2,
    maxFps: 60,
    speed: 2.4,
    background: {
      glyphs: "01{}[]<>/\\*+#ABCDEFGHIJKLMNOPQRSTUVWXYZ$=;:()!%&",
      areaPerSymbol: 700,
      minCount: 420,
      maxCount: 1600,
      mobileMinCount: 280,
      mobileScale: 0.85,
      sizes: [7, 9, 11, 14],
      speeds: [10, 40],
      opacity: [0.1, 0.28],
    },
    textPhysics: {
      glyphs: "01+*{}<>#AXYZ",
      pointerRadius: 100,
      pointerForce: 18000,
      spring: 42,
      damping: 10,
      maxVelocity: 700,
      step: 1 / 120,
    },
  };

  const root = document.querySelector("#digital-hero");
  if (!root) return;
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const title = root.querySelector(".digital-hero__title");
  const titleSlot = root.querySelector(".digital-hero__title-slot");
  const pauseButton = root.querySelector(".digital-hero__pause");
  const replayButton = root.querySelector(".digital-hero__replay");
  const phaseLabels = [...root.querySelectorAll("[data-phase]")];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  title.textContent = CONFIG.text;
  if (!ctx) return;

  const color = /^#[a-f\d]{6}$/i.test(CONFIG.color) ? CONFIG.color : "#dddfe3";
  const rgb = [1, 3, 5].map((start) =>
    parseInt(color.slice(start, start + 2), 16),
  );
  const fontFamily = getComputedStyle(title).fontFamily;
  const frameDuration = 1000 / Math.max(15, Math.min(120, CONFIG.maxFps));
  const flowSpeed = Math.max(0.1, Number(CONFIG.speed) || 1);
  const pointer = { x: 0, y: 0, active: false };
  root.style.setProperty("--dh-color", color);
  root.style.setProperty("--dh-rgb", rgb.join(", "));

  let width = 0;
  let height = 0;
  let dpr = 1;
  let geometryKey = "";
  let ready = false;
  let visible = false;
  let locallyPaused = false;
  let reducedMotionAllowed = false;
  let frameId = 0;
  let lastFrame = null;
  let nextFrameDue = 0;
  let resizeTimer = 0;
  let bounds = null;
  let phase = "";
  const globalPaused = () =>
    document.documentElement.classList.contains("motion-off");
  const motionBlocked = () =>
    locallyPaused ||
    globalPaused() ||
    (reducedMotion.matches && !reducedMotionAllowed);
  let wasGlobalPaused = globalPaused();
  const random = (min, max) => min + Math.random() * (max - min);

  // Cache glyphs at their display sizes and output DPR. The visible canvas
  // only copies sprites: no live fillText or per-particle blur calculations.
  function createAtlas(characters, sizes, bright) {
    const glyphs = [...characters];
    const cell = Math.ceil(Math.max(...sizes) + 8);
    const columns = 16;
    const atlas = document.createElement("canvas");
    atlas.width = Math.ceil(columns * cell * dpr);
    atlas.height = Math.ceil(
      Math.ceil((glyphs.length * sizes.length) / columns) * cell * dpr,
    );
    const context = atlas.getContext("2d");
    context.scale(dpr, dpr);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;
    context.shadowColor = `rgba(${rgb},${bright ? 0.3 : 0.12})`;
    context.shadowBlur = (bright ? 0.7 : 0.4) * dpr;
    const sprites = [];
    sizes.forEach((size) => {
      context.font = `${bright ? 700 : 400} ${size}px monospace`;
      glyphs.forEach((glyph) => {
        const index = sprites.length;
        const x = (index % columns) * cell;
        const y = Math.floor(index / columns) * cell;
        context.fillText(glyph, x + cell / 2, y + cell / 2);
        sprites.push({
          x: x * dpr,
          y: y * dpr,
          pixels: cell * dpr,
          size: cell,
        });
      });
    });
    return { canvas: atlas, sprites, glyphCount: glyphs.length };
  }

  function drawGlyph(atlas, spriteIndex, x, y) {
    const sprite = atlas.sprites[spriteIndex];
    ctx.drawImage(
      atlas.canvas,
      sprite.x,
      sprite.y,
      sprite.pixels,
      sprite.pixels,
      x - sprite.size / 2,
      y - sprite.size / 2,
      sprite.size,
      sprite.size,
    );
  }

  const background = {
    particles: [],
    atlas: null,
    time: 0,
    rebuild(mobile) {
      const settings = CONFIG.background;
      const count = Math.round(
        Math.min(
          settings.maxCount,
          Math.max(
            mobile ? settings.mobileMinCount : settings.minCount,
            ((width * height) / settings.areaPerSymbol) *
              (mobile ? settings.mobileScale : 1),
          ),
        ),
      );
      this.atlas = createAtlas(settings.glyphs, settings.sizes, false);
      const columns = Math.ceil(Math.sqrt((count * width) / height));
      const rows = Math.ceil(count / columns);
      this.particles = Array.from({ length: count }, (_, index) => {
        const layer = index % settings.sizes.length;
        const depth = (layer + 1) / settings.sizes.length;
        const row = Math.floor(index / columns);
        const rowCount = Math.min(columns, count - row * columns);
        return {
          x: (((index % columns) + Math.random()) / rowCount) * width,
          homeY:
            ((row + Math.random()) / rows) * height,
          speed:
            random(settings.speeds[0], settings.speeds[1]) *
            (0.45 + depth * 0.75),
          alpha:
            random(settings.opacity[0], settings.opacity[1]) *
            (0.6 + depth * 0.4),
          sprite:
            layer * this.atlas.glyphCount +
            Math.floor(Math.random() * this.atlas.glyphCount),
          phase: Math.random() * Math.PI * 2,
          bob: random(0.5, 2.5),
        };
      });
    },
    update(delta) {
      this.time += delta;
      for (const particle of this.particles) {
        particle.x += particle.speed * flowSpeed * delta;
        if (particle.x > width + 22) particle.x -= width + 44;
      }
    },
    draw() {
      for (const particle of this.particles) {
        const edge = Math.min(
          1,
          Math.max(0, Math.min(particle.x + 10, width + 10 - particle.x)) / 30,
        );
        ctx.globalAlpha = particle.alpha * edge;
        drawGlyph(
          this.atlas,
          particle.sprite,
          particle.x,
          particle.homeY +
            Math.sin(this.time * 0.35 + particle.phase) * particle.bob,
        );
      }
    },
  };

  function sampleTitle(mobile) {
    const heroBounds = root.getBoundingClientRect();
    const slot = titleSlot.getBoundingClientRect();
    const mask = document.createElement("canvas");
    mask.width = Math.ceil(slot.width);
    mask.height = Math.ceil(slot.height);
    const maskCtx = mask.getContext("2d", { willReadFrequently: true });
    let lines = [CONFIG.text];
    if (mobile) {
      const index = CONFIG.text.includes("-")
        ? CONFIG.text.indexOf("-") + 1
        : CONFIG.text.lastIndexOf(" ");
      if (index > 0)
        lines = [
          CONFIG.text.slice(0, index).trim(),
          CONFIG.text.slice(index).trim(),
        ];
    }
    let fontSize = Math.min(
      mobile ? 72 : 118,
      slot.height / (lines.length * 1.23),
    );
    maskCtx.font = `800 ${fontSize}px ${fontFamily}`;
    const measured = Math.max(
      ...lines.map((line) => maskCtx.measureText(line).width),
    );
    fontSize *= Math.min(1, Math.min(slot.width - 8, width * 0.91) / measured);
    maskCtx.font = `800 ${fontSize}px ${fontFamily}`;
    maskCtx.textAlign = "center";
    maskCtx.textBaseline = "middle";
    maskCtx.fillStyle = "#fff";
    lines.forEach((line, index) =>
      maskCtx.fillText(
        line,
        mask.width / 2,
        mask.height / 2 + (index - (lines.length - 1) / 2) * fontSize * 1.2,
      ),
    );
    const pixels = maskCtx.getImageData(0, 0, mask.width, mask.height).data;
    const budget = Math.max(
      250,
      Math.round(CONFIG.particleCount * (mobile ? CONFIG.mobileRatio : 1)),
    );
    let spacing = Math.max(3.6, fontSize * 0.049);
    let targets;

    // A staggered grid preserves thin Cyrillic strokes. Increase spacing to
    // meet the budget instead of randomly deleting points from the letters.
    do {
      targets = [];
      let row = 0;
      for (let y = spacing / 2; y < mask.height; y += spacing, row++) {
        for (
          let x = spacing / 2 + ((row % 2) * spacing) / 2;
          x < mask.width;
          x += spacing
        ) {
          if (
            pixels[(Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3] > 150
          )
            targets.push({
              x: x + slot.left - heroBounds.left,
              y: y + slot.top - heroBounds.top,
            });
        }
      }
      if (targets.length <= budget) break;
      spacing *= Math.max(1.04, Math.sqrt(targets.length / budget));
    } while (targets.length > budget);
    return { targets, spacing };
  }

  const textParticles = {
    particles: [],
    atlas: null,
    accumulator: 0,
    rebuild(mobile) {
      const { targets, spacing } = sampleTitle(mobile);
      const size = Math.max(5, Math.min(8.5, spacing * 1.4));
      this.atlas = createAtlas(
        CONFIG.textPhysics.glyphs,
        [size, size * 0.92],
        true,
      );
      this.particles = targets.map((home) => ({
        homeX: home.x,
        homeY: home.y,
        x: home.x,
        y: home.y,
        velocityX: 0,
        velocityY: 0,
        sprite: Math.floor(Math.random() * this.atlas.sprites.length),
        alpha: random(0.82, 1),
        direction: random(0, Math.PI * 2),
        settled: true,
      }));
      this.accumulator = 0;
    },
    update(delta) {
      const physics = CONFIG.textPhysics;
      const radius = Math.min(
        physics.pointerRadius,
        width <= 600 ? 65 : Infinity,
      );
      const radiusSq = radius * radius;
      const step = physics.step;
      const damping = Math.exp(-physics.damping * step);
      this.accumulator += delta;
      let repelled = false;
      let moving = false;

      // Fixed, bounded substeps keep the spring stable across refresh rates.
      // Repulsion changes position and momentum; hover never changes opacity.
      while (this.accumulator >= step) {
        for (const particle of this.particles) {
          let forceX = 0;
          let forceY = 0;
          if (pointer.active) {
            let dx = particle.x - pointer.x;
            let dy = particle.y - pointer.y;
            let distanceSq = dx * dx + dy * dy;
            if (distanceSq < radiusSq) {
              if (distanceSq < 0.01) {
                dx = Math.cos(particle.direction);
                dy = Math.sin(particle.direction);
                distanceSq = 1;
              }
              const distance = Math.sqrt(distanceSq);
              const falloff = 1 - distance / radius;
              const force = physics.pointerForce * falloff * falloff;
              forceX = (dx / distance) * force;
              forceY = (dy / distance) * force;
              particle.settled = false;
              repelled = true;
            }
          }
          if (particle.settled) continue;
          forceX += (particle.homeX - particle.x) * physics.spring;
          forceY += (particle.homeY - particle.y) * physics.spring;
          particle.velocityX = (particle.velocityX + forceX * step) * damping;
          particle.velocityY = (particle.velocityY + forceY * step) * damping;
          const velocity = Math.hypot(particle.velocityX, particle.velocityY);
          if (velocity > physics.maxVelocity) {
            particle.velocityX *= physics.maxVelocity / velocity;
            particle.velocityY *= physics.maxVelocity / velocity;
          }
          particle.x += particle.velocityX * step;
          particle.y += particle.velocityY * step;
          if (
            Math.abs(particle.homeX - particle.x) +
              Math.abs(particle.homeY - particle.y) <
              0.04 &&
            velocity < 0.08
          ) {
            particle.x = particle.homeX;
            particle.y = particle.homeY;
            particle.velocityX = particle.velocityY = 0;
            particle.settled = true;
          } else moving = true;
        }
        this.accumulator -= step;
      }
      if (delta > 0)
        updatePhase(repelled ? "disperse" : moving ? "assemble" : "hold");
    },
    draw() {
      for (const particle of this.particles) {
        ctx.globalAlpha = particle.alpha;
        drawGlyph(this.atlas, particle.sprite, particle.x, particle.y);
      }
    },
    settle() {
      for (const particle of this.particles) {
        particle.x = particle.homeX;
        particle.y = particle.homeY;
        particle.velocityX = particle.velocityY = 0;
        particle.settled = true;
      }
      this.accumulator = 0;
      updatePhase("hold");
    },
    reassemble() {
      for (const particle of this.particles) {
        particle.x = particle.homeX + Math.cos(particle.direction) * 18;
        particle.y = particle.homeY + Math.sin(particle.direction) * 18;
        particle.velocityX = particle.velocityY = 0;
        particle.settled = false;
      }
      updatePhase("assemble");
    },
  };

  function updatePhase(name) {
    if (phase === name) return;
    phase = name;
    root.dataset.phase = name;
    phaseLabels.forEach((label) =>
      label.classList.toggle("is-active", label.dataset.phase === name),
    );
  }

  function render() {
    if (!ready) return;
    ctx.clearRect(0, 0, width, height);
    background.draw();
    textParticles.draw();
    ctx.globalAlpha = 1;
  }

  function rebuild() {
    pauseButton.hidden = replayButton.hidden = false;
    const heroRect = root.getBoundingClientRect();
    const slotRect = titleSlot.getBoundingClientRect();
    const nextDpr = Math.max(1, Math.min(devicePixelRatio || 1, CONFIG.maxDpr));
    const nextKey = [
      root.clientWidth,
      root.clientHeight,
      nextDpr,
      slotRect.width,
      slotRect.height,
      slotRect.top - heroRect.top,
      slotRect.left - heroRect.left,
    ]
      .map((value) => Math.round(value * 10) / 10)
      .join(":");
    if (ready && nextKey === geometryKey) return;
    width = root.clientWidth;
    height = root.clientHeight;
    dpr = nextDpr;
    geometryKey = nextKey;
    bounds = null;
    pointer.active = false;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    background.rebuild(width <= 600);
    textParticles.rebuild(width <= 600);
    ready = textParticles.particles.length > 0;
    root.classList.toggle("is-ready", ready);
    updatePhase("hold");
    render();
    sync();
  }

  function tick(now) {
    frameId = 0;
    if (!ready || !visible || document.hidden || motionBlocked()) return;
    if (nextFrameDue && now + 0.5 < nextFrameDue) {
      frameId = requestAnimationFrame(tick);
      return;
    }
    const delta =
      lastFrame === null
        ? frameDuration / 1000
        : Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    nextFrameDue =
      nextFrameDue && now - nextFrameDue < frameDuration
        ? nextFrameDue + frameDuration
        : now + frameDuration;
    background.update(delta);
    textParticles.update(delta);
    render();
    frameId = requestAnimationFrame(tick);
  }

  function sync() {
    const blocked = motionBlocked();
    pauseButton.setAttribute("aria-pressed", String(blocked));
    pauseButton.setAttribute(
      "aria-label",
      blocked
        ? "Запустить анимацию цифрового потока"
        : "Приостановить анимацию цифрового потока",
    );
    pauseButton.querySelector(".digital-hero__pause-icon").textContent = blocked
      ? "▷"
      : "Ⅱ";
    pauseButton.querySelector(".digital-hero__pause-label").textContent =
      blocked ? "Запустить" : "Пауза";
    if (!ready || !visible || document.hidden || blocked) {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = null;
      nextFrameDue = 0;
    } else if (!frameId) frameId = requestAnimationFrame(tick);
  }

  pauseButton.addEventListener("click", () => {
    if (motionBlocked()) {
      locallyPaused = false;
      reducedMotionAllowed = true;
      if (globalPaused()) document.querySelector("#motion-toggle")?.click();
    } else locallyPaused = true;
    sync();
  });
  replayButton.addEventListener("click", () => {
    pointer.active = false;
    if (motionBlocked()) textParticles.settle();
    else textParticles.reassemble();
    render();
    sync();
  });
  function movePointer(event) {
    if (motionBlocked()) return;
    bounds ||= root.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.active = true;
  }
  root.addEventListener("pointermove", movePointer, { passive: true });
  root.addEventListener("pointerdown", movePointer, { passive: true });
  root.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
  root.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") pointer.active = false;
  });
  root.addEventListener("pointercancel", () => {
    pointer.active = false;
  });
  window.addEventListener(
    "scroll",
    () => {
      bounds = null;
      pointer.active = false;
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    pointer.active = false;
    sync();
  });
  reducedMotion.addEventListener("change", () => {
    reducedMotionAllowed = false;
    if (reducedMotion.matches) {
      pointer.active = false;
      textParticles.settle();
      render();
    }
    sync();
  });
  new MutationObserver(() => {
    const paused = globalPaused();
    if (wasGlobalPaused && !paused) reducedMotionAllowed = true;
    wasGlobalPaused = paused;
    sync();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) pointer.active = false;
      sync();
    },
    { threshold: 0.01 },
  ).observe(root);
  function queueResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 100);
  }
  const resizeObserver = new ResizeObserver(queueResize);
  window.addEventListener("resize", queueResize, { passive: true });
  document.fonts
    .load(`800 80px ${fontFamily}`, CONFIG.text)
    .catch(() => {})
    .then(() => {
      rebuild();
      resizeObserver.observe(root);
      resizeObserver.observe(titleSlot);
    });
})();
