(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var hasIO = "IntersectionObserver" in window;
  var framed = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  var SITE = "https://jean-michel-tibi.vercel.app/";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function both(en, fr) { return '<span class="t" lang="en">' + en + '</span><span class="t" lang="fr">' + (fr || en) + "</span>"; }
  function pad(n, len) { n = String(n); while (n.length < (len || 2)) n = "0" + n; return n; }

  /* Device colours (the viewfinder, the map and the frame-rate monitors stay dark in both themes) */
  var colors = [], C = {};
  function readColors() {
    var cs = getComputedStyle(root);
    function v(name) { return cs.getPropertyValue(name).trim(); }
    C = { frame: v("--frame"), ink: v("--screen-ink"), rec: v("--rec"), muted: v("--screen-muted"), rule: v("--screen-rule"), screen: v("--screen") };
    colors = [C.frame, C.ink, C.rec];
  }
  function rgba(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a.toFixed(3) + ")";
  }
  readColors();

  /* ---------- language ---------- */
  var langButtons = $$("[data-set-lang]");
  var langHooks = [];
  function setLang(lang, save) {
    root.setAttribute("data-lang", lang);
    root.lang = lang;
    langButtons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-set-lang") === lang)); });
    if (save) { try { localStorage.setItem("jmt-lang", lang); } catch (e) {} }
    langHooks.forEach(function (fn) { fn(lang); });
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
  var frames = 0;           // source timecode, in frames at 25 fps
  var HOME_X = 0.74, HOME_Y = 0.46;
  var focus = { x: HOME_X, y: HOME_Y, tx: HOME_X, ty: HOME_Y, hover: false };
  var W = 0, H = 0, streaks = [], bokeh = [];

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
  function make(anywhere) {
    var r = Math.random();
    return {
      x: anywhere ? Math.random() * (W + 400) - 200 : -40 - Math.random() * 300,
      y: H * (0.12 + Math.random() * 0.78),
      len: 90 + Math.random() * 320,
      v: 1.6 + Math.random() * 5.5,
      w: 0.6 + Math.random() * 1.8,
      c: r < 0.18 ? 2 : (r < 0.6 ? 0 : 1),
      a: 0.18 + Math.random() * 0.34
    };
  }
  /* Background lights, far behind the focus plane: soft discs that drift slower than the
     trails and swell or shrink as the focus is pulled nearer or further (focus breathing). */
  var sprites = {};
  function disc(col) {
    if (sprites[col]) return sprites[col];
    var s = document.createElement("canvas");
    s.width = s.height = 128;
    var g = s.getContext("2d");
    var grd = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    grd.addColorStop(0, rgba(col, 0.5));
    grd.addColorStop(0.8, rgba(col, 0.68));
    grd.addColorStop(0.93, rgba(col, 0.95));
    grd.addColorStop(1, rgba(col, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(64, 64, 62, 0, 6.2832);
    g.fill();
    return (sprites[col] = s);
  }
  function makeBokeh(anywhere) {
    var r = Math.random();
    return {
      x: anywhere ? W * (0.3 + Math.random() * 0.8) : -80 - Math.random() * 120,
      y: H * (0.08 + Math.random() * 0.84),
      r: (12 + Math.random() * 46) * Math.max(0.6, H / 640),
      v: 0.12 + Math.random() * 0.45,
      a: (0.05 + Math.random() * 0.1) * (r < 0.1 ? 0.7 : 1),
      c: r < 0.1 ? 2 : (r < 0.68 ? 0 : 1)
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
    bokeh = [];
    for (var k = 0; k < Math.round(Math.max(7, Math.min(15, W / 80))); k++) bokeh.push(makeBokeh(true));
    placeBox();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    var breathe = 0.72 + focus.y * 0.7;
    for (var b = 0; b < bokeh.length; b++) {
      var bk = bokeh[b], rr = bk.r * breathe;
      ctx.globalAlpha = bk.a;
      ctx.drawImage(disc(colors[bk.c]), bk.x - rr, bk.y - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
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
    for (var b = 0; b < bokeh.length; b++) {
      var bk = bokeh[b];
      bk.x += bk.v * k;
      if (rate >= 0 && bk.x - bk.r * 1.5 > W) {
        bokeh[b] = makeBokeh(false);
      } else if (rate < 0 && bk.x + bk.r * 1.5 < 0) {
        var nb = makeBokeh(false);
        nb.x = W + nb.r * 1.5 + Math.random() * 80;
        bokeh[b] = nb;
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
    if (visible) {
      showTimecode();
      setRecLabel(now);
    }
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
     Shot map: an LED-style world feed with a Europe close-up. Pins jump
     to the stories; the line joins the moments in the order they happened.
     ===================================================================== */
  var GRIDS = {
    world: { b64: "AAAAAAABf+B//AAAAAAAAAAAAAAAAAAAAAAAA///////AAAABH4ADgAAAAAAAAAAACd//////4AB/gAAAAB8AAAAAAAAAAB/S/4////4AAZAAAMAAPwAAAAAAAAAD/nvwAf//4AAAAADwAf/4AHIAAAAAAH/3/8AP//wAAAAAODf///+DAAAgD8AD/53/wP//gAAA4AMH///////wBgf////79/wH//AAAf/i///////////+f//////1+H/ggAAf/////////////+///////n+H/A+AB+/////////////Cf/////708D8AIAH//////////////Af/////gHgB4AAAP7///////////v4AH4P///wH+AAAAGP5//////////+cAADwD///8H/AAAAOC//////////8A8AAEAB////v/gAAAfDv/////////4B4AAAAAf/////wAAAbv///////////AwAAAAAP/////wAAAH////////////AgAAAAAH////+4AAAD///////////9AAAAAAAD////+YAAAD///////////9AAAAAAAD////+AAAAB//7f///////5QAAAAAAH////gAAAAf9vwP///////zgAAAAAAD////gAAAAfi/////////+CAAAAAAAD///+AAAAAfALf///////8CAAAAAAAB///8AAAAAP/zf///////mOAAAAAAAB///8AAAAAH/AC///////H8AAAAAAAAf//4AAAAAf/zB///////hwAAAAAAAAP//wAAAAAf//////////hAAAAAAAAAP/owAAAAA/////f/////gAAAAAAAAAH/AwAAAAB///+/v/////AAAAAAAAAAD/AQAAAAD/////3/////gAAAAAAAAAAeA4AAAAD////f/D///+gAAAAAAAAAAfOOAAAAH//////B/z/wAAAAAAAgAAAf+F4AAAD////v+A/h+wgAAAAAAAAAAH8AAAAAD////38A/B/AgAAAAAAAAAAAfgAAAAH/////wAcAfggAAAAAAAAAAAHgAAAAH/////AAcAfgYAAAAAAAAAAABj+AAAD/////wAMATgYAAAAAAAAAAAA//AAAB/////wAKASAYAAAAAAAAAAAAX/gAAA/////gACAICcAAAAAAAAAAAAH/8AAAfP///AAAAsHAAAAAAAAAAAAAH/+AAAAB///AAAA8OAAAAAAAAAAAAAP/+AAAAD//8AAAAc+4AAAAAAAAAAAAf//wAAAD//4AAAAM/hgAAAAAAAAAAAf//+AAAB//wAAAAOdm/AAAAAAAAAAAf///AAAA//wAAAAGBgfuAAAAAAAAAAP///gAAA//wAAAAB4AHwAAAAAAAAAAP///gAAA//wAAAAAOoDYIAAAAAAAAAH///AAAAf/4AAAAAABBAAAAAAAAAAAH//+AAAA//4gAAAAAB7AAAAAAAAAAAD//+AAAA//5wAAAAAP7gAAAAAAAAAAB//+AAAA//zgAAAAAf/gABAAAAAAAAAf/8AAAA//DgAAAAA//wAAAAAAAAAAAf/8AAAA//DgAAAAD//4CAAAAAAAAAA//4AAAAf/HAAAAAH//8AAAAAAAAAAA//gAAAAf/DAAAAAP//+AAAAAAAAAAA//AAAAAf+AAAAAAH//+AAAAAAAAAAA//AAAAAP8AAAAAAH//+AAAAAAAAAAA/+AAAAAH4AAAAAAH//+AAAAAAAAAAA/8AAAAAHwAAAAAAH4f8AAAAAAAAAAA/4AAAAAGAAAAAAADAP8AIAAAAAAAAB/wAAAAAAAAAAAAAAAD4AEAAAAAAAAB/gAAAAAAAAAAAAAAABwAGAAAAAAAAB+AAAAAAAAAAAAAAAAAwAMAAAAAAAAB8AAAAAAAAAAAAAAAAAwAYAAAAAAAAB8AAAAAAAAAAAAAAAAAABwAAAAAAAAD4AAAAAAAAAAAAAAAAAAAgAAAAAAAAD4AAAAAAAAAACAAAAAAAAAAAAAAAAADwgAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", cols: 180, lon0: -180, lat0: 84, dLon: 2, dLat: 2, c0: 0, r0: 0, vc: 180, vr: 71 },
    europe: { b64: "A+AAA/oB/4PwABn9DP/B+AAcfA//4HgAHz4H//A+AA94A//4z4AD4AH//PfAAdAZ///48AD3f///+HwAf/////7+A///////P8P//////z/j//////4f4f/////4B/v//////Afz//////4HA///////ABP//////4AP///////AP///////4D////////AP///////4Af///////AB///////4AH//////+AA///////gAH//9///4AA///j//+AAH//8f//wFB//Hx//+D//8wfD//gf//AL4P/8D//4DPg//gf//AY/D/8D//wBD8f//f/4AYHz+Z7/+ADAdfj/f/xAYBh4f7/+ADAMPD/f/wAABg8P7/8AAAYPz/f/gAAeA8P7/wABhwDA/B+B/+EAIH4MB//gAAAsBg//+AAAAAP///wAAcAA==", cols: 57, lon0: -10, lat0: 58, dLon: 0.73314, dLat: 0.5, c0: 0, r0: 0, vc: 55, vr: 46 }
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
  function addPin(map, key, xy, label, at) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "pin";
    b.setAttribute("data-place", key);
    b.style.setProperty("--x", (xy[0] * 100).toFixed(2) + "%");
    b.style.setProperty("--y", (xy[1] * 100).toFixed(2) + "%");
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
        /* arc length by sampling, so each pin can land as the line reaches it */
        var len = 0, prevX = a[0], prevY = a[1];
        for (var t = 1; t <= 16; t++) {
          var u = t / 16;
          var qx = (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * cx + u * u * b[0];
          var qy = (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * cy + u * u * b[1];
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
      var inEU = function (lon, lat) {
        var xy = project(ge, lon, lat);
        return xy[0] > 0.02 && xy[0] < 0.98 && xy[1] > 0.02 && xy[1] < 0.98;
      };

      /* every circuit in the list beside the maps gets a ring, unless a story pin already
         marks it; circuits too close to tell apart at this scale share one ring */
      var circuits = $$(".clist li[data-c]").map(function (li) {
        var ll = li.getAttribute("data-ll").split(",");
        return { li: li, key: li.getAttribute("data-c"), near: li.getAttribute("data-near"), lon: +ll[0], lat: +ll[1] };
      });
      var rings = {};
      circuits.forEach(function (c) { if (!c.near && !PLACES[c.key]) rings[c.key] = { items: [c] }; });
      circuits.forEach(function (c) { if (c.near && rings[c.near]) rings[c.near].items.push(c); });
      Object.keys(rings).forEach(function (k) {
        var r = rings[k], n = r.items.length;
        r.lon = r.items.reduce(function (sum, c) { return sum + c.lon; }, 0) / n;
        r.lat = r.items.reduce(function (sum, c) { return sum + c.lat; }, 0) / n;
        r.eu = inEU(r.lon, r.lat);
      });

      var spots = "";
      Object.keys(PLACES).forEach(function (key) {
        var xy = project(gw, PLACES[key].lon, PLACES[key].lat);
        spots += '<circle class="spot" cx="' + (xy[0] * gw.vc).toFixed(2) + '" cy="' + (xy[1] * gw.vr).toFixed(2) + '" r="0.55"></circle>';
      });
      Object.keys(rings).forEach(function (k) {
        if (!rings[k].eu) return;
        var xy = project(gw, rings[k].lon, rings[k].lat);
        spots += '<circle class="spot is-ring" cx="' + (xy[0] * gw.vc).toFixed(2) + '" cy="' + (xy[1] * gw.vr).toFixed(2) + '" r="0.45"></circle>';
      });
      svg.innerHTML =
        '<rect class="eu-box" x="' + ex.toFixed(2) + '" y="' + ey.toFixed(2) + '" width="' + ew.toFixed(2) + '" height="' + eh.toFixed(2) + '"></rect>' +
        '<text class="eu-label" x="' + ex.toFixed(2) + '" y="' + (ey + eh + 2.2).toFixed(2) + '">Europe</text>' +
        '<path class="route" pathLength="1" d="' + d + '"></path>' + spots;
      worldMap.appendChild(svg);

      /* pins: Europe gets its own close-up, Sakhir and Yas Marina share one pin */
      var order = {};
      route.forEach(function (key, idx) { if (!(key in order)) order[key] = idx; });
      var at = function (key) { return lengths[order[key]] / total; };
      Object.keys(PLACES).forEach(function (key) {
        var pl = PLACES[key];
        if (pl.eu) addPin(euMap, key, project(GRIDS.europe, pl.lon, pl.lat), [placeLabel(pl, 0), placeLabel(pl, 1)], at(key));
        else if (!pl.gulf) addPin(worldMap, key, project(gw, pl.lon, pl.lat), [placeLabel(pl, 0), placeLabel(pl, 1)], at(key));
      });
      var sk = PLACES.sakhir, ym = PLACES.yasmarina;
      addPin(worldMap, "gulf", project(gw, (sk.lon + ym.lon) / 2, (sk.lat + ym.lat) / 2),
        ["Sakhir 2018 · 2020 / Yas Marina 2021", "Sakhir 2018 · 2020 / Yas Marina 2021"], Math.min(at("sakhir"), at("yasmarina")));

      /* the rings sit under the pins; each one and its line in the list light up together */
      var tipPart = function (c) { return $(".c-name", c.li).innerHTML + " · " + $(".c-yrs", c.li).innerHTML; };
      var lights = function (el, lis) {
        var on = function () { el.classList.add("is-hot"); lis.forEach(function (li) { li.classList.add("is-hot"); }); };
        var off = function () { el.classList.remove("is-hot"); lis.forEach(function (li) { li.classList.remove("is-hot"); }); };
        lis.forEach(function (li) { li.addEventListener("mouseenter", on); li.addEventListener("mouseleave", off); });
        el.addEventListener("mouseenter", on);
        el.addEventListener("mouseleave", off);
      };
      Object.keys(rings).forEach(function (k) {
        var r = rings[k], map = r.eu ? euMap : worldMap, xy = project(r.eu ? ge : gw, r.lon, r.lat);
        var el = document.createElement("span");
        el.className = "trk";
        el.setAttribute("aria-hidden", "true");
        el.style.setProperty("--x", (xy[0] * 100).toFixed(2) + "%");
        el.style.setProperty("--y", (xy[1] * 100).toFixed(2) + "%");
        el.style.setProperty("--xn", xy[0].toFixed(3));
        if (xy[0] < 0.22) el.classList.add("tip-start");
        else if (xy[0] > 0.78) el.classList.add("tip-end");
        if (xy[1] < 0.2) el.classList.add("tip-below");
        el.innerHTML = '<span class="tip">' + r.items.map(tipPart).join("<br>") + "</span>";
        map.appendChild(el);
        lights(el, r.items.map(function (c) { return c.li; }));
      });
      circuits.forEach(function (c) {
        var pl = PLACES[c.key], pin = pl ? pinsByPlace[pl.gulf ? "gulf" : c.key] : c.near === "gulf" ? pinsByPlace.gulf : null;
        if (pin) lights(pin, [c.li]);
      });

      /* the route's stroke is set in map units, so the dash that draws it stays exact */
      /* where two pins' tap areas would overlap at this size, ease them apart sideways */
      var spread = function (map) {
        var pins = $$(".pin", map), w = map.offsetWidth, h = map.offsetHeight;
        var at = pins.map(function (p) {
          p.style.removeProperty("--nx");
          return [parseFloat(p.style.getPropertyValue("--x")) / 100 * w, parseFloat(p.style.getPropertyValue("--y")) / 100 * h, 0];
        });
        for (var i = 0; i < pins.length; i++) {
          for (var j = i + 1; j < pins.length; j++) {
            var size = pins[i].offsetWidth, dx = at[j][0] + at[j][2] - at[i][0] - at[i][2], dy = at[j][1] - at[i][1];
            if (Math.abs(dx) < size && Math.abs(dy) < size) {
              var push = (size - Math.abs(dx)) / 2 + 0.5, dir = dx < 0 ? -1 : 1;
              at[i][2] -= push * dir;
              at[j][2] += push * dir;
            }
          }
        }
        pins.forEach(function (p, k) { if (at[k][2]) p.style.setProperty("--nx", at[k][2].toFixed(1) + "px"); });
      };
      var drawMaps = function () {
        drawDots(worldCanvas, GRIDS.world);
        drawDots(euCanvas, GRIDS.europe);
        spread(worldMap);
        spread(euMap);
        if (worldMap.offsetWidth) svg.style.setProperty("--map-scale", (worldMap.offsetWidth / gw.vc).toFixed(3));
      };
      root.classList.add("has-atlas");
      drawMaps();
      /* on a phone the world map scrolls sideways: open on the Americas, with Alaska at the edge */
      var scroller = worldMap.parentNode;
      if (scroller.scrollWidth > scroller.clientWidth + 4) scroller.scrollLeft = Math.round(worldMap.offsetWidth * 0.12);
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

      if (!reduce && hasIO) {
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
     Scroll reveals. Content that is still below the fold waits in its
     start pose and plays in once, as soon as it reaches the screen.
     Content already on screen at load is left exactly as it is. A fast
     scroll, or anything that arrives late or from above, gets a short
     fade instead, so the page never trails behind the reader.
     ===================================================================== */
  var scrollVel = 0, lastY = window.scrollY, lastT = performance.now();
  function velocity() { return performance.now() - lastT > 120 ? 0 : scrollVel; }
  var pending = [], reveal = null;

  /* Quotes resolve word by word. Screen readers get the sentence whole. */
  function splitWords(el) {
    var groups = $$(".t", el);
    if (!groups.length) groups = [el];
    groups.forEach(function (g) {
      var whole = g.textContent.replace(/\s+/g, " ").trim();
      var walker = document.createTreeWalker(g, NodeFilter.SHOW_TEXT, null), nodes = [], wi = 0;
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        if (!/\S/.test(node.nodeValue)) return;
        var frag = document.createDocumentFragment();
        node.nodeValue.split(/( +)/).forEach(function (part) {
          if (!part) return;
          if (/^ +$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var w = document.createElement("span");
          w.className = "w";
          w.setAttribute("aria-hidden", "true");
          w.style.setProperty("--wi", Math.min(wi++, 30));
          w.textContent = part;
          frag.appendChild(w);
        });
        node.parentNode.replaceChild(frag, node);
      });
      var sr = document.createElement("span");
      sr.className = "sr";
      sr.textContent = whole;
      g.insertBefore(sr, g.firstChild);
    });
  }

  var STILL = "#top, #memory";
  if (!reduce && hasIO) {
    var targets = [];
    var tag = function (sel, cls) {
      $$(sel).forEach(function (el) {
        if (el.closest(STILL)) return;
        if (cls) el.classList.add(cls);
        targets.push(el);
      });
    };
    tag(".section-head .eyebrow", "ty");
    tag(".section-head h2", "rf");
    tag([
      ".section-head .intro", ".prose > p", ".aside-quote", ".hazard", ".odds", ".spec > div",
      ".callsheet > li", ".shot", ".refusals > li", ".credits > li", ".chips > li", ".plain > li",
      ".facts > div", ".media > li", ".faq > div", ".sources li", ".book-body h3", ".links a", ".note",
      ".pipeline ol > li", ".feature", ".fps-stage", ".subhead", ".pull figcaption", ".atlas figcaption"
    ].join(","), "rv");
    tag(".report-row[role=listitem]", "wipe");
    $$(".pull blockquote, .trust blockquote").forEach(function (q) { if (!q.closest(STILL)) splitWords(q); });
    tag(".pull blockquote, .trust blockquote", "slowmo");
    tag(".cover", "");

    /* only content below the fold waits; what is already in view stays put */
    var fold = window.innerHeight;
    targets = targets.filter(function (el) {
      if (el.getBoundingClientRect().top < fold) return false;
      el.classList.add("rv-wait");
      return true;
    });
    /* page order, so a sweep ahead of a fast scroll can stop at the first item out of reach */
    pending = targets.slice().sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });

    /* heading frames hug the longest line of the heading, whatever the language */
    var frameHeads = function () {
      $$(".rf").forEach(function (h) {
        var range = document.createRange();
        range.selectNodeContents(h);
        var left = h.getBoundingClientRect().left, right = left;
        Array.prototype.forEach.call(range.getClientRects(), function (r) { if (r.width) right = Math.max(right, r.right); });
        h.style.setProperty("--fw", Math.round(right - left) + "px");
      });
    };
    frameHeads();
    langHooks.push(frameHeads);
    var headTimer = 0;
    window.addEventListener("resize", function () { clearTimeout(headTimer); headTimer = setTimeout(frameHeads, 150); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(frameHeads);

    reveal = new IntersectionObserver(function (entries) {
      var vh = window.innerHeight, fast = Math.abs(velocity()) > 2.2, n = 0;
      entries
        .filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left); })
        .forEach(function (e) {
          var el = e.target, r = e.boundingClientRect;
          reveal.unobserve(el);
          var quick = fast || r.top < vh * 0.7;
          el.style.setProperty("--d", quick ? "0ms" : Math.min(n++, 5) * 70 + "ms");
          if (quick) el.classList.add("rv-fast");
          el.classList.remove("rv-wait");
          el.classList.add("is-in");
        });
    }, { rootMargin: "0px 0px -2% 0px" });
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
     Why 200 frames a second. The same pass filmed by two cameras and
     played at 25p. Slowed eight times, the 25 fps clip must show every
     frame eight times over and the car jumps; the 200 fps clip has a new
     frame for every frame on air. In real time the two look the same.
     ===================================================================== */
  var fpsStage = $(".fps-stage");
  if (fpsStage) (function () {
    var screens = $$(".fps-screen", fpsStage).map(function (el) {
      var cvs = $("canvas", el);
      return { el: el, cvs: cvs, c: cvs && cvs.getContext ? cvs.getContext("2d") : null, fps: Number(el.getAttribute("data-fps")), label: $(".fps-frame", el), w: 0, h: 0, bg: null, shown: -2 };
    }).filter(function (s) { return s.c; });
    if (!screens.length) return;
    var note = $(".fps-note");
    /* seconds of real time for the car to cross the frame; at this speed each 25 fps frame
       turns the wheels about 196 degrees, so their five spokes seem to turn backwards */
    var PASS = 0.71;
    var slow = 8, running = false, t0 = 0;

    /* a side-on Formula 1 car in "car units": 0 at the rear, 100 at the nose, y up from the ground */
    function car(c, x0, ground, k, spin, alpha) {
      function X(u) { return x0 + u * k; }
      function Y(v) { return ground - v * k; }
      c.save();
      c.globalAlpha = alpha;
      c.fillStyle = C.ink;
      c.beginPath();
      c.moveTo(X(9), Y(3));
      c.lineTo(X(13), Y(2.2));
      c.lineTo(X(90), Y(2.2));
      c.quadraticCurveTo(X(96), Y(2.4), X(99), Y(4));
      c.lineTo(X(99.5), Y(4.9));
      c.quadraticCurveTo(X(92), Y(6.4), X(74), Y(8.4));
      c.lineTo(X(64), Y(9.8));
      c.lineTo(X(61), Y(10.6));
      c.lineTo(X(51), Y(10.6));
      c.lineTo(X(48), Y(12.4));
      c.lineTo(X(45.5), Y(15.6));
      c.lineTo(X(41), Y(15.9));
      c.quadraticCurveTo(X(30), Y(13.2), X(16), Y(9.6));
      c.lineTo(X(10), Y(8.4));
      c.closePath();
      c.fill();
      /* sidepod stripe */
      c.fillStyle = C.rec;
      c.fillRect(X(30), Y(6.4), 26 * k, 1.1 * k);
      /* halo and helmet */
      c.strokeStyle = C.ink;
      c.lineWidth = Math.max(1, 1.1 * k);
      c.beginPath();
      c.moveTo(X(50.5), Y(10.8));
      c.quadraticCurveTo(X(53), Y(14.6), X(58.5), Y(13.3));
      c.lineTo(X(61.5), Y(10.9));
      c.stroke();
      c.fillStyle = C.frame;
      c.beginPath();
      c.arc(X(54.6), Y(12.3), 2.3 * k, 0, 6.2832);
      c.fill();
      /* rear wing */
      c.fillStyle = C.ink;
      c.fillRect(X(1.5), Y(18.6), 8 * k, 10.6 * k);
      c.fillStyle = C.frame;
      c.fillRect(X(0.5), Y(18.8), 10 * k, 2 * k);
      c.fillStyle = C.ink;
      c.fillRect(X(8.5), Y(12), 3.5 * k, 4 * k);
      /* wheels: five spokes, so the 25 fps camera shows the wagon-wheel effect */
      [[19, 6.6], [83, 6.4]].forEach(function (wh) {
        var cx = X(wh[0]), cy = Y(wh[1]), r = wh[1] * k;
        c.fillStyle = "#1A1F22";
        c.beginPath();
        c.arc(cx, cy, r, 0, 6.2832);
        c.fill();
        c.strokeStyle = rgba(C.ink, 0.55);
        c.lineWidth = Math.max(1, 0.45 * k);
        c.stroke();
        c.fillStyle = "#394146";
        c.beginPath();
        c.arc(cx, cy, r * 0.6, 0, 6.2832);
        c.fill();
        c.strokeStyle = rgba(C.ink, 0.8);
        c.lineWidth = Math.max(1, 0.5 * k);
        c.beginPath();
        for (var s = 0; s < 5; s++) {
          var ang = spin * (6.4 / wh[1]) + s * 1.2566;
          c.moveTo(cx + Math.cos(ang) * r * 0.12, cy + Math.sin(ang) * r * 0.12);
          c.lineTo(cx + Math.cos(ang) * r * 0.56, cy + Math.sin(ang) * r * 0.56);
        }
        c.stroke();
      });
      /* front wing */
      c.fillStyle = C.ink;
      c.fillRect(X(86), Y(2.4), 14.5 * k, 1.6 * k);
      c.fillStyle = C.frame;
      c.fillRect(X(99), Y(4.6), 2 * k, 4 * k);
      c.restore();
    }
    function background(s) {
      var b = document.createElement("canvas");
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      b.width = Math.round(s.w * dpr);
      b.height = Math.round(s.h * dpr);
      var c = b.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      var ground = s.h * 0.8;
      var sky = c.createLinearGradient(0, 0, 0, ground);
      sky.addColorStop(0, C.screen);
      sky.addColorStop(1, rgba(C.ink, 0.05));
      c.fillStyle = sky;
      c.fillRect(0, 0, s.w, ground);
      /* stadium lights far behind, out of focus */
      for (var i = 0; i < 9; i++) {
        var lx = ((i * 0.37 + 0.11) % 1) * s.w, ly = s.h * (0.18 + ((i * 0.53) % 1) * 0.32), lr = s.h * (0.04 + ((i * 0.29) % 1) * 0.06);
        c.globalAlpha = 0.07 + ((i * 0.41) % 1) * 0.07;
        c.drawImage(disc(i % 3 ? C.frame : C.ink), lx - lr, ly - lr, lr * 2, lr * 2);
      }
      c.globalAlpha = 1;
      c.fillStyle = rgba(C.ink, 0.04);
      c.fillRect(0, ground, s.w, s.h - ground);
      /* kerb along the track edge */
      var kh = Math.max(3, s.h * 0.025), kw = s.w / 14;
      for (var k = 0; k < 15; k++) {
        c.fillStyle = k % 2 ? rgba(C.ink, 0.75) : rgba(C.rec, 0.85);
        c.fillRect(k * kw, ground, kw, kh);
      }
      c.fillStyle = rgba(C.ink, 0.12);
      c.fillRect(0, ground + kh + s.h * 0.06, s.w, 1);
      return b;
    }
    function size(s) {
      var r = s.cvs.getBoundingClientRect();
      if (!r.width) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.w = r.width; s.h = r.height;
      s.cvs.width = Math.round(r.width * dpr);
      s.cvs.height = Math.round(r.height * dpr);
      s.c.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.bg = background(s);
      s.shown = -2;
    }
    function geometry(s) {
      var L = s.w * 0.56;
      return { L: L, k: L / 100, ground: s.h * 0.8, from: -L * 1.05, travel: s.w + L * 2.1 };
    }
    function paint(s, t, ghosts) {
      var c = s.c, g = geometry(s);
      c.clearRect(0, 0, s.w, s.h);
      c.drawImage(s.bg, 0, 0, s.w, s.h);
      function at(tt, alpha) {
        var x = g.from + g.travel * (tt / PASS);
        car(c, x, g.ground, g.k, (x - g.from) / (6.4 * g.k), alpha);
      }
      if (ghosts) {
        ghosts.forEach(function (tt, i) { at(tt, i === ghosts.length - 1 ? 1 : 0.12 + 0.3 * (i / ghosts.length)); });
      } else if (t <= PASS) {
        at(t, 1);
      }
      /* the captured frames of this pass, as a strip of ticks; the one on air is lit */
      var n = Math.ceil(PASS * s.fps), x0 = 12, x1 = s.w - 12, y = s.h - 7;
      var cur = ghosts ? -1 : Math.floor(t * s.fps);
      c.fillStyle = rgba(C.ink, 0.22);
      for (var i = 0; i < n; i++) c.fillRect(Math.round(x0 + (x1 - x0) * (i / (n - 1))), y, 1, 4);
      if (cur >= 0 && cur < n) {
        c.fillStyle = C.rec;
        c.fillRect(Math.round(x0 + (x1 - x0) * (cur / (n - 1))) - 1, y - 2, 3, 6);
      }
    }
    function label(s, f) {
      if (!s.label) return;
      var n = Math.ceil(PASS * s.fps), len = String(n).length;
      s.label.textContent = f < 0 || f >= n ? "— / " + n : pad(f + 1, len) + " / " + n;
    }
    function render(now) {
      var k = Math.floor((now - t0) / 40);          // playback frames at 25p
      var tr = (k / 25) / slow;                      // the real time they show
      var cycle = PASS + 0.75 / slow;                // the pass, then a short gap
      var tp = tr % cycle;
      screens.forEach(function (s) {
        var f = tp > PASS ? -1 : Math.floor(tp * s.fps);
        if (f === s.shown) return;
        s.shown = f;
        paint(s, f < 0 ? PASS + 1 : f / s.fps);
        label(s, f);
      });
    }
    function still() {
      /* the same tenth of a second from each camera, as a multiple exposure */
      screens.forEach(function (s) {
        var ghosts = [];
        for (var f = Math.round(0.16 * s.fps); f / s.fps < 0.26 - 1e-9; f++) ghosts.push(f / s.fps);
        paint(s, 0, ghosts);
        if (s.label) s.label.innerHTML = both(ghosts.length + " frames", ghosts.length + " images");
      });
    }
    function sayNote() {
      if (!note) return;
      note.innerHTML = reduce
        ? both("The same tenth of a second from each camera: three frames at 25 fps, twenty at 200 fps.", "Le même dixième de seconde vu par chaque caméra&nbsp;: trois images à 25 i/s, vingt à 200 i/s.")
        : slow === 8
        ? both("Slowed 8×: the 25 fps clip shows each frame eight times and the car jumps. The 200 fps clip glides.", "Ralenti ×8&nbsp;: le plan à 25 i/s montre chaque image huit fois et la voiture saute. Celui à 200 i/s glisse.")
        : both("In real time you can’t tell the two cameras apart.", "En temps réel, impossible de distinguer les deux caméras.");
    }
    function loopFps(now) {
      if (!running) return;
      render(now);
      requestAnimationFrame(loopFps);
    }
    function start() {
      if (running || reduce) return;
      running = true;
      t0 = performance.now();
      requestAnimationFrame(loopFps);
    }
    function stop() { running = false; }

    screens.forEach(size);
    if (reduce) still(); else render(performance.now());
    sayNote();
    if ("ResizeObserver" in window) {
      var fro = new ResizeObserver(function () {
        screens.forEach(size);
        if (reduce) still(); else render(performance.now());
      });
      screens.forEach(function (s) { fro.observe(s.el); });
    }
    $$("[data-fps-speed]").forEach(function (btn, i, all) {
      btn.addEventListener("click", function () {
        slow = Number(btn.getAttribute("data-fps-speed"));
        all.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        t0 = performance.now();
        sayNote();
      });
    });
    if (hasIO && !reduce) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) start(); else stop();
      }).observe(fpsStage);
    } else if (!reduce) {
      start();
    }
  })();

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
     Scroll-linked, once per frame: reading progress, hero depth, career
     playhead. Layout is read first, then everything is written.
     ===================================================================== */
  var bar = $(".progress span");
  var report = $(".report");
  var playhead = $(".playhead");
  var rows = report ? $$(".report-row[role=listitem]", report) : [];
  var liveRow = null, ticking = false;

  function onScrollFrame() {
    ticking = false;
    var vh = window.innerHeight, y = window.scrollY, range = root.scrollHeight - vh;
    /* a fast scroll outruns any animation: show what is about to arrive before it does */
    var sweep = [], v = Math.abs(velocity());
    if (pending.length && v > 2.2) {
      var ahead = clamp(v * 350, 500, 2600), miss = 0;
      for (var j = 0; j < pending.length; j++) {
        var el = pending[j];
        if (!el.classList.contains("rv-wait")) continue;
        var er = el.getBoundingClientRect();
        if (er.top < vh + ahead && er.bottom > -ahead) { sweep.push(el); miss = 0; }
        else if (er.top >= vh + ahead && ++miss > 6) break;
      }
    }
    var hr = !reduce && vf ? vf.getBoundingClientRect() : null;
    var rr = report && playhead ? report.getBoundingClientRect() : null;
    var line = vh * 0.5, live = null, inReport = rr && rr.top < vh && rr.bottom > 0;
    if (inReport && line >= rr.top && line < rr.bottom) {
      for (var i = 0; i < rows.length; i++) {
        var b = rows[i].getBoundingClientRect();
        if (b.top <= line && b.bottom > line) { live = rows[i]; break; }
      }
    }

    if (sweep.length) {
      sweep.forEach(function (el) {
        if (reveal) reveal.unobserve(el);
        el.classList.remove("rv-wait");
        el.classList.add("is-in", "rv-instant");
      });
      pending = pending.filter(function (el) { return el.classList.contains("rv-wait"); });
    }
    if (bar) bar.style.transform = "scaleX(" + (range > 0 ? clamp(y / range, 0, 1) : 0).toFixed(4) + ")";
    if (hr && hr.bottom > 0) {
      var hp = clamp(-hr.top / hr.height, 0, 1);
      if (heroCopy) heroCopy.style.transform = hp ? "translate3d(0," + (hp * 36).toFixed(1) + "px,0)" : "";
      if (cv) cv.style.transform = hp ? "scale(" + (1 + hp * 0.12).toFixed(3) + ")" : "";
    }
    if (inReport) playhead.style.height = clamp(line - rr.top, 0, rr.height).toFixed(1) + "px";
    if (live !== liveRow) {
      if (liveRow) liveRow.classList.remove("is-live");
      if (live) live.classList.add("is-live");
      liveRow = live;
    }
  }
  function onScroll() {
    var now = performance.now(), y = window.scrollY, dt = now - lastT;
    /* after a pause there is no speed to go on, but a big jump is a fast scroll */
    if (dt > 0) scrollVel = dt > 120 ? (Math.abs(y - lastY) > 240 ? (y - lastY) / 16 : 0) : scrollVel * 0.5 + ((y - lastY) / dt) * 0.5;
    lastY = y;
    lastT = now;
    if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScrollFrame();

  /* =====================================================================
     Header: highlight the section being read, in the bar (with an
     underline that glides between links) and in the phone menu. The camera
     goes to standby in the two sections about what he will not film and
     who he lost.
     ===================================================================== */
  var navLinks = {}, menuLinks = {};
  $$(".site-nav a[href^='#']").forEach(function (a) { navLinks[a.getAttribute("href").slice(1)] = a; });
  $$("#menu a[data-target]").forEach(function (a) { menuLinks[a.getAttribute("data-target")] = a; });
  var navBox = $(".site-nav"), ink = null;
  if (navBox) {
    ink = document.createElement("span");
    ink.className = "nav-ink";
    ink.setAttribute("aria-hidden", "true");
    navBox.appendChild(ink);
    root.classList.add("has-ink");
  }
  var currentId = null;
  function placeInk() {
    if (!ink) return;
    var a = currentId && navLinks[currentId];
    if (!a || !a.offsetWidth) { ink.classList.remove("is-on"); return; }
    ink.style.setProperty("--ink-x", a.offsetLeft + "px");
    ink.style.setProperty("--ink-w", (a.offsetWidth / 100).toFixed(3));
    ink.classList.add("is-on");
  }
  function markCurrent(id) {
    currentId = id;
    $$(".site-nav a.is-current, #menu a.is-current").forEach(function (a) { a.classList.remove("is-current"); });
    var nav = navLinks[id], item = menuLinks[id];
    if (nav) {
      nav.classList.add("is-current");
      var navBar = nav.closest(".site-nav");
      if (navBar && navBar.scrollWidth > navBar.clientWidth) {
        navBar.scrollTo({ left: nav.offsetLeft - 16, behavior: reduce ? "auto" : "smooth" });
      }
    }
    placeInk();
    if (item) item.classList.add("is-current");
    if (menuNow) menuNow.innerHTML = item ? item.innerHTML : menuDefault;
  }
  langHooks.push(function () { placeInk(); });
  window.addEventListener("resize", placeInk);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeInk);
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
