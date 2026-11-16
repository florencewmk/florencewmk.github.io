/* Florence Wong – homepage interactions
   1. Shine: a soft specular highlight follows the cursor over glass surfaces and rows
   2. Hero: a wireframe liquid rocket engine drawn in 3D on a canvas, with a WebGL flame.
      It assembles from an exploded view on load, then ignites; hovering the engine (tapping
      on touch screens) separates its assemblies again. The flame throttles up while the
      cursor moves.
   3. Scroll reveal
   4. Nav: a short spring when a link is pressed
   5. About page: a ray-traced black hole with a spinning accretion disk
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
		shineTarget = e.target.closest ? e.target.closest(".shine, .hero-glow") : null;
		if (shineTarget && !shinePending) { shinePending = true; requestAnimationFrame(applyShine); }
	}, { passive: true });

	/* ---------- 4. Nav: links spring back when pressed ----------
	   The press itself is CSS (:active). On a plain click the link plays the spring first and
	   the page changes a moment later, so the reaction is visible. */
	Array.prototype.forEach.call(document.querySelectorAll(".nav li a"), function (a) {
		a.addEventListener("click", function (e) {
			if (reduceMotion || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
			e.preventDefault();
			a.classList.remove("spring"); void a.offsetWidth; a.classList.add("spring");
			setTimeout(function () { window.location.href = a.href; }, 230);
		});
	});
	window.addEventListener("pageshow", function () {
		Array.prototype.forEach.call(document.querySelectorAll(".nav li a.spring"), function (a) { a.classList.remove("spring"); });
	});

	/* ---------- 3. Scroll reveal ----------
	   Items fade and rise in when they come into view (from below when scrolling down, from
	   above when scrolling back up). While an item is fully off screen it is reset with
	   transitions switched off, so nothing ever animates or jumps where you can see it. */
	(function () {
		if (reduceMotion || !("IntersectionObserver" in window)) return;
		// show: once an item is a little way into the screen
		var show = new IntersectionObserver(function (entries) {
			entries.forEach(function (en) {
				if (en.isIntersecting) { en.target.classList.remove("reset"); en.target.classList.add("in"); }
			});
		}, { rootMargin: "0px 0px -10% 0px" });
		// reset: only when it is completely off screen
		var hide = new IntersectionObserver(function (entries) {
			entries.forEach(function (en) {
				if (en.isIntersecting) return;
				var el = en.target;
				el.classList.add("reset");
				el.classList.remove("in");
				el.classList.toggle("above", en.boundingClientRect.top < 0);
			});
		});
		var io = { observe: function (el) { show.observe(el); hide.observe(el); } };
		var groups = document.querySelectorAll(".section-head, .focus, .rows, .feature, .photo, .grid-cards, .figure, .prose, .photo-full, .grade-note, .contact-form, .contact-side, .posts-block");
		Array.prototype.forEach.call(groups, function (g) {
			var kids = g.matches(".focus, .rows, .feature, .grid-cards, .contact-side") ? g.children : [g];
			Array.prototype.forEach.call(kids, function (el, i) {
				el.classList.add("reveal");
				el.style.transitionDelay = Math.min(i, 5) * 60 + "ms";
				io.observe(el);
			});
		});
	})();

	/* ---------- 5. About page: black hole ----------
	   Rendered by tracing light rays in a WebGL shader. Every pixel sends a ray towards a
	   non-rotating (Schwarzschild) black hole and bends it step by step with the exact
	   photon equation of motion, so the shadow, the thin photon ring and the far side of
	   the disk arching over the top all come out of the physics instead of being drawn.
	   The disk is thin, hotter and faster towards the inner edge, and brighter and bluer
	   on the side moving towards the viewer (relativistic Doppler beaming) and dimmer on
	   the other. Lengths are in Schwarzschild radii. A 2D canvas behind holds the stars.
	   Moving the cursor changes the viewing angle slightly. */
	(function () {
		var c = document.querySelector(".blackhole");
		if (!c || !c.getContext) return;
		var host = c.parentNode, x = c.getContext("2d");
		var W = 0, H = 0, cx = 0, cy = 0, shadow = 80, time = 0, raf = 0, last = 0, vis = true;
		var incl = 0.2, inclTo = 0.2, roll = -0.22, rollTo = -0.22;
		var F = 3, DIST = 22, R_OUT = 9;
		var glc = document.createElement("canvas"), gl = null, prog = null, U = {}, GD = 1, pxScale = 1;
		glc.className = "blackhole-gl"; glc.setAttribute("aria-hidden", "true");
		try { gl = glc.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false }); } catch (e) { gl = null; }
		if (gl) {
			var vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
			var fs = [
				"precision highp float;",
				"uniform vec2 uRes;uniform float uTime;uniform float uScale;uniform float uIncl;uniform float uRoll;",
				"const float RIN=2.6;const float ROUT=9.0;const float DIST=22.0;const float FOC=3.0;",
				"float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
				"float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}",
				"float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.07+vec2(3.1,7.7);a*=.5;}return v;}",
				// gas pattern sheared by differential rotation (inner orbits are faster)
				"float gas(vec3 c,float r,float ph){float a=atan(c.z,c.x)+ph*2.4*pow(r,-1.5);vec2 q=vec2(cos(a),sin(a))*r;return fbm(q*1.25+ph*0.013);}",
				"vec3 heat(float t){vec3 c=mix(vec3(.75,.13,.02),vec3(1.,.42,.1),smoothstep(.15,.5,t));c=mix(c,vec3(1.,.78,.5),smoothstep(.45,.85,t));return mix(c,vec3(.95,.96,1.),smoothstep(.85,1.35,t));}",
				"void main(){",
				"  vec2 uv=(gl_FragCoord.xy-uRes*.5)/uScale;",
				"  float cr=cos(uRoll),sr=sin(uRoll);uv=vec2(uv.x*cr-uv.y*sr,uv.x*sr+uv.y*cr);",
				"  vec3 ro=vec3(0.,sin(uIncl),-cos(uIncl))*DIST;",
				"  vec3 fw=normalize(-ro),rt=normalize(cross(vec3(0.,1.,0.),fw)),up=cross(fw,rt);",
				"  vec3 v=normalize(fw*FOC+rt*uv.x+up*uv.y),p=ro;",
				"  vec3 hv=cross(p,v);float h2=dot(hv,hv);",
				"  vec3 col=vec3(0.);float trans=1.;",
				"  float P=36.,f1=fract(uTime/P),f2=fract(uTime/P+.5),w1=1.-abs(1.-2.*f1);",
				"  for(int i=0;i<170;i++){",
				"    float r2=dot(p,p);",
				"    if(r2<1.){trans=0.;break;}",                                   // fell through the horizon
				"    if(r2>DIST*DIST*1.2&&dot(p,v)>0.)break;",                       // escaped
				"    float dt=clamp(.06*sqrt(r2),.045,1.4);",
				"    v+=-1.5*h2*p/(r2*r2*sqrt(r2))*dt;",                             // light bending
				"    vec3 np=p+v*dt;",
				"    if(p.y*np.y<0.){",                                             // crossed the disk plane
				"      vec3 c=mix(p,np,p.y/(p.y-np.y));float r=length(c.xz);",
				"      if(r>RIN&&r<ROUT){",
				"        float n=w1*gas(c,r,18.+f1*P)+(1.-w1)*gas(c,r,18.+f2*P+7.);",
				"        float band=noise(vec2(r*2.2,1.7))*.65+noise(vec2(r*6.,5.))*.35;",
				"        float dens=(.55+.45*band)*(.4+1.25*n);",
				"        float beta=sqrt(.5/r),cs=dot(vec3(c.z,0.,-c.x)/r,-normalize(v));",
				"        float g=sqrt(1.-beta*beta)/(1.-beta*cs)*sqrt(1.-1./r);",    // Doppler and gravitational shift
				"        float tn=pow(RIN/r,.75)*g*1.05;",
				"        float a=clamp(dens*1.3,0.,1.)*smoothstep(RIN,RIN+.5,r)*(1.-smoothstep(ROUT-4.,ROUT,r));",
				"        col+=trans*heat(tn)*pow(g,2.2)*pow(RIN/r,1.9)*dens*5.5*a;",
				"        trans*=1.-a*.85;",
				"      }",
				"    }",
				"    p=np;",
				"  }",
				"  col=1.-exp(-col*1.5);",
				"  float al=clamp(max(1.-trans,max(col.r,max(col.g,col.b))),0.,1.);",
				"  gl_FragColor=vec4(col,al);",
				"}"
			].join("\n");
			var sh = function (type, src) { var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
			var v0 = sh(gl.VERTEX_SHADER, vs), f0 = sh(gl.FRAGMENT_SHADER, fs);
			if (v0 && f0) {
				prog = gl.createProgram(); gl.attachShader(prog, v0); gl.attachShader(prog, f0); gl.linkProgram(prog);
				if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) gl = null;
			} else gl = null;
		}
		if (gl) {
			gl.useProgram(prog);
			var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
			var ap = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
			["uRes", "uTime", "uScale", "uIncl", "uRoll"].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
			host.insertBefore(glc, c.nextSibling);
		}
		function setup() {
			var r = host.getBoundingClientRect(), D = Math.min(window.devicePixelRatio || 1, 1.5);
			W = r.width; H = r.height;
			c.width = Math.round(W * D); c.height = Math.round(H * D);
			var small = W < 760;
			cx = small ? W * 0.5 : W * 0.7; cy = small ? H * 0.32 : H * 0.5;
			shadow = small ? Math.min(W * 0.1, H * 0.075) : Math.min(W * 0.056, H * 0.1);   // radius of the dark disc on screen
			pxScale = shadow / (2.6 * F / DIST);                                             // px per unit of the image plane
			// stars and a faint warm haze, drawn once
			x.setTransform(D, 0, 0, D, 0, 0); x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
			var m = Math.round(W * H / 2600);
			for (var k = 0; k < m; k++) {
				var px = Math.random() * W, py = Math.random() * H;
				if (Math.hypot(px - cx, py - cy) < shadow * 1.6) continue;
				x.fillStyle = "rgba(236,238,255," + (0.1 + Math.pow(Math.random(), 2) * 0.7).toFixed(2) + ")";
				var sz = Math.random() < 0.07 ? 1.7 : 0.9; x.fillRect(px, py, sz, sz);
			}
			if (gl) {
				var g = x.createRadialGradient(cx, cy, shadow, cx, cy, shadow * 7);
				g.addColorStop(0, "rgba(255,170,90,.1)"); g.addColorStop(0.4, "rgba(255,130,60,.03)"); g.addColorStop(1, "rgba(255,120,50,0)");
				x.fillStyle = g; x.fillRect(0, 0, W, H);
				// the shader only covers a box around the disk
				var hw = Math.min(W, R_OUT * F / DIST * pxScale * 1.12), hh = hw * 0.72;
				GD = Math.min(window.devicePixelRatio || 1, hw > 330 ? 1 : 1.5);
				glc.style.left = (cx - hw) + "px"; glc.style.top = (cy - hh) + "px"; glc.style.width = hw * 2 + "px"; glc.style.height = hh * 2 + "px";
				glc.width = Math.round(hw * 2 * GD); glc.height = Math.round(hh * 2 * GD);
				gl.viewport(0, 0, glc.width, glc.height);
			} else {
				// no WebGL: a plain dark disc with a bright rim
				x.fillStyle = "#000"; x.beginPath(); x.arc(cx, cy, shadow, 0, 6.2832); x.fill();
				x.strokeStyle = "rgba(255,214,170,.8)"; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, shadow, 0, 6.2832); x.stroke();
			}
			frame(0);
		}
		function frame(dt) {
			if (!gl) return;
			time += dt; incl += (inclTo - incl) * 0.04; roll += (rollTo - roll) * 0.04;
			gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
			gl.uniform2f(U.uRes, glc.width, glc.height); gl.uniform1f(U.uTime, time);
			gl.uniform1f(U.uScale, pxScale * GD); gl.uniform1f(U.uIncl, incl); gl.uniform1f(U.uRoll, roll);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
		function tick(t) {
			raf = 0; if (!vis || document.hidden) return;
			var dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016); last = t;
			frame(dt); raf = requestAnimationFrame(tick);
		}
		function go() { if (gl && vis && !raf && !reduceMotion) { last = 0; raf = requestAnimationFrame(tick); } }
		host.addEventListener("pointermove", function (e) {
			var r = host.getBoundingClientRect();
			inclTo = 0.12 + 0.16 * Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
			rollTo = -0.22 + 0.16 * ((e.clientX - r.left) / r.width - 0.5);
		}, { passive: true });
		host.addEventListener("pointerleave", function () { inclTo = 0.2; rollTo = -0.22; });
		var rs; window.addEventListener("resize", function () { clearTimeout(rs); rs = setTimeout(setup, 150); });
		if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { vis = en[0].isIntersecting; go(); }).observe(host);
		document.addEventListener("visibilitychange", go);
		time = 3; setup(); go();
	})();

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
	var curPart = 2, Y_SPLIT = 1e9;                     // below Y_SPLIT the bell is a separate nozzle extension (part 3)
	function seg(a, b, w) {
		var part = curPart === 2 && (a[1] + b[1]) / 2 > Y_SPLIT + 1e-6 ? 3 : curPart;
		segs.push([a[0], a[1], a[2], b[0], b[1], b[2], w || 1, part]);
	}
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

		curPart = 2;                                         // thrust chamber with throat; the lower bell bolts on as a nozzle extension
		var split = prof[16]; Y_SPLIT = split[0];
		prof.forEach(function (p, k) {
			var edge = k === 0 || k === prof.length - 1 || Math.abs(p[0] - Y_T) < 1e-6 || k === 16;
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
		// bolted joint between chamber and nozzle extension: one flange on each part
		ring(split[1] + 0.014, Y_SPLIT, 72, 1.1);
		curPart = 3; ring(split[1], Y_SPLIT + 0.004, 72, 1.15); ring(split[1] + 0.014, Y_SPLIT + 0.004, 72, 1.1);

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
		[0, -0.5, 0],      // 0 gimbal bearing
		[0, -0.3, 0],      // 1 injector + dome
		[0, -0.06, 0],     // 2 thrust chamber with throat
		[0, 0.3, 0]        // 3 nozzle extension
	];

	// --- state
	var W = 0, H = 0, BX = 0, BW = 0, DPR = 1, cx = 0, top = 0, scale = 1, mobile = false;
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
		var n = Math.round(Math.min(800, W * H / 1500));
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
		mobile = W < 760;
		if (mobile) { cx = W * 0.68; top = H * 0.13; scale = Math.min(W * 0.34, H * 0.18); }
		else { cx = W * 0.71; top = H * 0.25; scale = Math.min(W * 0.19, H * 0.27); }
		// engine and flame canvases only cover a strip around the engine, not the whole hero
		BX = Math.max(0, Math.floor(cx - 1.7 * scale)); BW = Math.min(W, Math.ceil(cx + 1.7 * scale)) - BX;
		[canvas, flame.el].forEach(function (c) { c.style.left = BX + "px"; c.style.width = BW + "px"; });
		canvas.width = Math.round(BW * DPR); canvas.height = Math.round(H * DPR);
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
		sc = scale * (1 - (mobile ? 0.14 : 0.24) * ee);
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
			el: gc,
			webgl: !!gl,
			resize: function () {
				if (!gl) return;
				gDPR = 0.5;                                        // flame is soft anyway: shade at half resolution, the browser upscales it
				gc.width = Math.round(BW * gDPR); gc.height = Math.round(H * gDPR);
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
				x0 = Math.max(BX, x0 - R) - BX; y0 = Math.max(0, y0 - R); x1 = Math.min(BX + BW, x1 + R) - BX; y1 = Math.min(H, y1);
				if (x1 <= x0 || y1 <= y0) return true;
				gl.scissor(Math.floor(x0 * gDPR), Math.floor((H - y1) * gDPR), Math.ceil((x1 - x0) * gDPR), Math.ceil((y1 - y0) * gDPR));
				gl.uniform2f(loc.uRes, gc.width, gc.height);
				gl.uniform1f(loc.uTime, time);
				gl.uniform2f(loc.uExit, (ex - BX) * gDPR, ey * gDPR);
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
		ctx.setTransform(DPR, 0, 0, DPR, -BX * DPR, 0);
		ctx.clearRect(BX, 0, BW, H);

		// nozzle exit and plume direction on screen
		setPart(3);
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

		/* exploded view: dashed assembly axis through all parts, as on an exploded drawing */
		if (ee > 0.03) {
			var ax = [0, 0, 0, 0, 0, 0];
			setPart(0); project(0, PIVOT_Y - 0.16, 0, ax, 0);
			setPart(3); project(0, Y_E + 0.14, 0, ax, 3);
			ctx.save(); ctx.setLineDash([10, 5, 2, 5]); ctx.lineWidth = 1;
			ctx.strokeStyle = "rgba(" + wireRGB + "," + (0.5 * ee).toFixed(3) + ")";
			ctx.beginPath(); ctx.moveTo(ax[0], ax[1]); ctx.lineTo(ax[3], ax[4]); ctx.stroke(); ctx.restore();
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

	function tick(t) {
		raf = 0;
		if (!visible || document.hidden) return;
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
			var y0 = top + (explode > 0.5 ? -0.6 : -0.3) * scale, y1 = top + (explode > 0.5 ? 2.5 : 1.85) * scale;
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
