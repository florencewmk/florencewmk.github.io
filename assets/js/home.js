/* Florence Wong – homepage interactions
   1. Shine: a soft specular highlight follows the cursor over glass surfaces and rows
   2. Hero: a wireframe liquid rocket engine drawn in 3D on a canvas, with a WebGL flame.
      It assembles from an exploded view on load, then ignites; hovering the engine (tapping
      on touch screens) separates its assemblies again. The flame throttles up while the
      cursor moves.
   3. Scroll reveal
   4. Section tone (FW mark colour follows the section in view)
   No dependencies. */
(function () {
	"use strict";

	var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	/* ---------- 1. Shine ---------- */
	var shineTarget = null, sx = 0, sy = 0, shinePending = false;
	function applyShine() {
		shinePending = false;
		if (!shineTarget) return;
		var r = shineTarget.getBoundingClientRect();
		shineTarget.style.setProperty("--mx", (sx - r.left) + "px");
		shineTarget.style.setProperty("--my", (sy - r.top) + "px");
	}
	document.addEventListener("pointermove", function (e) {
		sx = e.clientX; sy = e.clientY;
		shineTarget = e.target.closest ? e.target.closest(".shine") : null;
		if (shineTarget && !shinePending) { shinePending = true; requestAnimationFrame(applyShine); }
	}, { passive: true });

	/* ---------- 4. Section tone: the FW mark changes colour with the section in view,
	              and the matching nav link is marked active ---------- */
	(function () {
		var root = document.documentElement;
		var secs = Array.prototype.slice.call(document.querySelectorAll("[data-tone]"));
		if (!secs.length) return;
		var links = Array.prototype.slice.call(document.querySelectorAll(".nav a[href^='#']"));
		var current = null, pending = false;
		function update() {
			pending = false;
			var mid = window.innerHeight * 0.45, pick = secs[0];
			for (var i = 0; i < secs.length; i++) { if (secs[i].getBoundingClientRect().top <= mid) pick = secs[i]; }
			if (pick === current) return;
			current = pick;
			root.style.setProperty("--fw", pick.getAttribute("data-tone"));
			links.forEach(function (a) { a.classList.toggle("is-active", !!pick.id && a.getAttribute("href") === "#" + pick.id); });
		}
		window.addEventListener("scroll", function () { if (!pending) { pending = true; requestAnimationFrame(update); } }, { passive: true });
		window.addEventListener("resize", update);
		update();
	})();

	/* ---------- 3. Scroll reveal ---------- */
	if ("IntersectionObserver" in window && !reduceMotion) {
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (en) {
				if (en.isIntersecting) { en.target.classList.add("in"); }   // replays each time it scrolls into view
				else { en.target.classList.remove("in"); en.target.classList.toggle("above", en.boundingClientRect.top < 0); }
			});
		}, { rootMargin: "0px 0px -6% 0px" });
		var groups = document.querySelectorAll(".section-head, .focus, .rows, .feature, .photo, .contact, .grid-cards, .figure, .prose, .photo-full");
		Array.prototype.forEach.call(groups, function (g) {
			var kids = g.matches(".focus, .rows, .feature, .grid-cards") ? g.children : [g];
			Array.prototype.forEach.call(kids, function (el, i) {
				el.classList.add("reveal");
				el.style.transitionDelay = Math.min(i, 6) * 70 + "ms";
				io.observe(el);
			});
		});
	}


	/* ---------- 2. Rocket engine ----------
	   Wireframe of a generic liquid-propellant thrust chamber: gimbal bearing, injector with
	   propellant dome, cylindrical combustion chamber, rounded throat and a Rao 80 % bell nozzle
	   (30° initial and 10° exit wall angle, expansion ratio 16, contraction ratio ~3.4) with
	   regenerative-cooling tubes. Feed system (pumps, ducts) deliberately left out.
	   The flame is a WebGL shader (2D gradient fallback). */
	var hero = document.querySelector(".hero");
	var canvas = document.querySelector(".engine");
	var thrustEl = document.querySelector(".thrust");
	var gimbalEl = document.querySelector(".gimbal");
	if (!hero || !canvas || !canvas.getContext) return;
	var ctx = canvas.getContext("2d");

	// --- geometry (engine units, throat radius 0.12). Axis is +y (down the screen), y = 0 is the injector face.
	var RT = 0.12, RC = 0.22, RE = 0.48;                 // throat, chamber, exit radius (Ae/At = 16)
	var Y_CYL = 0.34, Y_T = 0.52;                       // end of cylindrical chamber, throat
	var Y_E = Y_T + 0.8 * (RE - RT) / Math.tan(15 * Math.PI / 180); // 80 % bell length
	var PIVOT_Y = -0.15;                                // gimbal bearing on top of the dome

	var segs = []; // [x1,y1,z1, x2,y2,z2, weight, part]
	var curPart = 2;
	function seg(a, b, w) { segs.push([a[0], a[1], a[2], b[0], b[1], b[2], w || 1, curPart]); }
	function ring(r, y, n, w, ox, oz) {
		ox = ox || 0; oz = oz || 0;
		for (var i = 0; i < n; i++) {
			var a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
			seg([ox + r * Math.cos(a0), y, oz + r * Math.sin(a0)], [ox + r * Math.cos(a1), y, oz + r * Math.sin(a1)], w);
		}
	}
	// a pipe along a path: centre-line rings plus four longitudinal lines
	function tube(path, r, w) {
		for (var k = 0; k < 4; k++) {
			var ang = k / 4 * Math.PI * 2, prev = null;
			for (var i = 0; i < path.length; i++) {
				var p = path[i], q = [p[0] + r * Math.cos(ang), p[1], p[2] + r * Math.sin(ang)];
				if (prev) seg(prev, q, w * 0.6);
				prev = q;
			}
		}
		ring(r, path[0][1], 10, w * 0.7, path[0][0], path[0][2]);                     // flanges at the ends only
		ring(r, path[path.length - 1][1], 10, w * 0.7, path[path.length - 1][0], path[path.length - 1][2]);
	}
	function bez(p0, p1, p2, t) { var u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2]]; }
	function curve(p0, p1, p2, n) { var out = []; for (var i = 0; i <= n; i++) out.push(bez(p0, p1, p2, i / n)); return out; }

	(function build() {
		/* thrust chamber contour as (y, r) points */
		var prof = [], i, y;
		for (y = 0; y <= Y_CYL + 1e-6; y += Y_CYL / 4) prof.push([y, RC]);
		for (i = 1; i <= 6; i++) {                           // convergent section, rounded into the throat
			var t = i / 6; prof.push([Y_CYL + (Y_T - Y_CYL) * t, RC - (RC - RT) * (0.5 - 0.5 * Math.cos(t * Math.PI))]);
		}
		var a = Math.tan(30 * Math.PI / 180), b = Math.tan(10 * Math.PI / 180);
		var yq = (RE - RT - b * Y_E + a * Y_T) / (a - b), rq = RT + a * (yq - Y_T);
		for (i = 1; i <= 14; i++) {                          // Rao bell: quadratic Bézier between the wall tangents
			var s = i / 14, u = 1 - s;
			prof.push([u * u * Y_T + 2 * u * s * yq + s * s * Y_E, u * u * RT + 2 * u * s * rq + s * s * RE]);
		}

		curPart = 2;                                         // thrust chamber + nozzle (one piece)
		prof.forEach(function (p, k) {
			var edge = k === 0 || k === prof.length - 1 || Math.abs(p[0] - Y_T) < 1e-6;
			ring(p[1], p[0], 72, edge ? 1.15 : 0.45);
		});
		var M = 48;                                          // regenerative-cooling tubes
		for (var m = 0; m < M; m++) {
			var ang = m / M * Math.PI * 2, w = m % 4 === 0 ? 0.7 : 0.32;
			for (var k = 1; k < prof.length; k++) {
				var p0 = prof[k - 1], p1 = prof[k];
				seg([p0[1] * Math.cos(ang), p0[0], p0[1] * Math.sin(ang)], [p1[1] * Math.cos(ang), p1[0], p1[1] * Math.sin(ang)], w);
			}
		}
		// forward manifold under the injector
		ring(RC + 0.03, 0.04, 60, 0.9); ring(RC + 0.03, 0.09, 60, 0.5);

		curPart = 1;                                         // injector: face flange + LOX dome
		ring(RC + 0.04, 0, 60, 1.1); ring(RC + 0.04, -0.02, 60, 0.7);
		var DH = 0.1, dome = [];
		for (i = 0; i <= 5; i++) { var rr = RC * Math.cos(i / 5 * Math.PI / 2), yy = -0.02 - DH * Math.sin(i / 5 * Math.PI / 2); dome.push([yy, rr]); if (rr > 0.01) ring(rr, yy, 48, i === 0 ? 0.9 : 0.45); }
		for (m = 0; m < 16; m++) {
			var da = m / 16 * Math.PI * 2;
			for (k = 1; k < dome.length; k++) seg([dome[k - 1][1] * Math.cos(da), dome[k - 1][0], dome[k - 1][1] * Math.sin(da)], [dome[k][1] * Math.cos(da), dome[k][0], dome[k][1] * Math.sin(da)], 0.4);
		}

		curPart = 0;                                         // gimbal bearing block
		ring(0.05, -0.12, 20, 1); ring(0.05, PIVOT_Y - 0.03, 20, 1);
		for (m = 0; m < 6; m++) { var ga = m / 6 * Math.PI * 2; seg([0.05 * Math.cos(ga), -0.12, 0.05 * Math.sin(ga)], [0.05 * Math.cos(ga), PIVOT_Y - 0.03, 0.05 * Math.sin(ga)], 0.6); }
		seg([-0.09, PIVOT_Y, 0], [0.09, PIVOT_Y, 0], 1); seg([0, PIVOT_Y, -0.09], [0, PIVOT_Y, 0.09], 1);

	})();

	// exploded view: separate the real assemblies (no labels)
	var OFF = [
		[0, -0.42, 0],     // 0 gimbal bearing
		[0, -0.24, 0],     // 1 injector + dome
		[0, 0.1, 0]        // 2 thrust chamber + nozzle
	];

	// --- state
	var W = 0, H = 0, DPR = 1, cx = 0, top = 0, scale = 1, mobile = false;
	var spin = -0.1, view = 0.3;
	var gx = 0, gz = 0, tgx = 0, tgz = 0;
	var throttle = 0.6, tgtThrottle = 0.6;
	var px = -9999, py = -9999, lpx = -9999, lpy = -9999, lastMove = -1e9;
	var visible = true, raf = 0, lastT = 0, time = 0;
	var explode = reduceMotion ? 0 : 1, hoverEngine = false, tapExploded = false, assembledAt = 0;
	var hudMode = document.querySelector(".hud-bl");

	var wireRGB = "245,245,247";
	var flameRGB = [[0.71, 0.6, 0.85], [0.39, 0.87, 1], [0.96, 0.98, 1]];
	function cssRGB(name, fallback) {
		var v = (getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim();
		var m = v.split(",").map(Number);
		return m.length === 3 && m.every(function (n) { return !isNaN(n); }) ? m.map(function (n) { return n / 255; }) : fallback;
	}
	/* ---------- hero background: travelling through deep space ----------
	   A dense 3D field of small stars that the camera flies through, upward, like the
	   rocket climbing. Near stars are bigger, brighter and leave short motion streaks; a few
	   warm and blue stars glow. Stars are drawn in batches (one stroke per brightness level),
	   so the whole field costs a handful of draw calls per frame. */
	var sky = document.createElement("canvas");
	sky.className = "sky"; sky.setAttribute("aria-hidden", "true");
	canvas.parentNode.insertBefore(sky, canvas.parentNode.firstChild);
	var sctx = sky.getContext("2d", { alpha: false }), SD = 1, stars = [], fly = 0.5;
	var LEVELS = 8, skyPaths = [], glowSprite = {};
	var DEPTH = 6;                                                  // field depth in camera units
	function makeGlow(rgb) {                                       // pre-rendered soft glow, drawn as an image
		var g = document.createElement("canvas"); g.width = g.height = 64;
		var x = g.getContext("2d"), rg = x.createRadialGradient(32, 32, 0, 32, 32, 32);
		rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.18, "rgba(" + rgb + ",0.75)");
		rg.addColorStop(0.5, "rgba(" + rgb + ",0.18)"); rg.addColorStop(1, "rgba(" + rgb + ",0)");
		x.fillStyle = rg; x.fillRect(0, 0, 64, 64); return g;
	}
	glowSprite.gold = makeGlow("255,176,90"); glowSprite.blue = makeGlow("110,140,255"); glowSprite.lilac = makeGlow("200,170,255");
	function newStar(z) {
		var r = Math.random();
		return {
			x: (Math.random() - 0.5) * 9, y: (Math.random() - 0.5) * 9, z: z,
			b: 0.35 + Math.random() * 0.65,                              // intrinsic brightness
			glow: r < 0.006 ? "gold" : r < 0.011 ? "blue" : r < 0.014 ? "lilac" : null
		};
	}
	function skyResize() {
		SD = 1;
		sky.width = Math.round(W * SD); sky.height = Math.round(H * SD);
		var n = Math.round(Math.min(1100, W * H / 1000));
		stars = []; for (var i = 0; i < n; i++) stars.push(newStar(0.15 + Math.random() * DEPTH));
	}
	function drawSky(dt) {
		sctx.setTransform(SD, 0, 0, SD, 0, 0);
		sctx.fillStyle = "#000"; sctx.fillRect(0, 0, W, H);
		var vx = W * (mobile ? 0.6 : 0.68), vy = -H * 0.08;          // vanishing point just above the top edge
		var f = Math.max(W, H) * 0.42, step = fly * dt, streak = Math.min(0.2, 0.015 + fly * 0.035);
		for (var l = 0; l < LEVELS * 2; l++) skyPaths[l] = [];
		var glows = [];
		for (var i = 0; i < stars.length; i++) {
			var s = stars[i];
			s.z -= step;
			if (s.z < 0.12) { stars[i] = newStar(DEPTH); continue; }
			var x = vx + s.x / s.z * f, y = vy + s.y / s.z * f;
			if (x < -40 || x > W + 40 || y < -40 || y > H + 40) { stars[i] = newStar(DEPTH * (0.6 + Math.random() * 0.4)); continue; }
			var zt = s.z + streak, tx = vx + s.x / zt * f, ty = vy + s.y / zt * f;   // tail: where the star was a moment ago
			var near = 1 - s.z / DEPTH;                                // 0 far .. 1 near
			var a = s.b * (0.15 + near * near * 0.95);
			var big = near > 0.72 ? 1 : 0;
			var lv = Math.min(LEVELS - 1, (a * LEVELS) | 0);
			var path = skyPaths[lv * 2 + big];
			if (Math.abs(tx - x) + Math.abs(ty - y) < 0.6) { tx = x + 0.6; }   // far stars: a dot
			path.push(tx, ty, x, y);
			if (s.glow && near > 0.25) glows.push(s.glow, x, y, near);
		}
		sctx.lineCap = "round";
		for (var k = 0; k < LEVELS * 2; k++) {
			var p = skyPaths[k]; if (!p.length) continue;
			var lvl = k >> 1, isBig = k & 1;
			sctx.strokeStyle = "rgba(240,242,255," + ((lvl + 0.6) / LEVELS).toFixed(3) + ")";
			sctx.lineWidth = isBig ? 1.9 : 1.05;
			sctx.beginPath();
			for (var m = 0; m < p.length; m += 4) { sctx.moveTo(p[m], p[m + 1]); sctx.lineTo(p[m + 2], p[m + 3]); }
			sctx.stroke();
		}
		// coloured stars with a soft glow
		for (var g = 0; g < glows.length; g += 4) {
			var sz = 10 + glows[g + 3] * 26;
			sctx.globalAlpha = 0.35 + glows[g + 3] * 0.6;
			sctx.drawImage(glowSprite[glows[g]], glows[g + 1] - sz / 2, glows[g + 2] - sz / 2, sz, sz);
		}
		sctx.globalAlpha = 1;
	}

	function resize() {
		var root = getComputedStyle(document.documentElement);
		wireRGB = (root.getPropertyValue("--wire") || "").trim() || "245,245,247";
		// flame colours: outer, inner, core (r, g, b in CSS)
		flameRGB = [cssRGB("--flame-outer", flameRGB[0]), cssRGB("--flame-inner", flameRGB[1]), cssRGB("--flame-core", flameRGB[2])];
		var r = hero.getBoundingClientRect();
		DPR = Math.min(window.devicePixelRatio || 1, 1.25);
		W = r.width; H = r.height;
		canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
		mobile = W < 760;
		if (mobile) { cx = W * 0.68; top = H * 0.13; scale = Math.min(W * 0.34, H * 0.18); }
		else { cx = W * 0.71; top = H * 0.25; scale = Math.min(W * 0.19, H * 0.27); }
		flame.resize();
		prep(); skyResize();
		draw(0);
	}

	// model -> screen
	var cg = 1, sg = 0, cgz = 1, sgz = 0, cs = 1, ss = 0, cv = 1, sv = 0, sc = 1, tp = 0, ee = 0, ox = 0, oy = 0, oz = 0;
	function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
	function setPart(i) { var o = OFF[i], k = ee * (mobile ? 0.6 : 1); ox = o[0] * k; oy = o[1] * k; oz = o[2] * k; }
	function prep() {
		ee = ease(Math.max(0, Math.min(1, explode)));
		sc = scale * (1 - (mobile ? 0.1 : 0.18) * ee);
		tp = top + ee * (mobile ? 0.2 : 0.4) * scale;
		cs = Math.cos(spin); ss = Math.sin(spin);
		cg = Math.cos(gx); sg = Math.sin(gx);
		cgz = Math.cos(gz); sgz = Math.sin(gz);
		cv = Math.cos(view); sv = Math.sin(view);
	}
	function project(x, y, z, out, o) {
		// roll about the axis; exploded offsets after the roll so parts always move apart on screen
		var x1 = x * cs - z * ss + ox, z1 = x * ss + z * cs + oz, y1 = y + oy - PIVOT_Y;
		// gimbal about the bearing
		var x2 = x1 * cgz - y1 * sgz, y2 = x1 * sgz + y1 * cgz;
		var y3 = y2 * cg - z1 * sg, z3 = y2 * sg + z1 * cg;
		// camera looks slightly down on the engine
		var y4 = y3 * cv - z3 * sv, z4 = y3 * sv + z3 * cv;
		var p = 5 / (5 - z4);
		out[o] = cx + x2 * sc * p;
		out[o + 1] = tp + (y4 + PIVOT_Y) * sc * p;
		out[o + 2] = z4;
	}

	/* ---------- flame: WebGL shader (turbulent plume, white-hot core, shock diamonds) ---------- */
	var flame = (function () {
		var gc = document.createElement("canvas");
		gc.className = "flame"; gc.setAttribute("aria-hidden", "true");
		canvas.parentNode.insertBefore(gc, canvas);
		var gl = null;
		try { gl = gc.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false }); } catch (e) { gl = null; }
		var prog, loc = {}, gDPR = 1;
		if (gl) {
			var vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
			var fs = [
				"precision highp float;",
				"uniform vec2 uRes;uniform float uTime;uniform vec2 uExit;uniform vec2 uDir;uniform float uR;uniform float uLen;uniform float uThr;uniform float uFire;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uC3;",
				"float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
				"float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}",
				"float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}",
				"void main(){",
				"  vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);",
				"  vec2 d=p-uExit; vec2 n=vec2(-uDir.y,uDir.x);",
				"  float a=dot(d,uDir), b=dot(d,n);",
				"  if(a<-uR*0.4){gl_FragColor=vec4(0.);return;}",
				"  float t=max(a,0.)/uLen;",
				"  float tu=fbm(vec2(b/uR*1.4, a/uR*0.5-uTime*6.5));",          // large eddies, carried downstream
				"  float fi=fbm(vec2(b/uR*3.2+5., a/uR*1.3-uTime*13.));",       // fine flicker
				"  float w=uR*(0.9+0.5*t+0.6*t*t)*(0.78+0.5*tu);",
				"  float rr=abs(b)/w;",
				"  float body=smoothstep(1.0,0.1,rr)*smoothstep(1.0,0.2,t+0.25*(tu-0.5));",
				// hydrogen–oxygen plume: mostly transparent, pale ice-blue with faint violet edges,
				// a white-blue core at the nozzle and soft, blurred shock diamonds
				"  float core=exp(-rr*rr*6.0)*exp(-t*3.0);",
				"  float sp=uR*(1.1+0.3*uThr);",
				"  float ph=fract(a/sp);",
				"  float dq=abs(b)/uR*2.6+(1.0-cos(6.2832*ph))*0.9;",
				"  float dia=exp(-dq*dq*0.9)*exp(-a/(sp*4.0))*smoothstep(sp*0.3,sp*1.0,a)*(0.85+0.3*fi);",
				"  float heat=body*(0.12+0.3*fi)+core*(0.7+0.2*fi)+dia*0.45;",
				"  heat*=uFire*(0.55+0.45*uThr)*smoothstep(-uR*0.4,uR*0.1,a);",
				"  float h=1.0-exp(-heat*1.6);",
				"  vec3 c=mix(uC1*0.5,uC1,smoothstep(0.02,0.25,h));",
				"  c=mix(c,uC2,smoothstep(0.25,0.6,h));",
				"  c=mix(c,uC3,smoothstep(0.6,0.95,h));",
				"  float al=clamp(h*0.95,0.,0.85);",
				"  gl_FragColor=vec4(c*al,al);",
				"}"
			].join("\n");
			function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
			var v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
			if (v && f) {
				prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
				if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) gl = null;
			} else gl = null;
		}
		if (gl) {
			gl.useProgram(prog);
			var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
			var ap = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
			["uRes", "uTime", "uExit", "uDir", "uR", "uLen", "uThr", "uFire", "uC1", "uC2", "uC3"].forEach(function (k) { loc[k] = gl.getUniformLocation(prog, k); });
			gl.enable(gl.SCISSOR_TEST);
		} else {
			gc.remove();
		}
		return {
			webgl: !!gl,
			resize: function () {
				if (!gl) return;
				gDPR = 0.5;                                        // flame is soft anyway: shade at half resolution, the browser upscales it
				gc.width = Math.round(W * gDPR); gc.height = Math.round(H * gDPR);
				gl.viewport(0, 0, gc.width, gc.height);
			},
			// exit (css px), direction, radius, length, throttle, fire
			draw: function (ex, ey, ux, uy, R, L, thr, fire) {
				if (!gl) return false;
				gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.SCISSOR_TEST);
				if (fire <= 0.001) return true;
				// only shade the plume's bounding box
				var ends = [[ex + uy * R * 3, ey - ux * R * 3], [ex - uy * R * 3, ey + ux * R * 3], [ex + ux * L * 1.2 + uy * R * 4.5, ey + uy * L * 1.2 - ux * R * 4.5], [ex + ux * L * 1.2 - uy * R * 4.5, ey + uy * L * 1.2 + ux * R * 4.5]];
				var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
				ends.forEach(function (e) { x0 = Math.min(x0, e[0]); y0 = Math.min(y0, e[1]); x1 = Math.max(x1, e[0]); y1 = Math.max(y1, e[1]); });
				x0 = Math.max(0, x0 - R); y0 = Math.max(0, y0 - R); x1 = Math.min(W, x1 + R); y1 = Math.min(H, y1);
				if (x1 <= x0 || y1 <= y0) return true;
				gl.scissor(Math.floor(x0 * gDPR), Math.floor((H - y1) * gDPR), Math.ceil((x1 - x0) * gDPR), Math.ceil((y1 - y0) * gDPR));
				gl.uniform2f(loc.uRes, gc.width, gc.height);
				gl.uniform1f(loc.uTime, time);
				gl.uniform2f(loc.uExit, ex * gDPR, ey * gDPR);
				gl.uniform2f(loc.uDir, ux, uy);
				gl.uniform1f(loc.uR, R * gDPR);
				gl.uniform1f(loc.uLen, L * gDPR);
				gl.uniform1f(loc.uThr, thr);
				gl.uniform1f(loc.uFire, fire);
				gl.uniform3fv(loc.uC1, flameRGB[0]); gl.uniform3fv(loc.uC2, flameRGB[1]); gl.uniform3fv(loc.uC3, flameRGB[2]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				return true;
			}
		};
	})();

	var BUCKETS = 10, buckets = [];
	var pt = [0, 0, 0, 0, 0, 0], ea = [0, 0, 0], eb = [0, 0, 0];

	function draw() {
		if (!W) return;
		prep();
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
		ctx.clearRect(0, 0, W, H);

		// nozzle exit and plume direction on screen
		setPart(2);
		project(0, Y_E, 0, ea, 0);
		project(0, Y_E + 1, 0, eb, 0);
		var dl = Math.hypot(eb[0] - ea[0], eb[1] - ea[1]) || 1;
		var ux = (eb[0] - ea[0]) / dl, uy = (eb[1] - ea[1]) / dl;
		var exitR = RE * sc;
		var fire = Math.max(0, Math.min(1, 1 - ee * 1.8)) * (mobile ? 0.7 : 1);
		var plumeLen = Math.max(exitR * 5, (H - ea[1]) * (0.85 + throttle * 0.35));

		if (!flame.draw(ea[0], ea[1], ux, uy, exitR, plumeLen, throttle, fire) && fire > 0) {
			// fallback: soft gradient flame
			ctx.globalCompositeOperation = "lighter";
			var g = ctx.createLinearGradient(ea[0], ea[1], ea[0] + ux * plumeLen, ea[1] + uy * plumeLen);
			g.addColorStop(0, "rgba(240,248,255," + (0.8 * fire) + ")"); g.addColorStop(0.3, "rgba(100,223,255," + (0.45 * fire) + ")"); g.addColorStop(1, "rgba(180,154,216,0)");
			ctx.fillStyle = g; ctx.beginPath();
			ctx.moveTo(ea[0] - uy * exitR, ea[1] + ux * exitR); ctx.lineTo(ea[0] + uy * exitR, ea[1] - ux * exitR);
			ctx.lineTo(ea[0] + ux * plumeLen + uy * exitR * 1.6, ea[1] + uy * plumeLen - ux * exitR * 1.6);
			ctx.lineTo(ea[0] + ux * plumeLen - uy * exitR * 1.6, ea[1] + uy * plumeLen + ux * exitR * 1.6);
			ctx.closePath(); ctx.fill();
			ctx.globalCompositeOperation = "source-over";
		}

		/* wireframe */
		var glowR2 = Math.pow(Math.max(120, scale * 0.8), 2);
		var base = mobile ? 0.22 : 0.3;
		for (var b = 0; b < BUCKETS; b++) buckets[b] = [];
		for (var j = 0; j < segs.length; j++) {
			var s = segs[j];
			setPart(s[7]);
			project(s[0], s[1], s[2], pt, 0);
			project(s[3], s[4], s[5], pt, 3);
			var mx = (pt[0] + pt[3]) / 2, my = (pt[1] + pt[4]) / 2, depth = (pt[2] + pt[5]) / 2;
			var dx = mx - lpx, dy = my - lpy;
			var light = Math.exp(-(dx * dx + dy * dy) / glowR2);
			var lit = Math.max(0, (s[1] + s[4]) / 2 - (Y_E - 0.45)) * 0.6 * fire;      // nozzle lip lit by its own flame
			var al = (base + depth * 0.2 + lit) * s[6] + light * 0.8 * Math.min(1, s[6] + 0.3);
			al = Math.max(0.03, Math.min(1, al));
			buckets[Math.min(BUCKETS - 1, Math.floor(al * BUCKETS))].push(pt[0], pt[1], pt[3], pt[4]);
		}
		ctx.lineCap = "round"; ctx.lineWidth = 1;
		for (var k = 0; k < BUCKETS; k++) {
			var list = buckets[k];
			if (!list.length) continue;
			ctx.strokeStyle = "rgba(" + wireRGB + "," + ((k + 0.5) / BUCKETS).toFixed(3) + ")";
			ctx.beginPath();
			for (var m = 0; m < list.length; m += 4) { ctx.moveTo(list[m], list[m + 1]); ctx.lineTo(list[m + 2], list[m + 3]); }
			ctx.stroke();
		}
	}

	var FRAME = 1000 / 40, acc = 0;                   // cap the hero at ~40 fps: plenty for a background, far less work
	function tick(t) {
		raf = 0;
		if (!visible || document.hidden) return;
		if (lastT && t - lastT < FRAME - 1) { raf = requestAnimationFrame(tick); return; }
		var dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016); lastT = t; time += dt;
		var active = t - lastMove < 1600;
		if (!assembledAt) assembledAt = t + 600;            // start in exploded view, then assemble and ignite
		var target = t < assembledAt ? 1 : (hoverEngine || tapExploded ? 1 : 0);
		explode += (target - explode) * (target > explode ? 0.05 : 0.035);
		if (hudMode) {
			var mode = explode > 0.5 ? "Exploded view" : "Liquid rocket engine · wireframe";
			if (hudMode.textContent !== mode) hudMode.textContent = mode;
		}
		tgtThrottle = active && !hoverEngine ? 1 : 0.6;
		throttle += (tgtThrottle - throttle) * 0.04;
		var hold = 1 - ee;
		gx += (tgx * hold - gx) * 0.05; gz += (tgz * hold - gz) * 0.05;
		if (active) { lpx += (px - lpx) * 0.2; lpy += (py - lpy) * 0.2; }
		else { lpx += (-9999 - lpx) * 0.02; lpy += (-9999 - lpy) * 0.02; }
		fly += ((0.45 + 0.9 * Math.max(0, throttle - 0.6) / 0.4) * (1 - ee * 0.5) - fly) * 0.03;   // fly faster when the engine throttles up
		drawSky(dt);
		draw();
		if (thrustEl) thrustEl.textContent = String(Math.round(throttle * 100 * Math.max(0, 1 - ee * 1.8))).padStart(3, "0");
		raf = requestAnimationFrame(tick);
	}

	hero.addEventListener("pointermove", function (e) {
		var r = hero.getBoundingClientRect();
		px = e.clientX - r.left; py = e.clientY - r.top;
		if (lpx < -999) { lpx = px; lpy = py; }
		lastMove = performance.now();
		if (e.pointerType === "mouse") {
			var wHalf = scale * (explode > 0.5 ? 1.0 : 0.65);
			var y0 = top + (explode > 0.5 ? -0.6 : -0.3) * scale, y1 = top + (explode > 0.5 ? 2.2 : 1.85) * scale;
			hoverEngine = Math.abs(px - cx) < wHalf && py > y0 && py < y1 && !(e.target.closest && e.target.closest("a, button"));
		}
	}, { passive: true });
	hero.addEventListener("pointerleave", function () { tgx = 0; tgz = 0; lastMove = -1e9; hoverEngine = false; });
	hero.addEventListener("pointerdown", function (e) {
		if (e.pointerType === "mouse" || (e.target.closest && e.target.closest("a, button"))) return;
		tapExploded = !tapExploded;
	});

	var rt;
	window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 150); });

	if ("IntersectionObserver" in window) {
		new IntersectionObserver(function (en) {
			visible = en[0].isIntersecting;
			if (visible && !raf && !reduceMotion) { lastT = 0; raf = requestAnimationFrame(tick); }
		}).observe(hero);
	}

	document.addEventListener("visibilitychange", function () {
		if (!document.hidden && visible && !raf && !reduceMotion) { lastT = 0; raf = requestAnimationFrame(tick); }
	});

	resize();
	if (reduceMotion) { time = 1; drawSky(0); draw(); }
	else raf = requestAnimationFrame(tick);
})();
