/* About page: Gargantua-style black hole in Three.js (the video in life.html is only the fallback).

   What Three.js adds over the plain-WebGL / video versions:
   - A real 3D camera orbiting the hole. Moving the pointer changes the viewing angle, so the
     light bending is recomputed from the new position instead of the picture being warped.
   - HDR rendering into a half-float target, then UnrealBloomPass (thresholded, multi-scale
     glow) and ACES Filmic tone mapping in OutputPass, the same chain film renderers use.
   - Endless motion without a loop seam.

   The physics is in the fragment shader: each pixel's photon is integrated through the
   Schwarzschild metric (units of the Schwarzschild radius, r_s = 1), using the photon orbit
   equation a = -1.5 h^2 r / |r|^5. Disk crossings are shaded with a thin-disk (Novikov-Thorne
   style) flux profile, blackbody colour from the local temperature and gravitational redshift.
   Doppler colour shift is kept very faint, as it was switched off for Interstellar
   (James, von Tunzelmann, Franklin & Thorne 2015). */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* Performance layout: ONE fixed, full-window WebGL canvas behind the page draws everything.
   1. the star field and constellations (cheap; redrawn ~30 times a second when nothing else moves)
   2. the black hole, ray-traced into a small off-screen target that covers only a box around the
      hole, with bloom and tone mapping, then added on top of the sky at the hole's place on the
      screen (additive, so the stars show through the dark parts and nothing has to be blended by
      the browser). The black hole is only traced while the top of the page is on screen. */

const hero = document.querySelector(".about-hero");
const slot = hero && hero.querySelector(".bh-slot");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Constellations with real star positions (J2000 right ascension and declination in degrees,
   visual magnitude). Each is projected onto a small patch of sky the way it looks from Earth,
   then placed at a fixed spot on the screen, away from the text. Faint lines join the figure. */
