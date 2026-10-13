(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var hasIO = "IntersectionObserver" in window;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ---------- language ---------- */
  var langButtons = $$("[data-set-lang]");
  function setLang(lang, save) {
    root.setAttribute("data-lang", lang);
    root.lang = lang;
    langButtons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-set-lang") === lang)); });
    if (save) { try { localStorage.setItem("jmt-lang", lang); } catch (e) {} }
  }
  langButtons.forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.getAttribute("data-set-lang"), true); });
  });
  setLang(root.getAttribute("data-lang") === "fr" ? "fr" : "en", false);

  /* =====================================================================
     Viewfinder
     ===================================================================== */
  var vf = $(".viewfinder");
  var cv = $("#streaks");
  var ctx = cv && cv.getContext ? cv.getContext("2d") : null;
  var tc = $("#tc");
  var recLabel = $("#rec");
  var focusReadout = $("#focus-readout");
  var box = $(".crosshair");
  var heroCopy = $(".hero-copy");

  var speed = 8;            // 8 = slow motion (200 fps played at 25p), 1 = real time, 0 = paused
  var rewindUntil = 0;      // "Rewind to the top" plays the tape backwards for a moment
  var frames = 0;           // source timecode, in frames at 25 fps
  var HOME_X = 0.74, HOME_Y = 0.46;
  var focus = { x: HOME_X, y: HOME_Y, tx: HOME_X, ty: HOME_Y, hover: false };
  var W = 0, H = 0, streaks = [], colors = [];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function showTimecode() {
    var f = Math.floor(frames);
    tc.textContent = pad(1 + Math.floor(f / 90000) % 23) + ":" + pad(Math.floor(f / 1500) % 60) + ":" + pad(Math.floor(f / 25) % 60) + ":" + pad(f % 25);
  }
  function isRewinding(now) { return now < rewindUntil; }
  function setRecLabel(now) {
    var txt = isRewinding(now) ? "◀◀ Rew" : speed === 0 ? "❚❚ Pause" : "Rec";
    if (recLabel && recLabel.textContent !== txt) recLabel.textContent = txt;
  }

  /* Focus distance shown in the OSD: near at the bottom of the frame, infinity at the top */
  var lastReadout = "";
  function showFocus() {
    if (!focusReadout) return;
    var metres = 0.45 + Math.pow(1 - focus.y, 2.4) * 16;
    var txt = "Focus " + (metres >= 10 ? "∞" : metres.toFixed(1) + " m");
    if (txt !== lastReadout) { focusReadout.textContent = txt; lastReadout = txt; }
  }
  function placeBox() {
    if (!box) return;
    box.style.transform = "translate3d(" + ((focus.x - HOME_X) * W).toFixed(1) + "px," + ((focus.y - HOME_Y) * H).toFixed(1) + "px,0)";
  }
  function hunt() {
    if (!box || reduce) return;
    box.classList.remove("hunt");
    void box.offsetWidth;
    box.classList.add("hunt");
  }

  /* Light trails. Anything far from the focus plane is drawn soft and wide, with a
     bokeh disc at its head; trails sitting on the focus plane get red focus peaking. */
  function readColors() {
    var cs = getComputedStyle(root);
    colors = [cs.getPropertyValue("--frame").trim(), cs.getPropertyValue("--screen-ink").trim(), cs.getPropertyValue("--rec").trim()];
  }
  function rgba(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a.toFixed(3) + ")";
  }
  function make(anywhere) {
    var r = Math.random();
    return {
      x: anywhere ? Math.random() * (W + 400) - 200 : -40 - Math.random() * 300,
      y: H * (0.12 + Math.random() * 0.78),
      len: 90 + Math.random() * 320,
      v: 1.6 + Math.random() * 5.5,
      w: 0.6 + Math.random() * 1.8,
      c: r < 0.18 ? 2 : (r < 0.6 ? 0 : 1),
      a: 0.14 + Math.random() * 0.3
    };
  }
  function resize() {
    var rect = vf.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.round(Math.max(16, Math.min(36, W / 30)));
    streaks = [];
    for (var s = 0; s < count; s++) streaks.push(make(true));
    placeBox();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    var fy = focus.y * H, depth = H * 0.34, stretch = speed === 1 ? 1.8 : 1;
    for (var s = 0; s < streaks.length; s++) {
      var st = streaks[s], col = colors[st.c];
      var d = Math.min(1, Math.abs(st.y - fy) / depth);
      var len = st.len * stretch;
      var a = st.a * (1 - d * 0.45) / (1 + d);
      var g = ctx.createLinearGradient(st.x - len, st.y, st.x, st.y);
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(1, rgba(col, a));
      ctx.strokeStyle = g;
      ctx.lineWidth = st.w + d * 6;
      ctx.beginPath();
      ctx.moveTo(st.x - len, st.y);
      ctx.lineTo(st.x, st.y);
      ctx.stroke();
      if (d > 0.45) {
        ctx.beginPath();
        ctx.arc(st.x, st.y, 2 + d * 12, 0, 6.2832);
        ctx.fillStyle = rgba(col, st.a * 0.16 * d);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(col, st.a * 0.42 * d);
        ctx.stroke();
      } else if (d < 0.1) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(colors[2], 0.65 * (1 - d * 10));
        ctx.beginPath();
        ctx.moveTo(st.x - len * 0.55, st.y - st.w - 1.5);
        ctx.lineTo(st.x - 2, st.y - st.w - 1.5);
        ctx.stroke();
      }
    }
  }
  function step(dt, rate) {
    var k = (dt / 16) * rate;
    for (var s = 0; s < streaks.length; s++) {
      var st = streaks[s];
      st.x += st.v * k;
      if (rate >= 0 && st.x - st.len > W) {
        streaks[s] = make(false);
      } else if (rate < 0 && st.x < -20) {
        var n = make(false);
        n.x = W + n.len + Math.random() * 200;
        streaks[s] = n;
      }
    }
  }

  var visible = true, last = performance.now();
  function loop(now) {
    var dt = Math.min(64, now - last);
    last = now;
    var rewinding = isRewinding(now);
    var rate = rewinding ? -3 : speed === 0 ? 0 : 1 / speed;
    frames = Math.max(0, frames + (dt / 1000) * 25 * rate);
    showTimecode();
    setRecLabel(now);
    if (!focus.hover && rate !== 0) {
      /* idle: the focus puller racks slowly between two depths */
      focus.ty = HOME_Y + Math.sin(now / 2800) * 0.14;
      focus.tx = HOME_X;
    }
    focus.y += (focus.ty - focus.y) * 0.07;
    focus.x += (focus.tx - focus.x) * 0.07;
    if (visible) {
      placeBox();
      showFocus();
      if (ctx) { step(dt, rate); draw(); }
    }
    requestAnimationFrame(loop);
  }

  /* Playback buttons: 8x slow, real time, pause */
  var speedButtons = $$("[data-speed]");
  speedButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      speed = Number(btn.getAttribute("data-speed"));
      speedButtons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      if (vf) vf.classList.toggle("is-paused", speed === 0);
      setRecLabel(performance.now());
    });
  });

  /* "Rewind to the top": the tape runs backwards while the page scrolls up */
  $$('a[href="#top"]').forEach(function (a) {
    a.addEventListener("click", function () {
      if (!reduce && speed !== 0) rewindUntil = performance.now() + 2200;
    });
  });

  /* Point the focus box with the mouse or a tap */
  if (vf && !reduce) {
    var aim = function (e) {
      var r = vf.getBoundingClientRect();
      focus.tx = clamp((e.clientX - r.left) / r.width, 0.04, 0.96);
      focus.ty = clamp((e.clientY - r.top) / r.height, 0.06, 0.94);
    };
    vf.addEventListener("pointermove", function (e) {
      aim(e);
      if (!focus.hover) { focus.hover = true; hunt(); }
    });
    vf.addEventListener("pointerdown", function (e) { aim(e); focus.hover = true; hunt(); });
    vf.addEventListener("pointerleave", function () { focus.hover = false; });
  }

  /* Sensor grain, generated once */
  var grain = $(".grain");
  if (grain && !reduce) {
    try {
      var nc = document.createElement("canvas");
      nc.width = nc.height = 180;
      var ng = nc.getContext("2d"), img = ng.createImageData(180, 180), px = img.data;
      for (var p = 0; p < px.length; p += 4) {
        var v = (Math.random() * 255) | 0;
        px[p] = px[p + 1] = px[p + 2] = v;
        px[p + 3] = 255;
      }
      ng.putImageData(img, 0, 0);
      grain.style.backgroundImage = "url(" + nc.toDataURL("image/png") + ")";
    } catch (e) {}
  }

  /* The slate numbers spin like a frame counter as they come in, then settle */
  function scramble(el, delay) {
    var final = el.textContent;
    setTimeout(function () {
      var start = performance.now();
      function tick(now) {
        var t = (now - start) / 700;
        if (t >= 1) { el.textContent = final; return; }
        var out = "";
        for (var i = 0; i < final.length; i++) {
          out += t > (i + 1) / (final.length + 1) ? final.charAt(i) : String(Math.floor(Math.random() * 10));
        }
        el.textContent = out;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delay);
  }

  if (ctx && vf) {
    readColors();
    resize();
    showFocus();
    draw();
    if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); draw(); }).observe(vf);
    if (hasIO) new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }).observe(vf);
  }
  if (!reduce) {
    $$(".slate b").forEach(function (b, i) { scramble(b, 1150 + i * 80); });
    requestAnimationFrame(loop);
  }

  /* =====================================================================
     Scroll reveals. Elements keep their normal look until they reach the
     viewport, then play in once. Nothing is hidden at rest.
     ===================================================================== */
  function splitWords(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!/\S/.test(node.nodeValue)) return;
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/( +)/).forEach(function (part) {
        if (!part) return;
        if (/^ +$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var w = document.createElement("span");
        w.className = "w";
        w.textContent = part;
        frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
    var groups = $$(".t", el);
    if (!groups.length) groups = [el];
    groups.forEach(function (g) {
      $$(".w", g).forEach(function (w, i) { w.style.setProperty("--i", Math.min(i, 24)); });
    });
  }

  if (!reduce && hasIO) {
    var targets = [];
    var still = function (el) { return el.closest("#top, #memory"); };
    var tag = function (sel, cls) {
      $$(sel).forEach(function (el) {
        if (still(el)) return;
        if (cls) el.classList.add(cls);
        targets.push(el);
      });
    };
    tag(".section-head .eyebrow", "ty");
    tag(".section-head h2", "rf");
    tag([
      ".section-head .intro", ".prose > p", ".aside-quote", ".hazard", ".odds", ".spec > div",
      ".callsheet > li", ".report-row[role=listitem]", ".shot", ".refusals > li", ".credits > li",
      ".chips > li", ".plain > li", ".facts > div", ".media > li", ".faq > div", ".sources li",
      ".book-body h3", ".links a", ".note", ".pipeline ol > li"
    ].join(","), "rv");
    $$(".pull blockquote, .trust blockquote").forEach(splitWords);
    tag(".pull blockquote, .trust blockquote", "slowmo");
    tag(".cover", "");

    var reveal = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.setProperty("--i", Math.min(n++, 8));
        e.target.classList.add("is-in");
        reveal.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -6% 0px" });
    targets.forEach(function (el) { reveal.observe(el); });
  }

  /* =====================================================================
     Replay pipeline: a clip travels from the camera to the world feed
     ===================================================================== */
  var pipe = $(".pipeline");
  var pipeSteps = pipe ? $$(".pipeline ol > li") : [];
  var pipeTimers = [];
  function runPipe() {
    pipeTimers.forEach(clearTimeout);
    pipeTimers = [];
    pipe.classList.remove("is-done");
    pipeSteps.forEach(function (li) { li.classList.remove("is-on", "is-live"); });
    void pipe.offsetWidth;
    pipeSteps.forEach(function (li, i) {
      pipeTimers.push(setTimeout(function () {
        if (i > 0) pipeSteps[i - 1].classList.remove("is-live");
        li.classList.add("is-on", "is-live");
      }, 250 + i * 720));
    });
    pipeTimers.push(setTimeout(function () {
      pipeSteps[pipeSteps.length - 1].classList.remove("is-live");
      pipe.classList.add("is-done");
    }, 250 + pipeSteps.length * 720 + 200));
  }
  if (pipe && pipeSteps.length && !reduce) {
    var replay = $("#replay");
    if (replay) replay.addEventListener("click", runPipe);
    if (hasIO) {
      var pipeIO = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { runPipe(); pipeIO.disconnect(); }
      }, { threshold: 0.5 });
      pipeIO.observe($("ol", pipe));
    }
  }

  /* =====================================================================
     Book cover tilts toward the pointer
     ===================================================================== */
  var cover = $(".cover");
  if (cover && finePointer && !reduce) {
    var wrap = cover.parentElement;
    wrap.addEventListener("pointermove", function (e) {
      var r = cover.getBoundingClientRect();
      var x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
      cover.style.setProperty("--ry", ((x - 0.5) * 24).toFixed(2) + "deg");
      cover.style.setProperty("--rx", ((0.5 - y) * 16).toFixed(2) + "deg");
      cover.style.setProperty("--sx", (x * 100).toFixed(1) + "%");
      cover.style.setProperty("--sy", (y * 100).toFixed(1) + "%");
      cover.style.setProperty("--so", "1");
    });
    wrap.addEventListener("pointerleave", function () {
      cover.style.setProperty("--rx", "0deg");
      cover.style.setProperty("--ry", "0deg");
      cover.style.setProperty("--so", "0");
    });
  }

  /* =====================================================================
     Scroll-linked: reading progress, hero depth, career playhead
     ===================================================================== */
  var bar = $(".progress span");
  var report = $(".report");
  var playhead = $(".playhead");
  var rows = report ? $$(".report-row[role=listitem]", report) : [];
  var liveRow = null, ticking = false;

  function onScrollFrame() {
    ticking = false;
    var vh = window.innerHeight;
    var range = root.scrollHeight - vh;
    if (bar) bar.style.transform = "scaleX(" + (range > 0 ? clamp(window.scrollY / range, 0, 1) : 0).toFixed(4) + ")";

    if (!reduce && vf) {
      var hr = vf.getBoundingClientRect();
      if (hr.bottom > 0) {
        var hp = clamp(-hr.top / hr.height, 0, 1);
        if (heroCopy) heroCopy.style.transform = hp ? "translate3d(0," + (hp * 36).toFixed(1) + "px,0)" : "";
        if (cv) cv.style.transform = hp ? "scale(" + (1 + hp * 0.12).toFixed(3) + ")" : "";
      }
    }

    if (report && playhead) {
      var rr = report.getBoundingClientRect(), line = vh * 0.5;
      if (rr.top < vh && rr.bottom > 0) {
        playhead.style.height = clamp(line - rr.top, 0, rr.height).toFixed(1) + "px";
        var live = null;
        if (line >= rr.top && line < rr.bottom) {
          rows.forEach(function (row) {
            var b = row.getBoundingClientRect();
            if (b.top <= line && b.bottom > line) live = row;
          });
        }
        if (live !== liveRow) {
          if (liveRow) liveRow.classList.remove("is-live");
          if (live) live.classList.add("is-live");
          liveRow = live;
        }
      }
    }
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScrollFrame();

  /* =====================================================================
     Header: highlight the section being read. The camera goes to standby
     in the two sections about what he will not film and who he lost.
     ===================================================================== */
  var navLinks = $$(".site-nav a[href^='#']");
  var byId = {};
  navLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
  if (hasIO) {
    var current = null;
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id;
        root.setAttribute("data-tally", id === "trust" || id === "memory" ? "off" : "on");
        var link = byId[id] || null;
        if (current) current.classList.remove("is-current");
        current = link;
        if (current) {
          current.classList.add("is-current");
          var nav = current.closest(".site-nav");
          if (nav && nav.scrollWidth > nav.clientWidth) {
            nav.scrollTo({ left: current.offsetLeft - 16, behavior: reduce ? "auto" : "smooth" });
          }
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main > section[id]").forEach(function (sec) { spy.observe(sec); });
  }
})();
