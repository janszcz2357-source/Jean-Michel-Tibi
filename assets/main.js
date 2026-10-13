(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- language ---------- */
  var langButtons = document.querySelectorAll("[data-set-lang]");
  function setLang(lang, save) {
    root.setAttribute("data-lang", lang);
    root.lang = lang;
    for (var i = 0; i < langButtons.length; i++) {
      langButtons[i].setAttribute("aria-pressed", String(langButtons[i].getAttribute("data-set-lang") === lang));
    }
    if (save) { try { localStorage.setItem("jmt-lang", lang); } catch (e) {} }
  }
  for (var i = 0; i < langButtons.length; i++) {
    langButtons[i].addEventListener("click", function () { setLang(this.getAttribute("data-set-lang"), true); });
  }
  setLang(root.getAttribute("data-lang") === "fr" ? "fr" : "en", false);

  /* ---------- playback speed: 200 fps shot, played at 25p = 8x slower ---------- */
  var speed = 8;
  var speedButtons = document.querySelectorAll("[data-speed]");
  for (var j = 0; j < speedButtons.length; j++) {
    speedButtons[j].addEventListener("click", function () {
      speed = Number(this.getAttribute("data-speed"));
      for (var k = 0; k < speedButtons.length; k++) {
        speedButtons[k].setAttribute("aria-pressed", String(speedButtons[k] === this));
      }
    });
  }

  /* ---------- timecode ---------- */
  var tc = document.getElementById("tc");
  var frames = 0;
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function showTimecode() {
    var f = Math.floor(frames);
    tc.textContent = pad(1 + Math.floor(f / 90000) % 23) + ":" + pad(Math.floor(f / 1500) % 60) + ":" + pad(Math.floor(f / 25) % 60) + ":" + pad(f % 25);
  }

  /* ---------- light trails crossing the viewfinder ---------- */
  var cv = document.getElementById("streaks");
  var ctx = cv && cv.getContext ? cv.getContext("2d") : null;
  var W = 0, H = 0, streaks = [], colors = [];
  function readColors() {
    var cs = getComputedStyle(root);
    colors = [cs.getPropertyValue("--frame").trim(), cs.getPropertyValue("--screen-ink").trim(), cs.getPropertyValue("--rec").trim()];
  }
  function rgba(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function make(anywhere) {
    var r = Math.random();
    return {
      x: anywhere ? Math.random() * (W + 400) - 200 : -40 - Math.random() * 300,
      y: H * (0.16 + Math.random() * 0.72),
      len: 90 + Math.random() * 320,
      v: 1.6 + Math.random() * 5.5,
      w: 0.6 + Math.random() * 1.8,
      c: r < 0.18 ? 2 : (r < 0.6 ? 0 : 1),
      a: 0.12 + Math.random() * 0.3
    };
  }
  function resize() {
    var rect = cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.round(Math.max(14, Math.min(34, W / 32)));
    streaks = [];
    for (var s = 0; s < count; s++) streaks.push(make(true));
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    for (var s = 0; s < streaks.length; s++) {
      var st = streaks[s];
      var g = ctx.createLinearGradient(st.x - st.len, st.y, st.x, st.y);
      g.addColorStop(0, rgba(colors[st.c], 0));
      g.addColorStop(1, rgba(colors[st.c], st.a));
      ctx.strokeStyle = g;
      ctx.lineWidth = st.w;
      ctx.beginPath();
      ctx.moveTo(st.x - st.len, st.y);
      ctx.lineTo(st.x, st.y);
      ctx.stroke();
    }
  }
  function step(dt) {
    var k = dt / 16 / speed;
    for (var s = 0; s < streaks.length; s++) {
      var st = streaks[s];
      st.x += st.v * k;
      if (st.x - st.len > W) streaks[s] = make(false);
    }
  }

  var visible = true, last = performance.now();
  function loop(now) {
    var dt = Math.min(64, now - last);
    last = now;
    frames += (dt / 1000) * 25 / speed;
    showTimecode();
    if (ctx && visible) { step(dt); draw(); }
    requestAnimationFrame(loop);
  }

  if (ctx) {
    readColors();
    resize();
    draw();
    if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); draw(); }).observe(cv);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }).observe(cv);
    }
  }
  if (!reduce) requestAnimationFrame(loop);

  /* ---------- highlight the section being read ---------- */
  var navLinks = document.querySelectorAll(".site-nav a[href^='#']");
  var byId = {};
  for (var n = 0; n < navLinks.length; n++) byId[navLinks[n].getAttribute("href").slice(1)] = navLinks[n];
  if ("IntersectionObserver" in window) {
    var current = null;
    var spy = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e++) {
        if (!entries[e].isIntersecting) continue;
        var link = byId[entries[e].target.id];
        if (current) current.classList.remove("is-current");
        current = link || null;
        if (current) {
          current.classList.add("is-current");
          var nav = current.closest(".site-nav");
          if (nav && nav.scrollWidth > nav.clientWidth) {
            nav.scrollTo({ left: current.offsetLeft - 16, behavior: reduce ? "auto" : "smooth" });
          }
        }
      }
    }, { rootMargin: "-45% 0px -50% 0px" });
    var sections = document.querySelectorAll("main > section[id]");
    for (var m = 0; m < sections.length; m++) spy.observe(sections[m]);
  }
})();
