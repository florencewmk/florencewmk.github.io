/* Homepage hero: a live three.js rocket engine flying into the star field.

   The engine is built from surfaces of revolution (cooling-tube bell, chamber, injector dome,
   gimbal mount) with metal materials lit by a small studio environment. The exhaust is a
   ray-marched glowing gas volume: bright pink-white at the nozzle, widening into a billowing
   magenta-violet trail with turbulent edges (like Starship's methane plume at altitude).
   The engine points into the screen towards the star field's vanishing point, so the plume
   trails back towards the viewer. Hovering the engine boosts it: longer, brighter plume,
   faster gas, more vibration, and the stars (home.js) rush past faster.
   If WebGL is unavailable the rendered video in the same slot stays in place. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const hero = document.querySelector(".home .hero");
const slot = hero && hero.querySelector(".engine-slot");
if (hero && slot) start();

function start() {
	const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const canvas = document.createElement("canvas");
	canvas.className = "engine3d";
	canvas.setAttribute("aria-hidden", "true");

	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
	} catch (e) { return; }                                   // no WebGL: keep the video
	if (!renderer.capabilities.isWebGL2) { renderer.dispose(); return; }
	hero.insertBefore(canvas, hero.querySelector(".hero-inner"));
	renderer.setClearColor(0x000000, 1);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
	camera.position.set(0, 0, 30);

	// ---------- studio environment for the metal reflections ----------
	const pmrem = new THREE.PMREMGenerator(renderer);
	const env = new THREE.Scene();
	env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x07070b, side: THREE.BackSide })));
	const panel = (w, h, col, pos) => {
		const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
		m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
	};
	panel(10, 7, new THREE.Color(5, 4.8, 4.6), [-9, 8, 7]);        // key softbox, upper left front
	panel(6, 12, new THREE.Color(1.6, 1.1, 3.6), [10, 2, -8]);     // lilac rim, behind right
	panel(14, 3, new THREE.Color(0.5, 0.5, 0.7), [0, -11, 4]);     // faint bounce below
	panel(4, 8, new THREE.Color(2.4, 1.0, 2.6), [-10, -2, -6]);    // pink kicker
	scene.environment = pmrem.fromScene(env, 0.035).texture;

	scene.add(new THREE.AmbientLight(0x404060, 0.15));
	const key = new THREE.DirectionalLight(0xfff4ea, 1.6); key.position.set(-6, 8, 9); scene.add(key);
	const rim = new THREE.DirectionalLight(0xb49cff, 2.2); rim.position.set(8, 3, -6); scene.add(rim);

	// ---------- the engine (local +Y is the nose; nozzle exit at y = 0) ----------
	const engine = new THREE.Group();
	const ribMap = (() => {                                       // normal map: vertical regenerative cooling tubes
		const c = document.createElement("canvas"); c.width = 64; c.height = 4;
		const g = c.getContext("2d");
		for (let x = 0; x < 64; x++) {
			const nx = Math.sin(x / 64 * Math.PI * 2) * 0.7, nz = Math.sqrt(1 - nx * nx);
			g.fillStyle = `rgb(${Math.round(128 + 127 * nx)},128,${Math.round(128 + 127 * nz)})`;
			g.fillRect(x, 0, 1, 4);
		}
		const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(180, 1); t.anisotropy = 8;
		return t;
	})();
	const graphite = new THREE.MeshPhysicalMaterial({ color: 0x2b2b31, metalness: 0.95, roughness: 0.36, normalMap: ribMap, normalScale: new THREE.Vector2(0.9, 0.9), side: THREE.DoubleSide });
	const satin = new THREE.MeshPhysicalMaterial({ color: 0xb4b4bc, metalness: 1, roughness: 0.24, clearcoat: 0.3 });
	const steel = new THREE.MeshPhysicalMaterial({ color: 0x8c8c96, metalness: 1, roughness: 0.3 });
	const dark = new THREE.MeshStandardMaterial({ color: 0x141418, metalness: 0.7, roughness: 0.45 });
	const lilac = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.75, 2.2) });

	const lathe = (pts, mat, seg = 128) => {
		const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
		engine.add(m); return m;
	};
	const ring = (r, y, tube, mat) => {
		const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 16, 128), mat);
		m.rotation.x = Math.PI / 2; m.position.y = y; engine.add(m); return m;
	};
	const bellR = (y) => 0.32 + 0.74 * Math.pow((2 - y) / 2, 1.55);
	const bell = []; for (let i = 0; i <= 60; i++) { const y = 2 * i / 60; bell.push([bellR(y), y]); }
	lathe(bell, graphite, 360);
	ring(bellR(0) + 0.012, 0, 0.03, satin);
	for (const y of [0.42, 0.92, 1.38]) ring(bellR(y) + 0.02, y, 0.022, satin);
	ring(bellR(0.7) + 0.07, 0.7, 0.055, steel);
	lathe([[0.32, 2.0], [0.36, 2.15], [0.45, 2.35], [0.46, 2.42], [0.46, 3.08]], satin);
	lathe([[0.469, 2.72], [0.469, 2.76]], lilac);
	ring(0.47, 2.42, 0.03, steel);
	ring(0.49, 3.1, 0.07, steel);
	lathe([[0.47, 3.1], [0.44, 3.22], [0.34, 3.34], [0.18, 3.43], [0.001, 3.46]], new THREE.MeshPhysicalMaterial({ color: 0x3a3a42, metalness: 0.95, roughness: 0.35 }));
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 32), steel); post.position.y = 3.6; engine.add(post);
	const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.55), dark); plate.position.y = 3.8; engine.add(plate);
	ring(0.2, 3.62, 0.035, satin);
	for (let k = 0; k < 4; k++) {
		const a = k / 4 * Math.PI * 2 + Math.PI / 4, p0 = new THREE.Vector3(0.2 * Math.cos(a), 3.62, 0.2 * Math.sin(a)), p1 = new THREE.Vector3(0.36 * Math.cos(a), 3.76, 0.36 * Math.sin(a));
		const d = p1.clone().sub(p0), s = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, d.length(), 10), steel);
		s.position.copy(p0).add(p1).multiplyScalar(0.5); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); engine.add(s);
	}
	// hot glow at the throat and across the exit plane, seen inside the bell
	const glowTex = (() => {
		const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
		const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
		r.addColorStop(0, "rgba(255,240,255,1)"); r.addColorStop(0.35, "rgba(255,150,240,.7)"); r.addColorStop(1, "rgba(160,60,255,0)");
		g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
	})();
	const disc = (rad, y, op) => {
		const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 48), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
		m.rotation.x = -Math.PI / 2; m.position.y = y; engine.add(m); return m;
	};
	const throatGlow = disc(0.45, 1.98, 1.0), exitGlow = disc(1.15, 0.03, 0.55);
	const bellLight = new THREE.PointLight(0xff8cf0, 6, 3.5, 2); bellLight.position.y = 0.6; engine.add(bellLight);
	const exhaustLight = new THREE.PointLight(0xe07cff, 18, 14, 2); exhaustLight.position.y = -1.2; engine.add(exhaustLight);

	// ---------- exhaust plume: ray-marched glowing gas ----------
	const PL = 16, PR = 4.0;                                     // proxy volume: length and radius
	const plumeMat = new THREE.ShaderMaterial({
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
		uniforms: { uTime: { value: 0 }, uBoost: { value: 0 }, uLen: { value: 9 }, uSteps: { value: 28 } },
		vertexShader: `
			varying vec3 vPos; varying vec3 vCam;
			void main() {
				vPos = position;
				vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: `
			precision highp float;
			uniform float uTime, uBoost, uLen; uniform int uSteps;
			varying vec3 vPos; varying vec3 vCam;
			// Ashima simplex noise
			vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
			vec4 perm(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 tis(vec4 r){return 1.79284291400159-.85373472095314*r;}
			float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
				vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
				vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
				i=mod289(i);vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
				float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
				vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
				vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
				vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
				vec4 norm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
				vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
				return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
			float fbm(vec3 p){float s=0.,a=.6;for(int i=0;i<3;i++){s+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
			float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}

			// gas density and colour at a point (local space: plume runs down -y from the nozzle exit)
			vec4 gas(vec3 p){
				float t = -p.y / uLen;                       // 0 at the exit, 1 at the tail
				if (t < 0.0 || t > 1.0) return vec4(0.0);
				float flow = uTime * (2.2 + 3.0 * uBoost);    // gas streams away from the nozzle
				vec3 q = vec3(p.x, p.y + flow, p.z);
				float n = fbm(q * vec3(0.55, 0.32, 0.55));    // big billows, stretched along the flow
								float R = mix(0.9, 2.1, pow(t, 0.8)) * (1.0 + 0.3 * n);
				vec2 off = vec2(n, -0.6 * n) * (0.1 + 0.7 * t);   // the trail meanders
				float r = length(p.xz - off);
				float edge = 1.0 - smoothstep(R * 0.35, R * (1.0 + 0.2 * n), r);
				float along = smoothstep(1.0, 0.55, t) * (0.65 + 0.35 * smoothstep(0.0, 0.06, t));
				float body = edge * along * clamp(0.55 + 1.0 * n, 0.0, 1.6);
				float core = exp(-r * r / 0.22) * exp(-t * (7.0 - 3.0 * uBoost));     // white-hot just behind the exit
				vec3 hot = vec3(1.0, 0.86, 1.0), pink = vec3(1.0, 0.38, 0.92), violet = vec3(0.55, 0.32, 1.0);
				vec3 col = mix(pink, violet, smoothstep(0.15, 0.9, t + 0.25 * n));
				col = col * body * (0.9 + 0.6 * uBoost) + hot * core * (1.6 + 1.2 * uBoost);
				return vec4(col, body + core);
			}

			void main() {
				vec3 ro = vCam, rd = normalize(vPos - vCam);
				// march from the entry point to where the ray leaves the proxy cylinder
				float tEnter = length(vPos - vCam);
				float tExit = 1e4;
				vec2 o = ro.xz, d = rd.xz; float A = dot(d,d), B = dot(o,d), Cc = dot(o,o) - ${PR.toFixed(2)}*${PR.toFixed(2)};
				float disc = B*B - A*Cc; if (disc > 0.0 && A > 1e-6) tExit = (-B + sqrt(disc)) / A;
				if (abs(rd.y) > 1e-5) { float ty0 = (0.0 - ro.y)/rd.y, ty1 = (-${PL.toFixed(1)} - ro.y)/rd.y; tExit = min(tExit, max(ty0, ty1)); }
				float len = max(tExit - tEnter, 0.0);
				float dt = len / float(uSteps);
				float t = tEnter + dt * hash(gl_FragCoord.xy);
				vec3 acc = vec3(0.0); float trans = 1.0;
				for (int i = 0; i < 40; i++) {
					if (i >= uSteps) break;
					vec4 g = gas(ro + rd * t);
					acc += trans * g.rgb * dt * 0.2;
					trans *= exp(-g.a * dt * 0.08);           // a little self-shadowing so the billows read as 3D
					t += dt;
				}
				gl_FragColor = vec4(acc, 1.0);
			}`
	});
	const plumeGeo = new THREE.CylinderGeometry(PR, PR, PL, 48, 1, false); plumeGeo.translate(0, -PL / 2, 0);
	const plume = new THREE.Mesh(plumeGeo, plumeMat); plume.renderOrder = 2; engine.add(plume);

	// the engine flies into the screen, towards the star field's vanishing point (top right)
	const rig = new THREE.Group(); rig.add(engine); scene.add(rig);
	const heading = new THREE.Vector3(0.34, 0.84, -0.42).normalize();
	rig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), heading);

	// ---------- post: bloom ----------
	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.42);
	composer.addPass(bloom);
	composer.addPass(new OutputPass());

	// ---------- layout: engine sits in the hero's engine slot ----------
	let W = 1, H = 1, pxPerUnit = 1, mobile = false, dpr = 1;
	const enginePx = new THREE.Vector2();
	function layout() {
		const r = hero.getBoundingClientRect(), s = slot.getBoundingClientRect();
		W = Math.max(1, r.width); H = Math.max(1, r.height); mobile = W < 760;
		dpr = mobile ? 0.6 : 0.7;                                // draw the 3D layer at reduced resolution (the soft plume hides it): about half the pixels to shade
		renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); composer.setPixelRatio(dpr); composer.setSize(W, H);
		camera.aspect = W / H; camera.updateProjectionMatrix();
		pxPerUnit = H / (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
		// slot centre (engine body sits a little above it so the plume has room below)
		const sx = s.left - r.left + s.width / 2, sy = s.top - r.top + s.height * (mobile ? 0.3 : 0.4);
		enginePx.set(sx, sy);
		rig.position.set((sx - W / 2) / pxPerUnit, -(sy - H / 2) / pxPerUnit, 0);
		const wantPx = mobile ? Math.min(s.width * 0.95, 300) : Math.max(190, Math.min(s.width * 1.5, H * 0.68));       // engine height on screen
		rig.scale.setScalar(wantPx / pxPerUnit / 4.0);
		plumeMat.uniforms.uSteps.value = mobile ? 20 : 28;
	}
	layout();
	window.addEventListener("resize", layout);
	if (window.ResizeObserver) new ResizeObserver(layout).observe(hero);

	// ---------- hover boost ----------
	let boost = 0, boostTarget = 0;
	function onMove(e) {
		const r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
		const rad = rig.scale.x * 4.0 * pxPerUnit * 0.62;
		const over = Math.hypot(x - enginePx.x, (y - enginePx.y) * 0.8) < rad && !(e.target.closest && e.target.closest("a, button, .nav"));
		boostTarget = over ? 1 : 0;
		hero.classList.toggle("engine-hover", over);
	}
	hero.addEventListener("pointermove", onMove);
	hero.addEventListener("pointerleave", () => { boostTarget = 0; hero.classList.remove("engine-hover"); });
	hero.addEventListener("touchstart", (e) => { const t = e.touches[0]; if (t) { onMove({ clientX: t.clientX, clientY: t.clientY, target: e.target }); setTimeout(() => { boostTarget = 0; }, 1800); } }, { passive: true });

	// ---------- animation ----------
	const clock = new THREE.Clock();
	let time = 0, raf = 0, visible = true, shown = false, slow = 0;
	const baseQ = rig.quaternion.clone(), wob = new THREE.Quaternion(), e3 = new THREE.Euler();
	let lastFrame = 0, slowFrames = 0;
	let stopped = false;
	function giveUp() {
		stopped = true; if (raf) cancelAnimationFrame(raf); raf = 0;
		window.__engineBoost = 0; hero.classList.remove("engine-live", "engine-hover");
		canvas.remove(); renderer.dispose();
	}
	function frame(now) {
		raf = 0;
		if (stopped) return;
		if (now && now - lastFrame < 14) { raf = requestAnimationFrame(frame); return; }   // cap at 60 fps (even pacing on 60 Hz and 120 Hz screens)
		const gap = now - lastFrame;
		if (lastFrame && gap > 30 && gap < 400) slowFrames++; else slowFrames = Math.max(0, slowFrames - 0.5);   // gaps over 400 ms are a hidden tab, not slowness
		lastFrame = now || performance.now();
		if (slowFrames > 20) {                                          // struggling: drop quality a step
			slowFrames = 0;
			const u0 = plumeMat.uniforms.uSteps;
			if (u0.value > 16) u0.value -= 6;
			else if (bloom.enabled) bloom.enabled = false;
			else { giveUp(); return; }                                       // still too slow: fall back to the rendered video
		}
		const dt = Math.min(0.05, clock.getDelta());
		time += dt;
		boost += (boostTarget - boost) * (boostTarget > boost ? 0.06 : 0.035);
		window.__engineBoost = boost;                            // read by the star field in home.js
		const u = plumeMat.uniforms; u.uTime.value = time; u.uBoost.value = boost; u.uLen.value = 8 + 5 * boost;
		// flight: gentle drift, slow roll and a fine engine vibration that grows with thrust
		e3.set(Math.sin(time * 0.35) * 0.035, time * 0.1, Math.sin(time * 0.27) * 0.03);   // slow, smooth drift and roll (no shaking)
		wob.setFromEuler(e3); rig.quaternion.copy(baseQ).multiply(wob);
		engine.position.set(0, -boost * 0.2, 0);
		const flick = 0.93 + 0.07 * Math.sin(time * 9.0) * Math.sin(time * 5.3);
		exhaustLight.intensity = (8 + 10 * boost) * flick; bellLight.intensity = (5 + 6 * boost) * flick;
		throatGlow.material.opacity = 0.9 + 0.1 * flick; exitGlow.material.opacity = (0.35 + 0.25 * boost) * flick;
		bloom.strength = 0.5 + 0.25 * boost;
		composer.render();
		if (!shown) { shown = true; hero.classList.add("engine-live"); }
		if (!reduceMotion && visible && !document.hidden) raf = requestAnimationFrame(frame);
	}
	if (window.IntersectionObserver) new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible && !raf && !reduceMotion) raf = requestAnimationFrame(frame); }).observe(hero);
	document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf && !reduceMotion) { clock.getDelta(); raf = requestAnimationFrame(frame); } });
	raf = requestAnimationFrame(frame);
}
