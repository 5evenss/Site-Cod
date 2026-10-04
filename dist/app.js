"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let motionPaused = reducedMotion.matches;
  try {
    if (localStorage.getItem("orbit-motion") === "paused") motionPaused = true;
  } catch {
    /* Local preferences are optional, including in file:// mode. */
  }
  let labPaused = false;
  let scene;
  const motionButton = $("#motion-toggle");

  function updateMotion() {
    document.documentElement.classList.toggle("motion-off", motionPaused);
    motionButton.setAttribute("aria-pressed", String(motionPaused));
    motionButton.setAttribute(
      "aria-label",
      motionPaused ? "Включить анимацию" : "Приостановить анимацию",
    );
    $(".motion-label").textContent = motionPaused
      ? "Движение выкл."
      : "Движение вкл.";
    const paused = motionPaused || labPaused;
    $("#lab-pause").setAttribute("aria-pressed", String(paused));
    $("#pause-label").textContent = paused
      ? "Продолжить движение"
      : "Остановить мгновение";
    $("#pause-icon").textContent = paused ? "▷" : "Ⅱ";
    $(".live-dot").style.opacity = paused ? ".35" : "1";
    scene?.sync();
  }
  motionButton.addEventListener("click", () => {
    motionPaused = !motionPaused;
    try {
      localStorage.setItem("orbit-motion", motionPaused ? "paused" : "playing");
    } catch {
      /* Optional preference. */
    }
    updateMotion();
  });
  reducedMotion.addEventListener("change", (event) => {
    motionPaused = event.matches;
    updateMotion();
  });
  $("#lab-pause").addEventListener("click", () => {
    if (motionPaused) {
      motionPaused = false;
      labPaused = false;
      try {
        localStorage.setItem("orbit-motion", "playing");
      } catch {
        /* Optional preference. */
      }
    } else labPaused = !labPaused;
    updateMotion();
  });

  // Navigation remains native anchor navigation; there is no scroll interception.
  const menuButton = $(".menu-toggle");
  const mobileNav = $("#mobile-nav");
  function closeMenu(restoreFocus = false) {
    mobileNav.classList.remove("open");
    mobileNav.inert = true;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Открыть меню");
    document.body.classList.remove("menu-open");
    if (restoreFocus) menuButton.focus();
  }
  menuButton.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    if (!open) {
      closeMenu();
      return;
    }
    mobileNav.inert = false;
    mobileNav.classList.add("open");
    menuButton.setAttribute("aria-expanded", "true");
    menuButton.setAttribute("aria-label", "Закрыть меню");
    document.body.classList.add("menu-open");
  });
  $$("#mobile-nav a").forEach((link) =>
    link.addEventListener("click", () => closeMenu()),
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileNav.classList.contains("open"))
      closeMenu(true);
    if (event.key === "Tab" && mobileNav.classList.contains("open")) {
      const lastLink = mobileNav.lastElementChild;
      if (event.shiftKey && document.activeElement === menuButton) {
        event.preventDefault();
        lastLink.focus();
      } else if (!event.shiftKey && document.activeElement === lastLink) {
        event.preventDefault();
        menuButton.focus();
      }
    }
  });
  window
    .matchMedia("(min-width: 601px)")
    .addEventListener("change", (event) => {
      if (event.matches) closeMenu();
    });
  document.addEventListener("click", (event) => {
    if (
      mobileNav.classList.contains("open") &&
      !$(".header").contains(event.target)
    )
      closeMenu();
  });

  // One frame per scroll event burst, never a permanently running page loop.
  const progress = $(".scroll-progress");
  let scrollQueued = false;
  function updateProgress() {
    const total = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${total > 0 ? window.scrollY / total : 0})`;
    scrollQueued = false;
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!scrollQueued) {
        scrollQueued = true;
        requestAnimationFrame(updateProgress);
      }
    },
    { passive: true },
  );
  window.addEventListener("resize", updateProgress, { passive: true });
  updateProgress();

  const hero = $(".hero");
  let heroRect = null;
  let pointerFrame = 0;
  let pointerX = 0;
  let pointerY = 0;
  window.addEventListener(
    "scroll",
    () => {
      heroRect = null;
    },
    { passive: true },
  );
  window.addEventListener(
    "resize",
    () => {
      heroRect = null;
    },
    { passive: true },
  );
  hero.addEventListener("pointerenter", () => {
    heroRect = hero.getBoundingClientRect();
  });
  hero.addEventListener(
    "pointermove",
    (event) => {
      if (motionPaused || event.pointerType !== "mouse") return;
      heroRect ||= hero.getBoundingClientRect();
      pointerX = ((event.clientX - heroRect.left) / heroRect.width - 0.5) * 22;
      pointerY = ((event.clientY - heroRect.top) / heroRect.height - 0.5) * 16;
      if (!pointerFrame)
        pointerFrame = requestAnimationFrame(() => {
          hero.style.setProperty("--art-x", `${pointerX.toFixed(1)}px`);
          hero.style.setProperty("--art-y", `${pointerY.toFixed(1)}px`);
          pointerFrame = 0;
        });
    },
    { passive: true },
  );
  hero.addEventListener("pointerleave", () => {
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    hero.style.setProperty("--art-x", "0px");
    hero.style.setProperty("--art-y", "0px");
  });

  // A single responsive 2D canvas projects a 3D point cloud. Shape coordinates and
  // drawing buffers are reused; no object allocations or pairwise lines per frame.
  function createParticleScene() {
    const canvas = $("#particle-canvas");
    const stage = $(".canvas-stage");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      $(".canvas-fallback").hidden = false;
      return { sync() {} };
    }
    const compact = window.matchMedia("(max-width: 600px)").matches;
    const count = compact ? 700 : 1250;
    let drawCount = count;
    const base = new Float32Array(count * 3);
    const current = new Float32Array(count * 3);
    const screenX = new Float32Array(count);
    const screenY = new Float32Array(count);
    const radii = new Float32Array(count);
    const buckets = new Uint8Array(count);
    const colors = {
      lime: [212, 250, 105],
      blue: [121, 207, 255],
      violet: [191, 156, 255],
      white: [241, 241, 233],
    };
    const names = {
      sphere: "001 / СФЕРА",
      wave: "002 / ВОЛНА",
      helix: "003 / СПИРАЛЬ",
    };
    const accessibleNames = {
      sphere: "сфера",
      wave: "волна",
      helix: "спираль",
    };
    let palette = [];
    let shape = "sphere";
    let width = 1;
    let height = 1;
    let dpr = 1;
    let phase = 0.55;
    let speed = 1;
    let frame = 0;
    let last = 0;
    let visible = false;
    let fpsStart = 0;
    let fpsFrames = 0;
    let fps = 0;
    let slowPeriods = 0;
    let cursorX = 0;
    let cursorY = 0;
    let rotationX = 0;
    let rotationY = 0;
    let stageRect;
    const fpsLabel = $("#fps-counter");

    function setPalette(color) {
      const rgb = colors[color];
      palette = Array.from(
        { length: 6 },
        (_, index) =>
          `rgba(${rgb.join(",")},${(0.16 + index * 0.16).toFixed(2)})`,
      );
    }
    function makeShape(nextShape, immediate = false) {
      shape = nextShape;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const columns = Math.ceil(Math.sqrt(count * 1.35));
      const rows = Math.ceil(count / columns);
      for (let i = 0; i < count; i++) {
        const offset = i * 3;
        if (shape === "sphere") {
          const y = 1 - (i / (count - 1)) * 2;
          const radius = Math.sqrt(1 - y * y);
          base[offset] = Math.cos(goldenAngle * i) * radius;
          base[offset + 1] = y;
          base[offset + 2] = Math.sin(goldenAngle * i) * radius;
        } else if (shape === "wave") {
          base[offset] = ((i % columns) / (columns - 1) - 0.5) * 2.8;
          base[offset + 1] = 0;
          base[offset + 2] = (Math.floor(i / columns) / (rows - 1) - 0.5) * 2.3;
        } else {
          const t = i / count;
          const angle = t * Math.PI * 14;
          const ribbon = Math.sin(i * 2.399) * 0.15;
          base[offset] = Math.cos(angle) * (0.65 + ribbon);
          base[offset + 1] = (t - 0.5) * 2.5;
          base[offset + 2] = Math.sin(angle) * (0.65 + ribbon);
        }
      }
      if (immediate || motionPaused || labPaused) current.set(base);
      $("#canvas-caption").textContent = names[shape];
      canvas.setAttribute(
        "aria-label",
        `Интерактивная трёхмерная ${accessibleNames[shape]} из частиц. Форма, цвет и скорость настраиваются в панели рядом.`,
      );
      if (!frame) draw(0);
    }

    function draw(delta) {
      ctx.fillStyle = "#0d100c";
      ctx.fillRect(0, 0, width, height);
      const lerp = delta ? 1 - Math.exp(-delta * 5) : 0;
      rotationX += (cursorX - rotationX) * lerp;
      rotationY += (cursorY - rotationY) * lerp;
      const angle = phase * 0.2 + rotationX * 0.6;
      const tilt = (shape === "wave" ? 0.58 : -0.13) + rotationY * 0.4;
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      const cosTilt = Math.cos(tilt),
        sinTilt = Math.sin(tilt);
      const scale = Math.min(width * 0.32, height * 0.34);
      for (let i = 0; i < drawCount; i++) {
        // Adaptive density samples the entire cloud, rather than chopping a shape.
        const source = Math.floor((i * count) / drawCount) * 3;
        for (let axis = 0; axis < 3; axis++)
          current[source + axis] +=
            (base[source + axis] - current[source + axis]) * lerp;
        let x = current[source],
          y = current[source + 1],
          z = current[source + 2];
        if (shape === "wave")
          y +=
            Math.sin(x * 2.4 + phase) * 0.21 +
            Math.cos(z * 2.9 + phase * 0.7) * 0.19;
        const rotatedX = x * cos + z * sin;
        const rotatedZ = -x * sin + z * cos;
        const rotatedY = y * cosTilt - rotatedZ * sinTilt;
        const depth = y * sinTilt + rotatedZ * cosTilt;
        const perspective = 3.9 / (3.9 - depth);
        screenX[i] = width / 2 + rotatedX * scale * perspective;
        screenY[i] = height / 2 + rotatedY * scale * perspective;
        radii[i] = Math.max(0.6, (1.1 + (depth + 1) * 0.35) * perspective);
        buckets[i] = Math.max(0, Math.min(5, Math.floor((depth + 1.45) * 2)));
      }
      // Only six fill calls for the entire scene; no expensive per-point effects.
      for (let bucket = 0; bucket < 6; bucket++) {
        ctx.beginPath();
        ctx.fillStyle = palette[bucket];
        for (let i = 0; i < drawCount; i++) {
          if (buckets[i] !== bucket) continue;
          ctx.moveTo(screenX[i] + radii[i], screenY[i]);
          ctx.arc(screenX[i], screenY[i], radii[i], 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.strokeStyle = "#8b9a6125";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(
        width / 2,
        height / 2,
        scale * 1.47,
        scale * 0.39,
        -0.36,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.fillStyle = "#d4fa6960";
      ctx.fillRect(width / 2 - 3, height / 2, 6, 1);
      ctx.fillRect(width / 2, height / 2 - 3, 1, 6);
    }
    function tick(now) {
      frame = 0;
      const delta = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      phase += delta * speed;
      draw(delta);
      if (!fpsStart) fpsStart = now;
      fpsFrames++;
      if (now - fpsStart >= 1000) {
        fps = Math.round((fpsFrames * 1000) / (now - fpsStart));
        fpsLabel.textContent = `${fps} FPS`;
        if (fps < 38) slowPeriods++;
        else slowPeriods = 0;
        if (slowPeriods >= 3 && drawCount > 420) {
          drawCount = Math.max(420, Math.floor(drawCount * 0.8));
          slowPeriods = 0;
        }
        fpsStart = now;
        fpsFrames = 0;
      }
      if (visible && !document.hidden && !motionPaused && !labPaused)
        frame = requestAnimationFrame(tick);
    }
    function sync() {
      const shouldRun =
        visible && !document.hidden && !motionPaused && !labPaused;
      if (!shouldRun) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        fpsStart = 0;
        fpsFrames = 0;
        fpsLabel.textContent = motionPaused || labPaused ? "ПАУЗА" : "— FPS";
      } else if (!frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    }
    function resize() {
      stageRect = stage.getBoundingClientRect();
      width = stage.clientWidth;
      height = stage.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(0);
    }
    setPalette("lime");
    makeShape("sphere", true);
    resize();
    new ResizeObserver(resize).observe(stage);
    new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0.01 },
    ).observe(stage);
    stage.addEventListener("pointerenter", () => {
      stageRect = stage.getBoundingClientRect();
    });
    window.addEventListener(
      "scroll",
      () => {
        stageRect = null;
      },
      { passive: true },
    );
    stage.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerType !== "mouse" || motionPaused || labPaused) return;
        stageRect ||= stage.getBoundingClientRect();
        cursorX = ((event.clientX - stageRect.left) / width - 0.5) * 2;
        cursorY = ((event.clientY - stageRect.top) / height - 0.5) * 2;
      },
      { passive: true },
    );
    stage.addEventListener("pointerleave", () => {
      cursorX = 0;
      cursorY = 0;
    });
    $$(".shape-button").forEach((button) =>
      button.addEventListener("click", () => {
        $$(".shape-button").forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        makeShape(button.dataset.shape);
      }),
    );
    $$(".color-swatch").forEach((button) =>
      button.addEventListener("click", () => {
        $$(".color-swatch").forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        setPalette(button.dataset.color);
        $("#color-name").textContent = button.dataset.color.toUpperCase();
        if (!frame) draw(0);
      }),
    );
    $("#speed").addEventListener("input", (event) => {
      speed = Number(event.target.value);
      const value = `${speed.toFixed(1)}×`;
      $("#speed-value").value = value;
      event.target.setAttribute("aria-valuetext", value);
      event.target.style.setProperty(
        "--range-fill",
        `${((speed - 0.2) / 1.8) * 100}%`,
      );
    });
    return { sync };
  }

  // A static visualization makes the project preview inexpensive while scrolling.
  function drawSignal(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#151a10";
    ctx.fillRect(0, 0, width, height);
    for (let row = 0; row < 30; row++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(205,240,151,${0.2 + row / 55})`;
      ctx.lineWidth = 0.8;
      for (let col = 0; col <= 80; col++) {
        const x = (col / 80) * width * 1.3 - width * 0.15;
        const y =
          height * 0.56 +
          row * height * 0.013 +
          Math.sin(col * 0.065 + row * 0.085) * height * 0.11 +
          Math.sin(col * 0.13 - row * 0.13) * height * 0.05;
        if (col === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const preview = $("#signal-preview");
  new ResizeObserver(() => drawSignal(preview)).observe(preview.parentElement);

  const projects = {
    flux: {
      title: "Flux — форма перемен",
      eyebrow: "EXPERIMENT 001 / VISUAL IDENTITY",
      description:
        "Что, если у цифрового бренда нет фиксированной формы? Flux исследует это состояние: текучее стекло, электрический синий и типографика на грани масштаба. Объект меняется вместе с точкой зрения, но сохраняет свой характер.",
      direction: "Визуальная идентичность",
      tools: "Digital art, типографика",
      shape: "wave",
      color: "blue",
    },
    signal: {
      title: "Signal — увидеть невидимое",
      eyebrow: "EXPERIMENT 002 / GENERATIVE DESIGN",
      description:
        "У движения есть ритм, а у ритма — форма. Signal превращает математические функции в живую графику: точки собираются в объём, линии складываются в волны. Продолжи эксперимент в лаборатории и найди свою частоту.",
      direction: "Интерактивный опыт",
      tools: "Canvas, математика, движение",
      shape: "helix",
      color: "lime",
    },
  };
  const dialog = $("#project-dialog");
  let selectedProject = "flux";
  let dialogTrigger;
  let movingToLab = false;
  $$(".project-card").forEach((button) =>
    button.addEventListener("click", () => {
      selectedProject = button.dataset.project;
      const project = projects[selectedProject];
      dialogTrigger = button;
      $("#dialog-title").textContent = project.title;
      $("#dialog-eyebrow").textContent = project.eyebrow;
      $("#dialog-description").textContent = project.description;
      const details = $("#dialog-details");
      details.replaceChildren();
      [
        ["НАПРАВЛЕНИЕ", project.direction],
        ["ИНСТРУМЕНТЫ", project.tools],
        ["СТАТУС", "Авторская концепция"],
      ].forEach(([label, value]) => {
        const block = document.createElement("div");
        const term = document.createElement("dt");
        const definition = document.createElement("dd");
        term.textContent = label;
        definition.textContent = value;
        block.append(term, definition);
        details.append(block);
      });
      const art = $("#dialog-art");
      art.replaceChildren();
      if (selectedProject === "flux") {
        const img = new Image();
        img.src = "./assets/blue-flux.webp";
        img.alt = "";
        art.append(img);
      } else art.append(document.createElement("canvas"));
      dialog.showModal();
      document.body.classList.add("dialog-open");
      if (selectedProject === "signal") drawSignal(art.firstElementChild);
      $(".dialog-close").focus();
    }),
  );
  $(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    if (!movingToLab) dialogTrigger?.focus({ preventScroll: true });
    movingToLab = false;
  });
  $("#dialog-lab").addEventListener("click", () => {
    const project = projects[selectedProject];
    movingToLab = true;
    dialog.close();
    $(`[data-shape="${project.shape}"]`).click();
    $(`[data-color="${project.color}"]`).click();
    $("#lab").scrollIntoView({
      behavior: motionPaused || reducedMotion.matches ? "instant" : "smooth",
    });
    $(`[data-shape="${project.shape}"]`).focus({ preventScroll: true });
  });

  scene = createParticleScene();
  updateMotion();
  document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("page-hidden", document.hidden);
    scene.sync();
  });
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 },
  );
  $$(".reveal").forEach((element) => revealObserver.observe(element));
  const activityObserver = new IntersectionObserver((entries) =>
    entries.forEach((entry) =>
      entry.target.classList.toggle("offscreen", !entry.isIntersecting),
    ),
  );
  [hero, $(".ticker")].forEach((element) => activityObserver.observe(element));
  document.documentElement.classList.add("js");
})();