const FIGURES = [
	{ name: "Big Dipper", at: [-0.8, 0.66], size: 0.12, stars: [
		[165.93, 61.75, 1.8], [165.46, 56.38, 2.4], [178.46, 53.69, 2.4], [183.86, 57.03, 3.3],
		[193.51, 55.96, 1.8], [200.98, 54.93, 2.2], [206.89, 49.31, 1.9]],
	  lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] },
	{ name: "Cassiopeia", at: [0.62, 0.74], size: 0.08, stars: [
		[2.29, 59.15, 2.3], [10.13, 56.54, 2.2], [14.18, 60.72, 2.2], [21.45, 60.24, 2.7], [28.60, 63.67, 3.4]],
	  lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
	{ name: "Orion", at: [-0.84, -0.5], size: 0.14, stars: [
		[88.79, 7.41, 0.5, 1], [78.63, -8.20, 0.1, 2], [81.28, 6.35, 1.6], [86.94, -9.67, 2.1],
		[85.19, -1.94, 1.8], [84.05, -1.20, 1.7], [83.00, -0.30, 2.2], [83.78, 9.93, 3.4]],
	  lines: [[7, 0], [7, 2], [0, 4], [2, 6], [6, 5], [5, 4], [4, 3], [6, 1]] },
	{ name: "Scorpius", at: [0.84, -0.48], size: 0.15, stars: [
		[241.36, -19.81, 2.6], [240.08, -22.62, 2.3], [239.71, -26.11, 2.9], [245.30, -25.59, 2.9],
		[247.35, -26.43, 1.0, 1], [248.97, -28.22, 2.8], [252.54, -34.29, 2.3], [252.97, -38.05, 3.0],
		[254.66, -42.36, 3.6], [258.04, -43.24, 3.3], [264.33, -43.00, 1.9], [266.90, -40.13, 3.0],
		[265.62, -39.03, 2.4], [263.40, -37.10, 1.6], [262.69, -37.30, 2.7]],
	  lines: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14]] },
	{ name: "Southern Cross", at: [0.5, -0.86], size: 0.06, stars: [
		[186.65, -63.10, 0.8, 2], [191.93, -59.69, 1.3, 2], [187.79, -57.11, 1.6, 1], [183.79, -58.75, 2.8], [185.34, -60.40, 3.6]],
	  lines: [[2, 0], [1, 3]] },
];
function constellations(starMat) {
	const D = Math.PI / 180, group = new THREE.Group(), items = [];
	const lineMat = new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
	const tints = [[1, .97, .92], [1, .72, .45], [.78, .86, 1]];       // white, orange (Betelgeuse, Antares), blue-white
	for (const f of FIGURES) {
		// centre of the figure, then a gnomonic projection (seen from inside the sky, so east is left)
		let sx = 0, sy = 0, sz = 0;
		for (const [ra, de] of f.stars) { sx += Math.cos(de * D) * Math.cos(ra * D); sy += Math.cos(de * D) * Math.sin(ra * D); sz += Math.sin(de * D); }
		const a0 = Math.atan2(sy, sx), d0 = Math.atan2(sz, Math.hypot(sx, sy));
		const xy = f.stars.map(([ra, de]) => {
			const a = ra * D - a0, d = de * D;
			const c = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a);
			return [-Math.cos(d) * Math.sin(a) / c, (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a)) / c];
		});
		const ext = Math.max(...xy.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
		const n = f.stars.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
		xy.forEach(([x, y], i) => {
			pos.set([x / ext, y / ext, 0], i * 3);
			const mag = f.stars[i][2], t = tints[f.stars[i][3] || 0], b = Math.min(1, 0.55 + (3.6 - mag) * 0.16);
			col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
			size[i] = 2.4 + (3.6 - mag) * 0.95;
			ph[i] = Math.random() * 100;
		});
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		g.setAttribute("color", new THREE.BufferAttribute(col, 3));
		g.setAttribute("size", new THREE.BufferAttribute(size, 1));
		g.setAttribute("phase", new THREE.BufferAttribute(ph, 1));
		const lp = new Float32Array(f.lines.length * 6);
		f.lines.forEach(([i, j], k) => { lp.set([pos[i * 3], pos[i * 3 + 1], 0, pos[j * 3], pos[j * 3 + 1], 0], k * 6); });
		const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
		const fig = new THREE.Group();
		fig.add(new THREE.LineSegments(lg, lineMat));
		fig.add(new THREE.Points(g, starMat));
		group.add(fig);
		items.push({ fig, f });
	}
	// put each figure at its screen spot (fractions of the half-width/height) at distance 100
	function place(cam) {
		const ty = Math.tan(cam.fov * D / 2), tx = ty * cam.aspect, R = 100, portrait = cam.aspect < 1;
		for (const { fig, f } of items) {
			const fx = f.at[0] * (portrait ? 0.8 : 1), fy = f.at[1] * (portrait ? 0.9 : 1);
			const dir = new THREE.Vector3(fx * tx, fy * ty, -1).normalize();
			fig.position.copy(dir).multiplyScalar(R);
			fig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate());
			const s = f.size * R * ty * (portrait ? 1.25 : 1);
			fig.scale.set(s, s, s);
		}
	}
	return { group, place };
}


