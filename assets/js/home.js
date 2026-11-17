/* Florence Wong – homepage interactions
   1. Shine: a soft specular highlight follows the cursor over glass surfaces and rows
   2. Hero: a solid, shaded liquid rocket engine drawn in 3D on a canvas, with a WebGL flame.
      It rests as an exploded drawing (no labels); hovering the engine (tapping on touch
      screens) assembles it and fires it. The flame throttles up while the cursor moves.
   3. Scroll reveal
   4. Nav: a short spring when a link is pressed
   5. About page: a live ray-traced black hole that follows the pointer
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
	   Ray-traced live in WebGL. Every pixel sends a light ray towards a non-rotating
	   (Schwarzschild) black hole and bends it step by step with the photon equation of motion,
	   so the shadow, the photon ring, the far side of the disk arching over the top and the
	   bent starlight all come from the physics. Styled after Gargantua in Interstellar: thin
	   disk seen nearly edge-on, Doppler beaming kept faint, turbulent gas (a pre-made texture)
	   that orbits faster towards the inner edge. Lengths are in Schwarzschild radii.
	   The hole leans and drifts towards the pointer, and the gas speeds up as the pointer nears. */
	(function () {
		var c = document.querySelector(".blackhole");
		if (!c) return;
		var host = c.parentNode;
		var gl = null;
		try { gl = c.getContext("webgl", { premultipliedAlpha: false, alpha: false, antialias: false }); } catch (e) { gl = null; }
		var glow = document.createElement("canvas"), gctx = glow.getContext("2d");
		glow.className = "blackhole-glow2"; glow.setAttribute("aria-hidden", "true");
		host.insertBefore(glow, c.nextSibling);
		var halo = document.createElement("canvas"), hctx = halo.getContext("2d");          // wide, soft halo
		halo.className = "blackhole-halo"; halo.setAttribute("aria-hidden", "true");
		host.insertBefore(halo, glow);
		var W = 0, H = 0, D = 1, small = false;
		var cx = 0, cy = 0, hx = 0, hy = 0, toX = 0, toY = 0, scale = 100;
		var incl = 0.11, inclTo = 0.11, roll = -0.06, rollTo = -0.06, spin = 1, spinTo = 1;
		var time = 20, raf = 0, last = 0, vis = true, frames = 0, U = {}, ready = false;
		if (!gl) {
			// no WebGL: stars and a plain dark disc with a bright rim
			var x = c.getContext("2d");
			var plain = function () {
				var r = host.getBoundingClientRect(); c.width = r.width; c.height = r.height;
				x.fillStyle = "#000"; x.fillRect(0, 0, r.width, r.height);
				for (var k = 0; k < r.width * r.height / 2600; k++) { x.fillStyle = "rgba(236,238,255," + (0.1 + Math.random() * 0.5).toFixed(2) + ")"; x.fillRect(Math.random() * r.width, Math.random() * r.height, 1, 1); }
				var px = r.width < 760 ? r.width * 0.5 : r.width * 0.7, py = r.width < 760 ? 190 : r.height * 0.52;
				x.fillStyle = "#000"; x.beginPath(); x.arc(px, py, 40, 0, 6.2832); x.fill();
				x.strokeStyle = "rgba(255,214,170,.85)"; x.lineWidth = 2; x.stroke();
			};
			plain(); window.addEventListener("resize", plain); return;
		}
		var vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
		var fs = [
			"precision highp float;",
			"uniform vec2 uRes;uniform vec2 uC;uniform float uScale;uniform float uTime;uniform float uIncl;uniform float uRoll;uniform sampler2D uTex;",
			"const float RIN=2.25;const float ROUT=13.0;const float DIST=40.0;const float PI=3.14159265;",
			"float hash(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}",
			// point stars on a fine grid of directions
			"vec3 stars(vec3 d){vec3 col=vec3(0.);for(int l=0;l<2;l++){float s=l==0?190.:420.;vec3 q=d*s;vec3 id=floor(q);float h=hash(id+float(l)*17.);",
			"  if(h>(l==0?.965:.985)){vec3 o=vec3(hash(id+1.3),hash(id+2.7),hash(id+4.1))*.7+.15;float dd=length(fract(q)-o);float b=pow((h-.95)*20.,3.)*(l==0?.9:.45);",
			"  col+=b*smoothstep(.16,0.,dd)*mix(vec3(1.,.86,.72),vec3(.8,.88,1.),hash(id+9.));}}return col;}",
			"vec3 heat(float t){vec3 c=mix(vec3(.30,.07,.01),vec3(.85,.30,.05),smoothstep(0.,.28,t));c=mix(c,vec3(1.,.58,.20),smoothstep(.28,.55,t));c=mix(c,vec3(1.,.82,.55),smoothstep(.55,.78,t));return mix(c,vec3(1.,.97,.90),smoothstep(.78,1.,t));}",
			"float turb(float r,float a,float ph,float ch){float u=fract((a-ph*pow(r/RIN,-1.5))/(2.*PI)+ch*.5);float vv=(r-RIN)/(ROUT-RIN);vec4 t=texture2D(uTex,vec2(u,vv));return (ch<.5?t.r:t.g)*4.545-2.27;}",
			"void main(){",
			"  vec2 uv=(gl_FragCoord.xy-uC)/uScale;",
			"  float cr=cos(uRoll),sr=sin(uRoll);uv=vec2(uv.x*cr-uv.y*sr,uv.x*sr+uv.y*cr);",
			"  vec3 fw=vec3(0.,-sin(uIncl),cos(uIncl));vec3 ro=-fw*DIST;",
			"  vec3 rt=normalize(cross(vec3(0.,1.,0.),fw)),up=cross(fw,rt);",
			"  vec3 v=normalize(fw+rt*uv.x+up*uv.y),p=ro;",
			"  vec3 hv=cross(p,v);float h2=dot(hv,hv);",
			"  vec3 col=vec3(0.);float trans=1.;bool esc=false;",
			"  float P=24.,f1=fract(uTime/P),f2=fract(uTime/P+.5),w=1.-abs(1.-2.*f1);",   // two phases cross-faded so the shear never winds up
			"  for(int i=0;i<230;i++){",
			"    float r2=dot(p,p);float r=sqrt(r2);",
			"    if(r2<1.){trans=0.;break;}",
			"    if(r>DIST*1.5&&dot(p,v)>0.){esc=true;break;}",
			"    float dt=clamp(.045*r*min(1.,r*.5),.015,2.2);",
			"    vec3 a=-1.5*h2*p/(r2*r2*r);vec3 vh=v+a*dt*.5;vec3 np=p+vh*dt;",
			"    float nr2=dot(np,np);v=vh-1.5*h2*np/(nr2*nr2*sqrt(nr2))*dt*.5;",
			"    if(p.y*np.y<0.){",
			"      vec3 q=mix(p,np,p.y/(p.y-np.y));float rr=length(q.xz);",
			"      if(rr>RIN*.96&&rr<ROUT){",
			"        float ang=atan(q.z,q.x);",
			"        float n=(w*turb(rr,ang,(f1*P+5.)*1.7,0.)+(1.-w)*turb(rr,ang,(f2*P+5.)*1.7,1.))/sqrt(w*w+(1.-w)*(1.-w));",
			"        float lane=texture2D(uTex,vec2(.5,(rr-RIN)/(ROUT-RIN))).b*.9+.35;",
			"        float dens=(.55+.45*lane)*pow(clamp(.5+.62*n,.02,2.6),2.1);",
			"        float edge=smoothstep(RIN*.96,RIN*1.1,rr)*pow(1.-smoothstep(ROUT*.42,ROUT,rr),1.6);",
			"        float al=clamp(dens*1.6,0.,1.)*edge;",
			"        float beta=sqrt(.5/rr);vec3 tg=vec3(-q.z,0.,q.x)/rr;float cs=dot(tg,-normalize(v));",
			"        float g=(1.+.16*(sqrt(1.-beta*beta)/(1.-beta*cs)-1.))*pow(max(1.-1./rr,.05),.25);",
			"        float xx=RIN/rr;float I=pow(xx,2.1)*(1.-.5*sqrt(xx));",
			"        col+=trans*heat(clamp(pow(xx,.8)*g*1.05,0.,1.))*I*g*g*g*dens*9.*al;",
			"        trans*=1.-al*.9;",
			"      }",
			"    }",
			"    p=np;",
			"  }",
			"  if(esc)col+=stars(normalize(v))*trans;",
			"  col=1.-exp(-col*1.35);",
			"  gl_FragColor=vec4(col,1.);",
			"}"
		].join("\n");
		function sh(type, src) { var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; }
		var prog = gl.createProgram(), v0 = sh(gl.VERTEX_SHADER, vs), f0 = sh(gl.FRAGMENT_SHADER, fs);
		if (!v0 || !f0) return;
		gl.attachShader(prog, v0); gl.attachShader(prog, f0); gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
		gl.useProgram(prog);
		var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		var ap = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
		["uRes", "uC", "uScale", "uTime", "uIncl", "uRoll", "uTex"].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
		var tex = gl.createTexture(), img = new Image();
		img.onload = function () {
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.uniform1i(U.uTex, 0); ready = true; frame(0); go();
		};
		img.src = (document.querySelector('script[src*="home.js"]').getAttribute("src").split("assets/")[0]) + "images/about/blackhole-disk.png";
		function setup() {
			var r = host.getBoundingClientRect();
			W = r.width; H = r.height; small = W < 760;
			D = Math.min(window.devicePixelRatio || 1, 1.5);
			if (W * H * D * D > 1.3e6) D = Math.sqrt(1.3e6 / (W * H));
			c.width = Math.round(W * D); c.height = Math.round(H * D);
			glow.width = Math.round(W / 4); glow.height = Math.round(H / 4); halo.width = Math.round(W / 8); halo.height = Math.round(H / 8);
			// the hole sits in the middle of .bh-slot, which CSS centres beside the text
			var slot = host.querySelector(".bh-slot"), sr = slot ? slot.getBoundingClientRect() : r;
			cx = sr.left - r.left + sr.width / 2; cy = sr.top - r.top + sr.height / 2;
			var rd = sr.width * (small ? 0.46 : 0.5);
			scale = rd / (13 / 40);
			hx = cx; hy = cy; toX = cx; toY = cy;
			gl.viewport(0, 0, c.width, c.height);
			frame(0);
		}
		function frame(dt) {
			if (!ready) return;
			time += dt * spin; spin += (spinTo - spin) * 0.03;
			incl += (inclTo - incl) * 0.05; roll += (rollTo - roll) * 0.05;
			hx += (toX - hx) * 0.05; hy += (toY - hy) * 0.05;
			gl.uniform2f(U.uRes, c.width, c.height);
			gl.uniform2f(U.uC, hx * D, (H - hy) * D);
			gl.uniform1f(U.uScale, scale * D); gl.uniform1f(U.uTime, time);
			gl.uniform1f(U.uIncl, incl); gl.uniform1f(U.uRoll, roll);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			if (frames++ % 2 === 0) { gctx.clearRect(0, 0, glow.width, glow.height); gctx.drawImage(c, 0, 0, glow.width, glow.height); hctx.clearRect(0, 0, halo.width, halo.height); hctx.drawImage(glow, 0, 0, halo.width, halo.height); }
		}
		function tick(t) {
			raf = 0; if (!vis || document.hidden) return;
			var dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016); last = t;
			frame(dt); raf = requestAnimationFrame(tick);
		}
		function go() { if (ready && vis && !raf && !reduceMotion) { last = 0; raf = requestAnimationFrame(tick); } }
		// pointer: the hole drifts and leans towards it, the view tips, and the gas speeds up nearby
		function point(px, py) {
			var dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy) || 1, pull = Math.min(1, d / 600);
			toX = cx + dx / d * 46 * pull; toY = cy + dy / d * 30 * pull;
			inclTo = 0.11 + 0.16 * Math.max(-0.5, Math.min(1, dy / (H * 0.6)));
			rollTo = -0.06 - 0.22 * Math.max(-1, Math.min(1, dx / (W * 0.45)));
			spinTo = 1 + 2.2 * Math.max(0, 1 - d / (scale * 0.9));
		}
		host.addEventListener("pointermove", function (e) { var r = host.getBoundingClientRect(); point(e.clientX - r.left, e.clientY - r.top); }, { passive: true });
		host.addEventListener("pointerleave", function () { toX = cx; toY = cy; inclTo = 0.11; rollTo = -0.06; spinTo = 1; });
		var rs; window.addEventListener("resize", function () { clearTimeout(rs); rs = setTimeout(setup, 150); });
		if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { vis = en[0].isIntersecting; go(); }).observe(host);
		document.addEventListener("visibilitychange", go);
		setup();
	})();

	/* ---------- 2. Rocket engine ----------
	   A generic liquid-propellant thrust chamber drawn as solid, shaded parts, the way a CAD
	   exploded view shows it: gimbal mount, propellant dome, injector plate, combustion chamber
	   with throat, and a bolted-on nozzle extension with stiffening rings. Every part is a
	   surface of revolution cut into small faces, which are sorted and painted back to front.
	   The flame is a WebGL shader (2D gradient fallback). */
	var hero = document.querySelector(".hero");
	var canvas = document.querySelector(".engine");
	var thrustEl = document.querySelector(".thrust");
	var gimbalEl = document.querySelector(".gimbal");
	if (!hero || !canvas || !canvas.getContext) return;
	var ctx = canvas.getContext("2d");

	// --- geometry (engine units, throat radius 0.12). Axis is +y (down the screen), y = 0 is the injector face.
	var RE = 0.5, Y_E = 1.74;                           // nozzle exit radius and position
	var PIVOT_Y = -0.15;
	var NSEG = 40, COSJ = [], SINJ = [];
	for (var jj = 0; jj <= NSEG; jj++) { COSJ.push(Math.cos(jj / NSEG * Math.PI * 2)); SINJ.push(Math.sin(jj / NSEG * Math.PI * 2)); }
	function bellCurve(y0, r0, y1, r1, n, a0, a1) {     // quadratic Bezier between two wall angles
		var o = [], ta = Math.tan(a0), tb = Math.tan(a1), yq = (r1 - r0 - tb * y1 + ta * y0) / (ta - tb), rq = r0 + ta * (yq - y0);
		for (var i = 0; i <= n; i++) { var t = i / n, u = 1 - t; o.push([u * u * y0 + 2 * u * t * yq + t * t * y1, u * u * r0 + 2 * u * t * rq + t * t * r1]); }
		return o;
	}
	var PARTS = (function () {
		var i, t, parts = [];
		parts.push({ prof: [[-0.33, 0.001], [-0.33, 0.075], [-0.27, 0.075], [-0.27, 0.045], [-0.19, 0.045], [-0.19, 0.1], [-0.165, 0.1], [-0.165, 0.001]], edge: [1, 2, 5, 6] });   // 0 gimbal mount
		var dome = [[-0.15, 0.05]];
		for (i = 1; i <= 7; i++) { t = i / 7 * Math.PI / 2; dome.push([-0.15 + 0.12 * (1 - Math.cos(t)), 0.05 + 0.19 * Math.sin(t)]); }
		dome.push([-0.03, 0.29], [-0.008, 0.29]);
		parts.push({ prof: dome, edge: [0, 7, 8, 9] });                                                           // 1 propellant dome
		parts.push({ prof: [[0, 0.001], [0, 0.29], [0.028, 0.29], [0.028, 0.001]], edge: [1, 2], plate: true });     // 2 injector plate
		var ch = [[0.04, 0.29], [0.062, 0.29], [0.062, 0.228], [0.36, 0.228]];
		for (i = 1; i <= 7; i++) { t = i / 7; ch.push([0.36 + 0.18 * t, 0.228 - (0.228 - 0.12) * (0.5 - 0.5 * Math.cos(t * Math.PI))]); }
		var dv = bellCurve(0.54, 0.12, 0.8, 0.262, 6, 0.56, 0.42);
		for (i = 1; i < dv.length; i++) ch.push(dv[i]);
		ch.push([0.8, 0.305], [0.822, 0.305]);
		parts.push({ prof: ch, edge: [0, 1, 2, 3, 10, 16, 17, 18] });                                             // 3 combustion chamber with throat
		var nz = [[0.832, 0.305], [0.854, 0.305], [0.854, 0.268]], bl = bellCurve(0.854, 0.268, Y_E, RE, 16, 0.4, 0.17), ed = [0, 1, 2];
		for (i = 1; i < bl.length; i++) {
			if (i === 5 || i === 10) { var b = bl[i]; nz.push([b[0] - 0.012, b[1]], [b[0] - 0.012, b[1] + 0.016], [b[0] + 0.012, b[1] + 0.016], [b[0] + 0.012, b[1]]); ed.push(nz.length - 3, nz.length - 2); }
			else nz.push(bl[i]);
		}
		ed.push(nz.length - 1);
		parts.push({ prof: nz, edge: ed });                                                                       // 4 nozzle extension
		return parts;
	})();
	// faces: [part, yA, rA, yB, rB, segment, edgeA, edgeB]; injector orifices: [part, radius, y, angle]
	var faces = [], holes = [];
	PARTS.forEach(function (pt, pi) {
		for (var k = 1; k < pt.prof.length; k++) for (var j = 0; j < NSEG; j++) {
			faces.push([pi, pt.prof[k - 1][0], pt.prof[k - 1][1], pt.prof[k][0], pt.prof[k][1], j, pt.edge.indexOf(k - 1) >= 0, pt.edge.indexOf(k) >= 0]);
		}
		if (pt.plate) [0.07, 0.14, 0.21].forEach(function (r, ri) { var m = 6 + ri * 6; for (var j = 0; j < m; j++) holes.push([pi, r, -0.001, j / m * Math.PI * 2 + ri * 0.3]); });
	});
	var FN = faces.length, IN = FN + holes.length;
	var fz = new Float32Array(IN), fs = new Float32Array(IN), fc = new Float32Array(IN * 8), ff = new Uint8Array(IN), order = [];
	for (var oi = 0; oi < IN; oi++) order.push(oi);
	var SHADES = [];
	for (var si = 0; si < 48; si++) { var sv = si / 47; SHADES.push("rgb(" + Math.round(14 + 196 * sv) + "," + Math.round(13 + 188 * sv) + "," + Math.round(24 + 214 * sv) + ")"); }
	var LX = -0.48, LY = -0.58, LZ = 0.66;               // light from the upper left, towards the viewer

	// exploded view: how far each part moves along the axis
	var OFF = [
		[0, -0.56, 0],     // 0 gimbal mount
		[0, -0.38, 0],     // 1 propellant dome
		[0, -0.2, 0],      // 2 injector plate
		[0, 0, 0],         // 3 combustion chamber with throat
		[0, 0.38, 0]       // 4 nozzle extension
	];

	// --- state
	var W = 0, H = 0, BX = 0, BW = 0, DPR = 1, cx = 0, top = 0, scale = 1, mobile = false;
	var spin = -0.1, view = 0.3;
	var gx = 0, gz = 0, tgx = 0, tgz = 0;
	var throttle = 0.6, tgtThrottle = 0.6;
	var px = -9999, py = -9999, lpx = -9999, lpy = -9999, lastMove = -1e9;
	var visible = true, raf = 0, lastT = 0, time = 0;
	var explode = 1, hoverEngine = false, tapExploded = false, assembledAt = 0;
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
		if (mobile) { cx = W * 0.68; top = H * 0.17; scale = Math.min(W * 0.29, H * 0.155); }
		else {
			// the text and an empty "engine slot" are laid out as one centred group in CSS; the engine is drawn in the slot
			var slot = hero.querySelector(".engine-slot"), sr = slot && slot.getBoundingClientRect();
			if (sr && sr.width) { cx = sr.left - r.left + sr.width / 2; scale = Math.min(sr.width / 0.95, H * 0.25); }
			else { cx = W * 0.64; scale = Math.min(W * 0.16, H * 0.25); }
			top = H * 0.53 - scale * 0.98;                     // whole exploded engine centred vertically
		}
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

	var q4 = new Float32Array(12), sv0 = Math.sin(0.3), ea = [0, 0, 0], eb = [0, 0, 0];

	function draw() {
		if (!W) return;
		prep();
		ctx.setTransform(DPR, 0, 0, DPR, -BX * DPR, 0);
		ctx.clearRect(BX, 0, BW, H);

		// nozzle exit and plume direction on screen
		setPart(4);
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
			setPart(0); project(0, -0.45, 0, ax, 0);
			setPart(4); project(0, Y_E + 0.12, 0, ax, 3);
			ctx.save(); ctx.setLineDash([10, 5, 2, 5]); ctx.lineWidth = 1;
			ctx.strokeStyle = "rgba(" + wireRGB + "," + (0.55 * ee).toFixed(3) + ")";
			ctx.beginPath(); ctx.moveTo(ax[0], ax[1]); ctx.lineTo(ax[3], ax[4]); ctx.stroke(); ctx.restore();
		}

		/* solid parts: project every face, shade it, then paint back to front */
		var glowR2 = Math.pow(Math.max(140, scale * 0.9), 2), dim = mobile ? 0.6 : 1, i, f, o;
		for (i = 0; i < FN; i++) {
			f = faces[i]; o = i * 8;
			setPart(f[0]);
			var j0 = f[5], j1 = j0 + 1;
			project(f[2] * COSJ[j0], f[1], f[2] * SINJ[j0], q4, 0);
			project(f[2] * COSJ[j1], f[1], f[2] * SINJ[j1], q4, 3);
			project(f[4] * COSJ[j1], f[3], f[4] * SINJ[j1], q4, 6);
			project(f[4] * COSJ[j0], f[3], f[4] * SINJ[j0], q4, 9);
			var ux = (q4[6] - q4[0]) / sc, uy = (q4[7] - q4[1]) / sc, uz = q4[8] - q4[2];
			var wx = (q4[3] - q4[9]) / sc, wy = (q4[4] - q4[10]) / sc, wz = q4[5] - q4[11];
			var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
			var front = nz > 0, d = (nx * LX + ny * LY + nz * LZ) / nl; if (!front) d = -d;
			var sh = 0.07 + 0.88 * Math.pow(Math.max(0, d), 1.6);
			if (!front) sh = 0.05 + sh * 0.32;
			var mx = (q4[0] + q4[6]) / 2, my = (q4[1] + q4[7]) / 2, dx = mx - lpx, dy = my - lpy;
			sh += Math.exp(-(dx * dx + dy * dy) / glowR2) * 0.22;                       // light from the cursor
			if (!front && f[0] === 4) sh += Math.max(0, f[1] - (Y_E - 0.5)) * 0.9 * fire;  // inside of the bell lit by the flame
			fz[i] = (q4[2] + q4[5] + q4[8] + q4[11]) / 4; fs[i] = Math.min(1, sh * dim);
			ff[i] = (front ? 1 : 0) | (f[6] ? 2 : 0) | (f[7] ? 4 : 0);
			fc[o] = q4[0]; fc[o + 1] = q4[1]; fc[o + 2] = q4[3]; fc[o + 3] = q4[4]; fc[o + 4] = q4[6]; fc[o + 5] = q4[7]; fc[o + 6] = q4[9]; fc[o + 7] = q4[10];
		}
		for (i = 0; i < holes.length; i++) {
			f = holes[i]; o = (FN + i) * 8; setPart(f[0]);
			project(f[1] * Math.cos(f[3]), f[2], f[1] * Math.sin(f[3]), q4, 0);
			fz[FN + i] = q4[2] + 0.02; fc[o] = q4[0]; fc[o + 1] = q4[1]; ff[FN + i] = 8;
		}
		order.sort(function (a, b) { return fz[a] - fz[b]; });
		ctx.lineJoin = "round"; ctx.lineCap = "round";
		var edgeCol = "rgba(" + wireRGB + "," + (mobile ? 0.45 : 0.78) + ")";
		for (var n = 0; n < IN; n++) {
			i = order[n]; o = i * 8;
			if (ff[i] & 8) {                                                           // injector orifice, only visible once the dome lifts off
				if (ee < 0.15) continue;
				ctx.fillStyle = "rgba(8,8,14," + Math.min(1, ee * 1.5).toFixed(2) + ")";
				ctx.beginPath(); ctx.ellipse(fc[o], fc[o + 1], sc * 0.013, sc * 0.013 * sv0, 0, 0, 6.2832); ctx.fill();
				continue;
			}
			var col = SHADES[(fs[i] * 47) | 0];
			ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.8;
			ctx.beginPath(); ctx.moveTo(fc[o], fc[o + 1]); ctx.lineTo(fc[o + 2], fc[o + 3]); ctx.lineTo(fc[o + 4], fc[o + 5]); ctx.lineTo(fc[o + 6], fc[o + 7]); ctx.closePath();
			ctx.fill(); ctx.stroke();
			if ((ff[i] & 1) && (ff[i] & 6)) {                                          // feature edges: flanges, rings, lips
				ctx.strokeStyle = edgeCol; ctx.lineWidth = 1;
				ctx.beginPath();
				if (ff[i] & 2) { ctx.moveTo(fc[o], fc[o + 1]); ctx.lineTo(fc[o + 2], fc[o + 3]); }
				if (ff[i] & 4) { ctx.moveTo(fc[o + 6], fc[o + 7]); ctx.lineTo(fc[o + 4], fc[o + 5]); }
				ctx.stroke();
			}
		}
	}

	function tick(t) {
		raf = 0;
		if (!visible || document.hidden) return;
		var dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016); lastT = t; time += dt;
		var active = t - lastMove < 1600;
		if (!assembledAt) assembledAt = t + 600;            // start in exploded view, then assemble and ignite
		var target = hoverEngine || tapExploded ? 0 : 1;   // rests as an exploded drawing; hover or tap assembles it and fires
		explode += (target - explode) * (target > explode ? 0.05 : 0.035);
		if (hudMode) {
			var mode = explode > 0.5 ? "Exploded view" : "Liquid rocket engine · wireframe";
			if (hudMode.textContent !== mode) hudMode.textContent = mode;
		}
		tgtThrottle = active && !hoverEngine ? 1 : 0.6;
		throttle += (tgtThrottle - throttle) * 0.04;
		spin += dt * 0.2;                                    // slow turn, so the parts read as solid
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
			var y0 = top + (explode > 0.5 ? -0.9 : -0.4) * scale, y1 = top + (explode > 0.5 ? 2.4 : 1.85) * scale;
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
