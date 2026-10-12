// Sachin Arunkumar — personal site interactions
(function () {
  "use strict";

  /* ---------- nav scroll state ---------- */
  var nav = document.getElementById("nav");
  window.addEventListener("scroll", function () {
    nav.classList.toggle("scrolled", window.scrollY > 40);
  }, { passive: true });

  /* ---------- scroll reveals ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach(function (el, i) {
    el.style.transitionDelay = Math.min(i % 4, 3) * 70 + "ms";
    io.observe(el);
  });

  /* ---------- animated counters ---------- */
  var cio = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      cio.unobserve(e.target);
      var el = e.target;
      var target = parseInt(el.dataset.count, 10);
      var suffix = el.dataset.suffix || "";
      var dur = 1600, t0 = null;
      function fmt(n) { return n >= 1000 ? n.toLocaleString("en-US") : String(n); }
      function tick(t) {
        if (!t0) t0 = t;
        var p = Math.min((t - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(target * eased)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll(".stat-num").forEach(function (el) { cio.observe(el); });

  /* ---------- skills marquee ---------- */
  var skills = ["Catastrophe Modeling", "RMS", "AIR", "Verisk Touchstone", "Python", "PyTorch", "Palantir Foundry",
    "Machine Learning", "Snowflake", "Agile Product", "GenAI Solutioning", "Model Validation"];
  var track = document.getElementById("marqueeTrack");
  var half = skills.map(function (s) { return "<span>" + s + "<b>✦</b></span>"; }).join("");
  track.innerHTML = half + half; // duplicate for seamless loop

  /* ---------- hurricane particle canvas ---------- */
  var canvas = document.getElementById("storm");
  var ctx = canvas.getContext("2d");
  var W, H, cx, cy, parts = [], mouse = { x: -9999, y: -9999 };
  var N = window.innerWidth < 700 ? 220 : 420;

  function resize() {
    W = canvas.width = canvas.offsetWidth * Math.min(window.devicePixelRatio || 1, 2);
    H = canvas.height = canvas.offsetHeight * Math.min(window.devicePixelRatio || 1, 2);
    cx = W * 0.72; cy = H * 0.46;
  }
  resize();
  window.addEventListener("resize", resize);
  canvas.parentElement.addEventListener("mousemove", function (e) {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    mouse.x = (e.clientX - r.left) * dpr; mouse.y = (e.clientY - r.top) * dpr;
  });
  canvas.parentElement.addEventListener("mouseleave", function () { mouse.x = -9999; mouse.y = -9999; });

  function spawn(init) {
    var a = Math.random() * Math.PI * 2;
    var r = init ? Math.random() * Math.max(W, H) * 0.7 : Math.max(W, H) * 0.62;
    return {
      a: a, r: r,
      speed: 0.0016 + Math.random() * 0.004,
      size: 0.6 + Math.random() * 2.1,
      drift: (Math.random() - 0.5) * 0.35,
      gold: Math.random() < 0.22,
      alpha: 0.25 + Math.random() * 0.55
    };
  }
  for (var i = 0; i < N; i++) parts.push(spawn(true));

  var t = 0;
  function frame() {
    t += 0.016;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      // spiral inward, faster near center; slow breathing of the whole system
      var wobble = 1 + Math.sin(t * 0.6 + p.a) * 0.04;
      p.a += p.speed * (1.6 - p.r / (Math.max(W, H) * 0.7)) * 3;
      p.r -= (0.35 + p.drift * 0.2) * (Math.min(window.devicePixelRatio || 1, 2));
      if (p.r < 14) { parts[i] = spawn(false); continue; }
      var x = cx + Math.cos(p.a) * p.r * wobble;
      var y = cy + Math.sin(p.a) * p.r * 0.62 * wobble;
      // mouse repulsion
      var dx = x - mouse.x, dy = y - mouse.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < 12000) { var d = Math.sqrt(d2) || 1; x += (dx / d) * 26; y += (dy / d) * 26; }
      var fade = Math.min(1, p.r / 120); // fade near the eye
      ctx.beginPath();
      ctx.arc(x, y, p.size * (Math.min(window.devicePixelRatio || 1, 2)), 0, 6.2832);
      ctx.fillStyle = p.gold
        ? "rgba(242,178,62," + (p.alpha * fade).toFixed(3) + ")"
        : "rgba(150,175,210," + (p.alpha * fade * 0.8).toFixed(3) + ")";
      ctx.fill();
    }
    // glowing eye
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
    g.addColorStop(0, "rgba(242,178,62,0.20)");
    g.addColorStop(1, "rgba(242,178,62,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - 90, cy - 90, 180, 180);
    requestAnimationFrame(frame);
  }
  frame();
})();