function makeSky(renderer) {
	const scene = new THREE.Scene();
	const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
	const N = 7000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
	const tint = [[1, 1, 1], [1, .93, .82], [.85, .9, 1], [1, .86, .7], [.92, .95, 1]];
	for (let i = 0; i < N; i++) {
		const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, rr = 80 + Math.random() * 120, q = Math.sqrt(1 - u * u);
		pos.set([q * Math.cos(a) * rr, u * rr, q * Math.sin(a) * rr], i * 3);
		const t = tint[Math.random() < .7 ? 0 : 1 + Math.floor(Math.random() * 4)];
		const b = 0.5 + 0.5 * Math.pow(Math.random(), 2.4);
		col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
		size[i] = Math.random() < 0.015 ? 3.6 + Math.random() * 2 : 1.1 + Math.pow(Math.random(), 2.3) * 2.4;
		ph[i] = Math.random() * 100;
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setAttribute("color", new THREE.BufferAttribute(col, 3));
	g.setAttribute("size", new THREE.BufferAttribute(size, 1));
	g.setAttribute("phase", new THREE.BufferAttribute(ph, 1));
	const m = new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uH: { value: 800 } },
		transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
		vertexShader: `attribute float size; attribute float phase; attribute vec3 color; uniform float uTime, uPR, uH;
			varying vec3 vC; varying float vA;
			void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
				gl_PointSize = size * uPR * (120. / -mv.z) * (uH / 900.) + uPR * .6;
				vA = .72 + .28 * sin(uTime * (.6 + fract(phase) * 1.6) + phase); vC = color; }`,
		fragmentShader: `varying vec3 vC; varying float vA;
			void main(){ vec2 d = gl_PointCoord - .5; float r = length(d); float a = smoothstep(.5, .0, r); a *= a;
				gl_FragColor = vec4(vC * a * vA * 1.9, 1.); }`,
	});
	const sky = new THREE.Group();
	sky.add(new THREE.Points(g, m));
	const figures = constellations(m);
	sky.add(figures.group);
	scene.add(sky);
	let mx = 0, my = 0, tx = 0, ty = 0;
	window.addEventListener("pointermove", (e) => { tx = e.clientX / window.innerWidth - .5; ty = e.clientY / window.innerHeight - .5; }, { passive: true });
	return {
		scene, cam,
		resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); m.uniforms.uH.value = h; m.uniforms.uPR.value = renderer.getPixelRatio(); figures.place(cam); },
		update(dt) {
			if (!reduceMotion) { const t = (m.uniforms.uTime.value += dt); sky.rotation.y = Math.sin(t * .021) * .035; sky.rotation.x = Math.sin(t * .017) * .02; }
			mx += (tx - mx) * .03; my += (ty - my) * .03;
			cam.rotation.set(-my * .05, -mx * .06, 0);
		},
	};
}

