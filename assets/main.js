(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var hasIO = "IntersectionObserver" in window;
  var framed = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  /* scroll timelines: reveals follow the scroll position itself where the browser supports it */
  var sd = !reduce && !!(window.CSS && CSS.supports && CSS.supports("animation-timeline: view()"));
  var SITE = "https://jean-michel-tibi.vercel.app/";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function both(en, fr) { return '<span class="t" lang="en">' + en + '</span><span class="t" lang="fr">' + (fr || en) + "</span>"; }

  var colors = [];
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
  readColors();
  if (sd) root.classList.add("sd");

  /* ---------- language ---------- */
  var langButtons = $$("[data-set-lang]");
  function setLang(lang, save) {
    root.setAttribute("data-lang", lang);
    root.lang = lang;
    langButtons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-set-lang") === lang)); });
    if (save) { try { localStorage.setItem("jmt-lang", lang); } catch (e) {} }
    labelLive();
    if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
  }
  langButtons.forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.getAttribute("data-set-lang"), true); });
  });

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
  var scrollVel = 0;        // smoothed page scroll speed in px/ms: the scroll wheel works as a jog wheel
  var frames = 0;           // source timecode, in frames at 25 fps
  var HOME_X = 0.74, HOME_Y = 0.46;
  var focus = { x: HOME_X, y: HOME_Y, tx: HOME_X, ty: HOME_Y, hover: false };
  var W = 0, H = 0, streaks = [];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function showTimecode() {
    var f = Math.floor(frames);
    tc.textContent = pad(1 + Math.floor(f / 90000) % 23) + ":" + pad(Math.floor(f / 1500) % 60) + ":" + pad(Math.floor(f / 25) % 60) + ":" + pad(f % 25);
  }
  function setRecLabel(now, rate) {
    var txt = now < rewindUntil || rate < -0.4 ? "◀◀ Rew" : rate > 1.6 ? "▶▶ FF" : speed === 0 ? "❚❚ Pause" : "Rec";
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
    W = vf.offsetWidth || rect.width; H = vf.offsetHeight || rect.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.round(Math.max(16, Math.min(36, W / 30)));
    streaks = [];
    for (var s = 0; s < count; s++) streaks.push(make(true));
    placeBox();
  }
  function draw(blur) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    var fy = focus.y * H, depth = H * 0.34, stretch = (speed === 1 ? 1.8 : 1) * (1 + blur);
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
    scrollVel *= Math.pow(0.86, dt / 16);
    var base = now < rewindUntil ? -3 : speed === 0 ? 0 : 1 / speed;
    var jog = clamp(scrollVel * 5, -8, 8);
    var rate = base + jog;
    frames = Math.max(0, frames + (dt / 1000) * 25 * rate);
    showTimecode();
    setRecLabel(now, rate);
    if (!focus.hover && base !== 0) {
      /* idle: the focus puller racks slowly between two depths */
      focus.ty = HOME_Y + Math.sin(now / 2800) * 0.14;
      focus.tx = HOME_X;
    }
    focus.y += (focus.ty - focus.y) * 0.07;
    focus.x += (focus.tx - focus.x) * 0.07;
    if (visible) {
      placeBox();
      showFocus();
      if (ctx) { step(dt, rate); draw(Math.min(Math.abs(jog) * 0.22, 1.4)); }
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
      setRecLabel(performance.now(), speed === 0 ? 0 : 1 / speed);
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
    resize();
    showFocus();
    draw(0);
    if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); draw(0); }).observe(vf);
    if (hasIO) new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }).observe(vf);
  }
  if (!reduce) {
    $$(".slate b").forEach(function (b, i) { scramble(b, 1150 + i * 80); });
    requestAnimationFrame(loop);
  }

  /* =====================================================================
     Shot map: an LED-style world feed with a Europe close-up. Pins jump
     to the stories; the line joins the moments in the order they happened.
     ===================================================================== */
  var GRIDS = {
    world: { b64: "AAAADoi3sAP//gAAAAAMAD///sAAAAgBgACfwz/AD/+gAAA4AEHf///+/8gBAP/7/nJdjwD/+AAAH/AA7f///////f4P//////h8H/gAAAf/6//f////////Mf/////9H4D8AeAA+ev///////////AP/////4A0B4AAAD5/////////////Af3////gHgA4AAAH5///////////LwAHgH///gHkAAAAAH4/////////+CIAABAB///4D+AAAAGCx/////////4A8AAIAAf///n/gAAAOCD/////////wA4AAAAAf///n/wAAAbP///////////AgAAAAAP/////wAAADf//////////9AAAAAAAF////0YAAAB///////////9AAAAAAAD////8EAAAB///////////5AAAAAAAD////2AAAAB/f5fP//////wAAAAAAAD////gAAAAfxnwPP//////jAAAAAAAD////AAAAAPCb3/n/////+CAAAAAAAD///8AAAAAfALf/n////+ECAAAAAAAB///8AAAAAGHQP/n/////mMAAAAAAAA///8AAAAAH+Ai///////E8AAAAAAAAf//wAAAAAP/AA///////BgAAAAAAAAP//gAAAAAf/73///////gAAAAAAAAAD/AQAAAAAf////f/////gAAAAAAAAAF+AQAAAAB///+/n/////AAAAAAAAAAC+AAAAAAB///+f0H////AAAAAAAAAAAeAwAAAAD////f/B///8gAAAAAAAAAAeGEAAAAH////v+B/z/AAAAAAAAAAAAPMAgAAAD////n+A/B+gAAAAAAAAAAAD8AAAAAD////n4AeB/AgAAAAAAAAAAAPAAAAAH////3gAcAfAgAAAAAAAAAAADAAAAAD////6AAcAfggAAAAAAAAAAABDwAAAD////8wAMATAIAAAAAAAAAAAAr/AAAB/////gAKASAAAAAAAAAAAAAAH/gAAA/////gACAAAIAAAAAAAAAAAAH/8AAAaH///AAAAsGAAAAAAAAAAAAAH/+AAAAB//+AAAAUOAAAAAAAAAAAAAP/+AAAAB//8AAAAYegAAAAAAAAAAAAP//gAAAD//4AAAAMeBgAAAAAAAAAAAP//8AAAB//wAAAAGdiuAAAAAAAAAAAf///AAAA//wAAAACAQHgAAAAAAAAAAP///gAAA//wAAAABwAHwgAAAAAAAAAH///AAAA//wAAAAACIDQIAAAAAAAAAH//+AAAAf/wAAAAAAAAAAAAAAAAAAAD//+AAAA//wgAAAAABxAAAAAAAAAAAD//+AAAA//wgAAAAAPxgBAAAAAAAAAA//8AAAA//jgAAAAAf5gAAAAAAAAAAAf/8AAAA//DgAAAAAf/gAAAAAAAAAAAf/8AAAAf/DAAAAAD//4CAAAAAAAAAAf/wAAAAf/DAAAAAH//4AAAAAAAAAAAf/AAAAAf+CAAAAAH//8AAAAAAAAAAAf/AAAAAP8AAAAAAH//+AAAAAAAAAAA/+AAAAAP8AAAAAAH//+AAAAAAAAAAA/+AAAAAH4AAAAAAD//+AAAAAAAAAAA/8AAAAAHwAAAAAADwf8AAAAAAAAAAA/gAAAAAAAAAAAAACAH4AIAAAAAAAAB/wAAAAAAAAAAAAAAAD4AEAAAAAAAAB+AAAAAAAAAAAAAAAAAAAGAAAAAAAAB6AAAAAAAAAAAAAAAAAwAMAAAAAAAAA8AAAAAAAAAAAAAAAAAQAYAAAAAAAAB4AAAAAAAAAAAAAAAAAAAwAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAACAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAA=", cols: 180, lon0: -180, lat0: 74, dLon: 2, dLat: 2, c0: 27, r0: 6, vc: 143, vr: 54 },
    europe: { b64: "AAHx/AXYABh/AT4AAB/IDeAAM+Az+AAI+A/cAAYfB/eAAZYA/fAAdAA/HAAaAT/HgAMh//DwAf3//HwH////H8P////P8P////f4f////D8/////PD/////QD/////AP/////A//////E//////P//////H//////B//////B//////A//////Af/////A///P//A///H//A//vD//A//Hh////GDw////AHwf///AR4H///AQ+D//8AAPH//4AYHn8/wAYHX4/xAYBDw/wAQBBw", cols: 42, lon0: -6, lat0: 59, dLon: 0.762127, dLat: 0.5, c0: 8, r0: 4, vc: 30, vr: 32 }
  };
  var PLACES = {
    spa: { lon: 5.971, lat: 50.437, eu: 1, name: ["Spa-Francorchamps"], when: ["2000"] },
    interlagos: { lon: -46.698, lat: -23.703, name: ["Interlagos"], when: ["2001 · 2005 · 2009 · 2012"] },
    melbourne: { lon: 144.968, lat: -37.85, name: ["Melbourne"], when: ["Early 2000s", "Début des années 2000"] },
    indianapolis: { lon: -86.235, lat: 39.795, name: ["Indianapolis"], when: ["2005"] },
    shanghai: { lon: 121.22, lat: 31.339, name: ["Shanghai"], when: ["2007"] },
    monza: { lon: 9.281, lat: 45.616, eu: 1, name: ["Monza"], when: ["2008"] },
    hungaroring: { lon: 19.249, lat: 47.579, eu: 1, name: ["Hungaroring"], when: ["2009"] },
    sakhir: { lon: 50.511, lat: 26.032, gulf: 1, name: ["Sakhir"], when: ["2018 · 2020"] },
    hockenheim: { lon: 8.566, lat: 49.328, eu: 1, name: ["Hockenheim"], when: ["2018"] },
    monaco: { lon: 7.421, lat: 43.734, eu: 1, name: ["Monaco"], when: ["2021"] },
    copenhagen: { lon: 12.572, lat: 55.703, eu: 1, name: ["Copenhagen", "Copenhague"], when: ["2021"] },
    jeddah: { lon: 39.104, lat: 21.632, name: ["Jeddah", "Djeddah"], when: ["2021"] },
    mexico: { lon: -99.091, lat: 19.404, name: ["Mexico City", "Mexico"], when: ["2021"] },
    yasmarina: { lon: 54.603, lat: 24.467, gulf: 1, name: ["Yas Marina"], when: ["2021"] }
  };
  function pick(arr, i) { return arr[i] || arr[0]; }
  function placeLabel(p, i) { return pick(p.name, i) + " · " + pick(p.when, i); }
  function project(g, lon, lat) {
    return [((lon - g.lon0) / g.dLon - g.c0) / g.vc, ((g.lat0 - lat) / g.dLat - g.r0) / g.vr];
  }
  function drawDots(canvas, g) {
    var w = canvas.offsetWidth, h = canvas.offsetHeight;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    var cw = w / g.vc, ch = h / g.vr, r = Math.max(0.7, Math.min(cw, ch) * 0.3);
    c.fillStyle = rgba(colors[1], 0.3);
    c.beginPath();
    for (var row = 0; row < g.vr; row++) {
      for (var col = 0; col < g.vc; col++) {
        var i = (row + g.r0) * g.cols + (col + g.c0);
        if (g.bits.charCodeAt(i >> 3) & (128 >> (i & 7))) {
          var x = (col + 0.5) * cw, y = (row + 0.5) * ch;
          c.moveTo(x + r, y);
          c.arc(x, y, r, 0, 6.2832);
        }
      }
    }
    c.fill();
  }
  var pinsByPlace = {};
  function addPin(map, key, xy, label, n, at) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "pin";
    b.setAttribute("data-place", key);
    b.style.setProperty("--x", (xy[0] * 100).toFixed(2) + "%");
    b.style.setProperty("--y", (xy[1] * 100).toFixed(2) + "%");
    b.style.setProperty("--n", n);
    b.style.setProperty("--at", at.toFixed(3));
    if (xy[0] < 0.22) b.classList.add("tip-start");
    else if (xy[0] > 0.78) b.classList.add("tip-end");
    if (xy[1] < 0.2) b.classList.add("tip-below");
    b.innerHTML = '<span class="tip">' + both(label[0], label[1]) + '</span><span class="sr">' + both(", go to the story", ", aller à l’histoire") + "</span>";
    b.addEventListener("click", function () { jumpTo(key); });
    map.appendChild(b);
    pinsByPlace[key] = b;
  }
  var flashTimer = 0;
  function cardsFor(key) {
    var ids = key === "gulf" ? ["sakhir", "yasmarina"] : [key];
    return $$(".shot[data-place]").filter(function (c) { return ids.indexOf(c.getAttribute("data-place")) > -1; });
  }
  function jumpTo(key) {
    var cards = cardsFor(key);
    if (!cards.length) return;
    cards[0].setAttribute("tabindex", "-1");
    cards[0].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    cards[0].focus({ preventScroll: true });
    clearTimeout(flashTimer);
    $$(".shot.is-flash").forEach(function (c) { c.classList.remove("is-flash"); });
    cards.forEach(function (c) { void c.offsetWidth; c.classList.add("is-flash"); });
    flashTimer = setTimeout(function () { cards.forEach(function (c) { c.classList.remove("is-flash"); }); }, 2800);
  }
  function setHot(key, on) {
    var pin = pinsByPlace[key];
    if (pin) pin.classList.toggle("is-hot", on);
  }

  var atlas = $(".atlas");
  var worldMap = $('.atlas-map[data-map="world"]');
  var euMap = $('.atlas-map[data-map="europe"]');
  if (atlas && worldMap && euMap && typeof atob === "function") {
    try {
      GRIDS.world.bits = atob(GRIDS.world.b64);
      GRIDS.europe.bits = atob(GRIDS.europe.b64);
      var worldCanvas = document.createElement("canvas");
      var euCanvas = document.createElement("canvas");
      worldCanvas.setAttribute("aria-hidden", "true");
      euCanvas.setAttribute("aria-hidden", "true");
      worldMap.appendChild(worldCanvas);
      euMap.appendChild(euCanvas);

      /* the route, in the order of the shot list, drawn as gently bowed arcs */
      var route = [];
      $$(".shot[data-place]").forEach(function (c) {
        var key = c.getAttribute("data-place");
        if (route[route.length - 1] !== key) route.push(key);
      });
      var gw = GRIDS.world, svgNS = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 " + gw.vc + " " + gw.vr);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      var pts = route.map(function (key) {
        var xy = project(gw, PLACES[key].lon, PLACES[key].lat);
        return [xy[0] * gw.vc, xy[1] * gw.vr];
      });
      var d = "M" + pts[0][0].toFixed(2) + " " + pts[0][1].toFixed(2);
      var lengths = [0];
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var px = -dy / dist, py = dx / dist;
        if (py > 0) { px = -px; py = -py; }
        var bow = Math.min(dist * 0.22, 14);
        var cx = (a[0] + b[0]) / 2 + px * bow, cy = (a[1] + b[1]) / 2 + py * bow;
        d += " Q" + cx.toFixed(2) + " " + cy.toFixed(2) + " " + b[0].toFixed(2) + " " + b[1].toFixed(2);
        /* arc length by sampling, so each pin can land exactly when the line reaches it */
        var len = 0, prevX = a[0], prevY = a[1];
        for (var t = 1; t <= 16; t++) {
          var u = t / 16, qx = (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * cx + u * u * b[0], qy = (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * cy + u * u * b[1];
          len += Math.sqrt((qx - prevX) * (qx - prevX) + (qy - prevY) * (qy - prevY));
          prevX = qx; prevY = qy;
        }
        lengths.push(lengths[i - 1] + len);
      }
      var total = lengths[lengths.length - 1] || 1;
      var ge = GRIDS.europe;
      var tl = project(gw, ge.lon0 + ge.c0 * ge.dLon, ge.lat0 - ge.r0 * ge.dLat);
      var br = project(gw, ge.lon0 + (ge.c0 + ge.vc) * ge.dLon, ge.lat0 - (ge.r0 + ge.vr) * ge.dLat);
      var ex = tl[0] * gw.vc, ey = tl[1] * gw.vr, ew = (br[0] - tl[0]) * gw.vc, eh = (br[1] - tl[1]) * gw.vr;
      var spots = "";
      Object.keys(PLACES).forEach(function (key) {
        var xy = project(gw, PLACES[key].lon, PLACES[key].lat);
        spots += '<circle class="spot" cx="' + (xy[0] * gw.vc).toFixed(2) + '" cy="' + (xy[1] * gw.vr).toFixed(2) + '" r="0.55"></circle>';
      });
      svg.innerHTML =
        '<rect class="eu-box" x="' + ex.toFixed(2) + '" y="' + ey.toFixed(2) + '" width="' + ew.toFixed(2) + '" height="' + eh.toFixed(2) + '"></rect>' +
        '<text class="eu-label" x="' + ex.toFixed(2) + '" y="' + (ey + eh + 2.2).toFixed(2) + '">Europe</text>' +
        '<path class="route" pathLength="1" d="' + d + '"></path>' + spots;
      worldMap.appendChild(svg);

      /* pins: Europe gets its own close-up, Sakhir and Yas Marina share one pin */
      var order = {};
      route.forEach(function (key, idx) { if (!(key in order)) order[key] = idx; });
      function at(key) { return lengths[order[key]] / total; }
      Object.keys(PLACES).forEach(function (key) {
        var pl = PLACES[key];
        if (pl.eu) addPin(euMap, key, project(GRIDS.europe, pl.lon, pl.lat), [placeLabel(pl, 0), placeLabel(pl, 1)], order[key], at(key));
        else if (!pl.gulf) addPin(worldMap, key, project(gw, pl.lon, pl.lat), [placeLabel(pl, 0), placeLabel(pl, 1)], order[key], at(key));
      });
      var sk = PLACES.sakhir, ym = PLACES.yasmarina;
      addPin(worldMap, "gulf", project(gw, (sk.lon + ym.lon) / 2, (sk.lat + ym.lat) / 2),
        ["Sakhir 2018 · 2020 / Yas Marina 2021", "Sakhir 2018 · 2020 / Yas Marina 2021"],
        Math.min(order.sakhir, order.yasmarina), Math.min(at("sakhir"), at("yasmarina")));

      var drawMaps = function () {
        drawDots(worldCanvas, GRIDS.world);
        drawDots(euCanvas, GRIDS.europe);
        if (worldMap.offsetWidth) svg.style.setProperty("--map-scale", (worldMap.offsetWidth / gw.vc).toFixed(3));
      };
      root.classList.add("has-atlas");
      drawMaps();
      if ("ResizeObserver" in window) {
        var ro = new ResizeObserver(drawMaps);
        ro.observe(worldMap);
        ro.observe(euMap);
      }

      /* a story card under the pointer lights up its pin */
      $$(".shot[data-place]").forEach(function (card) {
        var key = card.getAttribute("data-place");
        var pinKey = key === "sakhir" || key === "yasmarina" ? "gulf" : key;
        card.addEventListener("mouseenter", function () { setHot(pinKey, true); });
        card.addEventListener("mouseleave", function () { setHot(pinKey, false); });
      });

      /* without scroll timelines, the route draws on a timer once the map is in view */
      if (!reduce && !sd && hasIO) {
        var atlasIO = new IntersectionObserver(function (entries) {
          if (entries[0].isIntersecting) { atlas.classList.add("is-in"); atlasIO.disconnect(); }
        }, { threshold: 0.3 });
        atlasIO.observe(atlas);
      }
    } catch (e) {
      root.classList.remove("has-atlas");
    }
  }

  /* =====================================================================
     Scroll motion
     ===================================================================== */
  var STILL = "#top, #memory";
  function each(sel, fn) { $$(sel).forEach(function (el) { if (!el.closest(STILL)) fn(el); }); }
  var RISE = [
    ".section-head .intro", ".prose > p", ".aside-quote", ".hazard", ".odds", ".spec > div",
    ".callsheet > li", ".refusals > li", ".credits > li", ".chips > li", ".plain > li", ".facts > div",
    ".media > li", ".faq > div", ".sources li", ".book-body h3", ".links a", ".note", ".pipeline ol > li",
    ".feature", ".atlas figcaption", ".pull figcaption", ".replay", ".subhead"
  ].join(",");

  /* items side by side cascade left to right: number them by column */
  var ROWS = [".shots > .shot", ".media > li", ".faq > div", ".spec > div", ".facts > div", ".chips > li", ".pipeline ol > li"];
  function setCols() {
    ROWS.forEach(function (sel) {
      var top = null, col = 0;
      $$(sel).forEach(function (el) {
        var t = el.offsetTop;
        if (t !== top) { top = t; col = 0; } else { col++; }
        el.style.setProperty("--col", Math.min(col, 5));
      });
    });
  }

  if (sd) {
    each(".section-head .eyebrow", function (el) { el.classList.add("sd-type"); });
    each(".section-head h2", function (el) { el.classList.add("sd-rack"); });
    each(RISE, function (el) { el.classList.add("sd-rise"); });
    each(".shot", function (el) { el.classList.add("sd-card"); });
    each(".report-row[role=listitem]", function (el) { el.classList.add("sd-row"); });
    each(".cover", function (el) { el.classList.add("sd-book"); });
    each(".trust", function (el) { el.classList.add("sd-widen"); });
    each(".atlas-grid", function (el) { el.classList.add("sd-crt"); });
    if (vf) vf.classList.add("sd-hero");
    setCols();
    var colTimer = 0;
    window.addEventListener("resize", function () { clearTimeout(colTimer); colTimer = setTimeout(setCols, 150); });
  } else if (!reduce && hasIO) {
    /* Timed fallback. Content already on screen at load stays as it is; content below
       the fold waits in its start pose, so it plays in without a flash. */
    var targets = [];
    var tag = function (sel, cls) {
      each(sel, function (el) {
        if (cls) el.classList.add(cls);
        targets.push(el);
      });
    };
    tag(".section-head .eyebrow", "ty");
    tag(".section-head h2", "rf");
    tag(RISE + ",.shot,.report-row[role=listitem]", "rv");
    tag(".cover", "");
    var vh0 = window.innerHeight;
    targets.forEach(function (el) { if (el.getBoundingClientRect().top > vh0) el.classList.add("rv-wait"); });
    var reveal = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.setProperty("--i", Math.min(n++, 8));
        e.target.classList.remove("rv-wait");
        e.target.classList.add("is-in");
        reveal.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -4% 0px" });
    targets.forEach(function (el) { reveal.observe(el); });
  }

  /* Quotes light up word by word as you scroll through them */
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
      var words = $$(".w", g);
      g.style.setProperty("--n", words.length);
      words.forEach(function (w, i) { w.style.setProperty("--i", i); });
    });
  }
  var reads = [];
  if (!reduce) {
    each(".pull blockquote, .trust blockquote", function (bq) {
      var r = bq.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) return;
      splitWords(bq);
      bq.classList.add("sd-read");
      reads.push({ el: bq, p: -1 });
    });
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
     Video players. On the site the films play in place; inside a frame
     (where embeds are blocked) the same links open YouTube instead.
     ===================================================================== */
  $$(".player img").forEach(function (im) {
    im.addEventListener("error", function () { im.remove(); });
  });
  if (!framed) {
    $$(".player[data-yt]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        var label = $(".sr", a);
        var holder = document.createElement("div");
        holder.className = a.className + " is-playing";
        var frame = document.createElement("iframe");
        frame.src = "https://www.youtube-nocookie.com/embed/" + a.getAttribute("data-yt") + "?autoplay=1&rel=0&modestbranding=1&playsinline=1";
        frame.title = label ? label.innerText.trim() : "YouTube";
        frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        frame.setAttribute("allowfullscreen", "");
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        holder.appendChild(frame);
        a.parentNode.replaceChild(holder, a);
        frame.focus();
      });
    });
  }

  /* =====================================================================
     Share: the system share sheet where there is one, otherwise copy
     ===================================================================== */
  var shareBtn = $("#share"), shareStatus = $("#share-status");
  function say(en, fr) { if (shareStatus) shareStatus.innerHTML = both(en, fr); }
  function shareUrl() { return SITE + (root.getAttribute("data-lang") === "fr" ? "#fr" : ""); }
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var url = shareUrl();
      if (navigator.share && !framed) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
        return;
      }
      var fallback = function () { say("Copy this link: " + url, "Copiez ce lien : " + url); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { say("Link copied", "Lien copié"); }, fallback);
      } else {
        fallback();
      }
    });
  }

  /* =====================================================================
     Phone menu
     ===================================================================== */
  var menuBtn = $(".menu-btn"), menu = $("#menu");
  var menuNow = menuBtn ? $(".menu-now", menuBtn) : null;
  var menuDefault = menuNow ? menuNow.innerHTML : "";
  function setMenu(open, returnFocus) {
    if (!menu || !menuBtn) return;
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("menu-open", open);
    ["main", ".site-foot"].forEach(function (sel) { var el = $(sel); if (el) el.inert = open; });
    if (open) {
      var first = $("a.is-current", menu) || $("a", menu);
      if (first) first.focus();
    } else if (returnFocus) {
      menuBtn.focus();
    }
  }
  if (menu && menuBtn) {
    menuBtn.addEventListener("click", function () { setMenu(menu.hidden, false); });
    $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { setMenu(false, false); }); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) setMenu(false, true);
    });
    if (window.matchMedia) {
      var wide = window.matchMedia("(min-width: 901px)");
      var onWide = function (e) { if (e.matches && !menu.hidden) setMenu(false, false); };
      if (wide.addEventListener) wide.addEventListener("change", onWide);
    }
  }

  /* =====================================================================
     Scroll-linked, once per frame: reading progress with chapter marks,
     hero depth, career playhead and pinned year, the story card on air,
     quote read-along.
     All layout is read first, then everything is written.
     ===================================================================== */
  var bar = $(".progress span");
  var progress = $(".progress");
  var report = $(".report");
  var playhead = $(".playhead");
  var reportTc = $("#report-tc");
  var reportTcBox = reportTc ? reportTc.parentElement : null;
  var rows = report ? $$(".report-row[role=listitem]", report) : [];
  var shotGrid = $(".shots");
  var shotCards = shotGrid ? $$(".shot", shotGrid) : [];
  var airCard = null;
  var liveRow = null, lastLiveRow = null, ticking = false;
  function shown(el) {
    if (!el) return "";
    var t = $('.t[lang="' + (root.getAttribute("data-lang") === "fr" ? "fr" : "en") + '"]', el);
    return (t || el).textContent.replace(/\s+/g, " ").trim();
  }
  function labelLive() {
    if (!reportTc || !lastLiveRow) return;
    var where = shown($(".where", lastLiveRow));
    reportTc.textContent = shown($(".yr", lastLiveRow)) + (where ? " · " + where : "");
  }
  var lastY = window.scrollY, lastT = performance.now();

  var marks = {};
  function buildMarks() {
    if (!progress) return;
    $$("i", progress).forEach(function (m) { m.remove(); });
    marks = {};
    var range = root.scrollHeight - window.innerHeight;
    if (range <= 0) return;
    $$("main > section[id]").forEach(function (sec) {
      if (sec.id === "top") return;
      var y = sec.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.5;
      var m = document.createElement("i");
      m.style.left = (clamp(y / range, 0, 1) * 100).toFixed(2) + "%";
      progress.appendChild(m);
      marks[sec.id] = m;
    });
    if (currentId && marks[currentId]) marks[currentId].classList.add("is-current");
  }

  function onScrollFrame() {
    ticking = false;
    var vh = window.innerHeight, y = window.scrollY;
    var range = root.scrollHeight - vh;

    /* read */
    var hr = !reduce && vf ? vf.getBoundingClientRect() : null;
    var rr = report && playhead ? report.getBoundingClientRect() : null;
    var line = vh * 0.5, live = null;
    if (rr && rr.top < vh && rr.bottom > 0 && line >= rr.top && line < rr.bottom) {
      for (var r = 0; r < rows.length; r++) {
        var b = rows[r].getBoundingClientRect();
        if (b.top <= line && b.bottom > line) { live = rows[r]; break; }
      }
    }
    /* one story card is on air: the row crossing mid-screen, cut left to right as you scroll */
    var onAir = null, sg = shotGrid ? shotGrid.getBoundingClientRect() : null;
    if (sg && sg.top < line && sg.bottom > line) {
      var airRow = [];
      for (var c = 0; c < shotCards.length; c++) {
        var cb = shotCards[c].getBoundingClientRect();
        if (cb.top <= line && cb.bottom > line) airRow.push({ el: shotCards[c], top: cb.top, h: cb.height });
      }
      if (airRow.length) {
        var cut = Math.floor((line - airRow[0].top) / (airRow[0].h || 1) * airRow.length);
        onAir = airRow[clamp(cut, 0, airRow.length - 1)].el;
      }
    }
    var atEnd = range > 0 && y >= range - 2;
    var ps = reads.map(function (q) {
      if (atEnd) return 1;
      var qb = q.el.getBoundingClientRect();
      return qb.bottom < 0 ? 1 : clamp((vh * 0.92 - qb.top) / (vh * 0.42), 0, 1);
    });

    /* write */
    if (bar) bar.style.transform = "scaleX(" + (range > 0 ? clamp(y / range, 0, 1) : 0).toFixed(4) + ")";
    if (hr && hr.bottom > 0) {
      var hp = clamp(-hr.top / hr.height, 0, 1);
      if (heroCopy) heroCopy.style.transform = hp ? "translate3d(0," + (hp * 36).toFixed(1) + "px,0)" : "";
      if (cv) cv.style.transform = hp ? "scale(" + (1 + hp * 0.12).toFixed(3) + ")" : "";
    }
    if (rr && rr.top < vh && rr.bottom > 0) {
      playhead.style.height = clamp(line - rr.top, 0, rr.height).toFixed(1) + "px";
    }
    liveRow = live;
    if (liveRow !== lastLiveRow) {
      if (lastLiveRow) lastLiveRow.classList.remove("is-live");
      if (liveRow) liveRow.classList.add("is-live");
      lastLiveRow = liveRow;
      labelLive();
      if (reportTcBox) reportTcBox.classList.toggle("is-on", !!liveRow);
    }
    if (onAir !== airCard) {
      if (airCard) airCard.classList.remove("is-air");
      if (onAir) onAir.classList.add("is-air");
      airCard = onAir;
    }
    reads.forEach(function (q, k) {
      if (Math.abs(ps[k] - q.p) > 0.002) { q.p = ps[k]; q.el.style.setProperty("--p", q.p.toFixed(3)); }
    });
  }
  function onScroll() {
    var now = performance.now(), y = window.scrollY, dt = now - lastT;
    if (dt > 0 && dt < 200) scrollVel = scrollVel * 0.6 + ((y - lastY) / dt) * 0.4;
    lastY = y;
    lastT = now;
    if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScrollFrame();

  /* chapter marks follow the layout: rebuild when the page height changes */
  var markTimer = 0;
  function scheduleMarks() { clearTimeout(markTimer); markTimer = setTimeout(buildMarks, 120); }
  if ("ResizeObserver" in window) new ResizeObserver(scheduleMarks).observe($("main") || document.body);
  else window.addEventListener("resize", scheduleMarks);

  /* =====================================================================
     Header: highlight the section being read, in the bar, the phone menu
     and the chapter marks. The camera goes to standby in the two sections
     about what he will not film and who he lost.
     ===================================================================== */
  var navLinks = {}, menuLinks = {};
  $$(".site-nav a[href^='#']").forEach(function (a) { navLinks[a.getAttribute("href").slice(1)] = a; });
  $$("#menu a[data-target]").forEach(function (a) { menuLinks[a.getAttribute("data-target")] = a; });
  var currentId = null;
  function markCurrent(id) {
    currentId = id;
    $$(".site-nav a.is-current, #menu a.is-current, .progress i.is-current").forEach(function (a) { a.classList.remove("is-current"); });
    var nav = navLinks[id], item = menuLinks[id];
    if (nav) {
      nav.classList.add("is-current");
      var navBar = nav.closest(".site-nav");
      if (navBar && navBar.scrollWidth > navBar.clientWidth) {
        navBar.scrollTo({ left: nav.offsetLeft - 16, behavior: reduce ? "auto" : "smooth" });
      }
    }
    if (item) item.classList.add("is-current");
    if (id && marks[id]) marks[id].classList.add("is-current");
    if (menuNow) menuNow.innerHTML = item ? item.innerHTML : menuDefault;
  }
  if (hasIO) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id;
        root.setAttribute("data-tally", id === "trust" || id === "memory" ? "off" : "on");
        markCurrent(id === "top" ? null : id);
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main > section[id]").forEach(function (sec) { spy.observe(sec); });
  }

  setLang(root.getAttribute("data-lang") === "fr" ? "fr" : "en", false);
})();