function makeHole(renderer, texture) {
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.colorSpace = THREE.NoColorSpace;
	const uniforms = {
		uTime: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(1, 1) }, uScale: { value: 1 },
		uCamPos: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() }, uFwd: { value: new THREE.Vector3() },
		uTex: { value: texture },
	};
	const material = new THREE.ShaderMaterial({
		uniforms, depthTest: false, depthWrite: false,
		vertexShader: "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }",
		fragmentShader: /* glsl */`
			uniform float uTime; uniform vec2 uCenter; uniform vec2 uRes; uniform float uScale;
			uniform vec3 uCamPos, uRight, uUp, uFwd; uniform sampler2D uTex;
			const float RIN = 2.6;      // inner edge of the disk (Gargantua spins fast, so it sits close)
			const float ROUT = 20.0;
			const float PI = 3.14159265;

			float hash(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }

			// point stars on two grids of directions, so the lensing of the sky is visible
			vec3 stars(vec3 d){
				vec3 col = vec3(0.);
				for (int l = 0; l < 2; l++) {
					float s = l == 0 ? 160. : 380.;
					vec3 q = d * s, id = floor(q);
					float h = hash(id + float(l) * 17.);
					if (h > (l == 0 ? .975 : .988)) {
						vec3 o = vec3(hash(id + 1.3), hash(id + 2.7), hash(id + 4.1)) * .6 + .2;
						float b = pow((h - .97) * 33., 3.) * (l == 0 ? .7 : .35);
						col += b * smoothstep(.2, 0., length(fract(q) - o)) * mix(vec3(1., .9, .8), vec3(.85, .9, 1.), hash(id + 9.));
					}
				}
				return col;
			}

			// blackbody colour (approximation, normalised), T in kelvin
			vec3 blackbody(float T){
				T = clamp(T, 1000., 12000.) / 100.;
				vec3 c;
				c.r = T <= 66. ? 1. : clamp(1.293 * pow(T - 60., -0.1332), 0., 1.);
				c.g = T <= 66. ? clamp(0.3901 * log(T) - 0.6318, 0., 1.) : clamp(1.1298 * pow(T - 60., -0.0755), 0., 1.);
				c.b = T >= 66. ? 1. : (T <= 19. ? 0. : clamp(0.5432 * log(T - 10.) - 1.1963, 0., 1.));
				return c;
			}

			// gas pattern, carried round at the Kepler rate; two phases cross-faded so the
			// differential rotation never winds the pattern into thin rings
			float gas(float r, float a, float t, float ch){
				float w = pow(r / RIN, -1.5);
				float u = fract(2. * (a - t * 0.55 * w) / (2. * PI) + ch * .5);
				vec4 s = texture2D(uTex, vec2(u, (r - RIN) / (ROUT - RIN)));
				return (ch < .5 ? s.r : s.g) * 5. - 2.5;
			}

			void main(){
				vec2 uv = (gl_FragCoord.xy - uCenter) / uScale;
				vec3 v = normalize(uFwd + uRight * uv.x + uUp * uv.y);
				vec3 p = uCamPos;
				vec3 hv = cross(p, v); float h2 = dot(hv, hv);
				vec3 col = vec3(0.); float trans = 1.; bool escaped = false;

				float P = 40., f1 = fract(uTime / P), f2 = fract(uTime / P + .5), w = 1. - abs(1. - 2. * f1);
				float camR = length(uCamPos);

				for (int i = 0; i < 190; i++) {
					float r2 = dot(p, p), r = sqrt(r2);
					if (r2 < 1.) { trans = 0.; break; }                                  // crossed the horizon
					if (r > camR * 1.3 && dot(p, v) > 0.) { escaped = true; break; }
					float dt = clamp(.06 * r * min(1., r * .45), .014, 3.5);
					vec3 a = -1.5 * h2 * p / (r2 * r2 * r);
					vec3 vh = v + a * dt * .5;
					vec3 np = p + vh * dt;
					float nr2 = dot(np, np);
					v = vh - 1.5 * h2 * np / (nr2 * nr2 * sqrt(nr2)) * dt * .5;
					if (p.y * np.y < 0.) {
						vec3 q = mix(p, np, p.y / (p.y - np.y));
						float rr = length(q.xz);
						if (rr > RIN * .97 && rr < ROUT) {
							float ang = atan(q.z, q.x);
							float n = (w * gas(rr, ang, f1 * P + 7., 0.) + (1. - w) * gas(rr, ang, f2 * P + 7., 1.)) / sqrt(w * w + (1. - w) * (1. - w));
							float lane = texture2D(uTex, vec2(.25, (rr - RIN) / (ROUT - RIN))).b * 2.;
							float dens = (.75 + .25 * lane) * pow(clamp(.82 + .34 * n, .12, 2.4), 1.6);
							float edge = smoothstep(RIN * .97, RIN * 1.12, rr) * (1. - smoothstep(ROUT * .35, ROUT, rr));
							float al = clamp(dens * 1.4, 0., 1.) * edge;
							// thin-disk flux and temperature (rough Novikov-Thorne shape, never zero at the edge)
							float x = RIN / rr;
							float F = x * x * x * max(1. - .85 * sqrt(x), .08);
							float T = 6600. * pow(F / .12, .25);
							float g = sqrt(max(1. - 1. / rr, .02));                           // gravitational redshift
							float beta = sqrt(.5 / rr);
							vec3 tg = vec3(-q.z, 0., q.x) / rr;
							float dop = sqrt(1. - beta * beta) / (1. - beta * dot(tg, -normalize(v)));
							float D = g * (1. + .06 * (dop - 1.));                             // Doppler almost off
							vec3 c = blackbody(T * D) * F * pow(D, 4.) * 28.;
							col += trans * c * dens * al;
							trans *= 1. - al * .92;
						}
					}
					p = np;
					if (trans < .01) break;
				}
				// the sky comes from the page-wide star field behind this canvas (screen-blended)
				// fade towards the canvas edges so the box never shows
				vec2 e = gl_FragCoord.xy / uRes;
				col *= smoothstep(0., .16, e.x) * smoothstep(1., .84, e.x) * smoothstep(0., .2, e.y) * smoothstep(1., .8, e.y);
				gl_FragColor = vec4(col, 1.);
			}`,
	});
	const scene = new THREE.Scene();
	scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
	const qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
	const composer = new EffectComposer(renderer, target);
	composer.renderToScreen = false;
	composer.addPass(new RenderPass(scene, qcam));
	composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.32, 0.38));
	composer.addPass(new OutputPass());

	// on-screen sprite that adds the traced image onto the sky
	const overlay = new THREE.Scene(), ocam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
	const omat = new THREE.ShaderMaterial({
		uniforms: { map: { value: null } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
		vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
		fragmentShader: "uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.); }",
	});
	const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), omat);
	overlay.add(quad);

	// the camera that orbits the hole; the shader reads its position and axes
	const DIST = 46, BASE_INC = THREE.MathUtils.degToRad(4.5), BASE_ROLL = THREE.MathUtils.degToRad(-9), D2R = THREE.MathUtils.degToRad;
	let inc = BASE_INC, az = 0, roll = 0, incTo = BASE_INC, azTo = 0, rollTo = 0, offX = 0, offY = 0, offXTo = 0, offYTo = 0;
	const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
	function aim() {
		eye.set(Math.sin(az) * Math.cos(inc), Math.sin(inc), -Math.cos(az) * Math.cos(inc)).multiplyScalar(DIST);
		fwd.copy(eye).multiplyScalar(-1).normalize();
		right.crossVectors(Y, fwd).normalize();
		up.crossVectors(fwd, right);
		const c = Math.cos(BASE_ROLL + roll), s = Math.sin(BASE_ROLL + roll);
		const r2 = right.clone().multiplyScalar(c).addScaledVector(up, s);
		up.multiplyScalar(c).addScaledVector(right, -s); right.copy(r2);
		uniforms.uCamPos.value.copy(eye); uniforms.uFwd.value.copy(fwd); uniforms.uRight.value.copy(right); uniforms.uUp.value.copy(up);
	}
	// pointer anywhere on the page: above = look down onto the disk, below = from underneath,
	// sideways = swing round and roll; the hole also drifts a little towards the pointer
	window.addEventListener("pointermove", (e) => {
		const s = slot.getBoundingClientRect();
		const px = e.clientX - (s.left + s.width / 2), py = e.clientY - (s.top + s.height / 2);
		const dx = THREE.MathUtils.clamp(px / (window.innerWidth * 0.5), -1, 1), dy = THREE.MathUtils.clamp(py / (window.innerHeight * 0.5), -1, 1);
		incTo = BASE_INC - dy * D2R(dy < 0 ? 20 : 16); azTo = dx * D2R(30); rollTo = -dx * D2R(7);
		const d = Math.hypot(px, py) || 1, pull = Math.min(28, d * 0.05);
		offXTo = px / d * pull; offYTo = py / d * pull;
	}, { passive: true });
	document.documentElement.addEventListener("pointerleave", () => { azTo = 0; incTo = BASE_INC; rollTo = 0; offXTo = offYTo = 0; });

	let BW = 0, BH = 0, q = Math.min(window.devicePixelRatio || 1, 1);
	function size() {
		const s = slot.getBoundingClientRect(), r = hero.getBoundingClientRect();
		BW = Math.round(Math.min(window.innerWidth * 1.1, s.width * 2.2)); BH = Math.round(Math.min(r.height * 1.3, s.width * 1.45));
		composer.setPixelRatio(q); composer.setSize(BW, BH);
		uniforms.uRes.value.set(BW * q, BH * q);
		uniforms.uCenter.value.set(BW / 2 * q, BH / 2 * q);
		uniforms.uScale.value = (s.width * 0.82) / (20 / DIST) * q;
	}
	return {
		size,
		setQuality(v) { q = v; size(); },
		quality: () => q,
		// is the hole's box on screen?
		visible() { const s = slot.getBoundingClientRect(); return s.bottom + BH / 2 > 0 && s.top - BH / 2 < window.innerHeight; },
		render(dt, vw, vh) {
			if (!reduceMotion) uniforms.uTime.value += dt;
			az += (azTo - az) * .03; inc += (incTo - inc) * .03; roll += (rollTo - roll) * .03;
			offX += (offXTo - offX) * .03; offY += (offYTo - offY) * .03;
			aim();
			composer.render();
			omat.uniforms.map.value = composer.readBuffer.texture;
			const s = slot.getBoundingClientRect();
			const cx = s.left + s.width / 2 + offX, cy = s.top + s.height / 2 + offY;
			ocam.right = vw; ocam.top = vh; ocam.updateProjectionMatrix();
			quad.scale.set(BW, BH, 1); quad.position.set(cx, vh - cy, 0);
			return overlay;
		},
		ocam,
	};
}

function start(texture) {
	const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.autoClear = false;
	renderer.setClearColor(0x000000, 1);
	const cv = renderer.domElement;
	cv.className = "sky";
	cv.setAttribute("aria-hidden", "true");
	cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:block";
	document.body.prepend(cv);
	document.documentElement.classList.add("has-sky");
	hero.classList.add("has-three");

	const sky = makeSky(renderer);
	const hole = makeHole(renderer, texture);
	let vw = 0, vh = 0;
	function resize() {
		vw = window.innerWidth; vh = window.innerHeight;
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
		renderer.setSize(vw, vh, false);
		sky.resize(vw, vh); hole.size();
	}
	resize();
	let rs; window.addEventListener("resize", () => { clearTimeout(rs); rs = setTimeout(() => { resize(); go(); }, 150); });

	const clock = new THREE.Clock();
	let raf = 0, acc = 0, avg = 1 / 60, n = 0;
	const maxQ = Math.min(window.devicePixelRatio || 1, 1);
	function frame() {
		raf = 0;
		if (document.hidden) return;
		const raw = clock.getDelta();
		const holeOn = hole.visible();
		acc += raw;
		// with the hole off screen only the slow sky is left: ~30 frames a second is plenty
		if (!holeOn && acc < 1 / 30) { raf = requestAnimationFrame(frame); return; }
		const dt = Math.min(acc, 0.1); acc = 0;
		sky.update(dt);
		let ov = null;
		if (holeOn) {
			ov = hole.render(dt, vw, vh);
			// adapt the hole's resolution to the machine (ignores pauses)
			if (raw > 0 && raw < 0.2) { avg = avg * 0.95 + raw * 0.05; if (++n >= 90) { n = 0;
				if (avg > 0.019 && hole.quality() > 0.5) hole.setQuality(Math.max(0.5, hole.quality() * 0.85));
				else if (avg < 0.012 && hole.quality() < maxQ) hole.setQuality(Math.min(maxQ, hole.quality() * 1.12));
			} }
		}
		renderer.setRenderTarget(null);
		renderer.clear();
		renderer.render(sky.scene, sky.cam);
		if (ov) renderer.render(ov, hole.ocam);
		if (!reduceMotion) raf = requestAnimationFrame(frame);
	}
	function go() { if (!raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } }
	document.addEventListener("visibilitychange", go);
	window.addEventListener("scroll", () => { if (reduceMotion) { frame(); } }, { passive: true });
	go();
	if (reduceMotion) frame();
	window.__bh3 = { renderer, hole };
}

if (hero && slot && document.createElement("canvas").getContext("webgl2")) {
	new THREE.TextureLoader().load(new URL("../../images/about/disk-texture.jpg", import.meta.url).href, start);
}
