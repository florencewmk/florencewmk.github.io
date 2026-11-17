/* About page: Gargantua-style black hole in Three.js (preview, loaded with ?three on life.html).

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

const hero = document.querySelector(".about-hero");
const slot = hero && hero.querySelector(".bh-slot");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function start(texture) {
	const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	const canvas = renderer.domElement;
	canvas.className = "bh-three";
	canvas.setAttribute("aria-hidden", "true");
	hero.insertBefore(canvas, hero.firstChild.nextSibling);

	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.colorSpace = THREE.NoColorSpace;
	texture.anisotropy = 4;

	const uniforms = {
		uTime: { value: 0 },
		uCenter: { value: new THREE.Vector2() },
		uScale: { value: 1 },
		uCamPos: { value: new THREE.Vector3() },
		uRight: { value: new THREE.Vector3() },
		uUp: { value: new THREE.Vector3() },
		uFwd: { value: new THREE.Vector3() },
		uTex: { value: texture },
	};

	const material = new THREE.ShaderMaterial({
		uniforms,
		depthTest: false, depthWrite: false,
		vertexShader: "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }",
		fragmentShader: /* glsl */`
			uniform float uTime; uniform vec2 uCenter; uniform float uScale;
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

				for (int i = 0; i < 260; i++) {
					float r2 = dot(p, p), r = sqrt(r2);
					if (r2 < 1.) { trans = 0.; break; }                                  // crossed the horizon
					if (r > camR * 1.3 && dot(p, v) > 0.) { escaped = true; break; }
					float dt = clamp(.05 * r * min(1., r * .45), .012, 2.5);
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
				if (escaped) col += stars(normalize(v)) * trans;
				gl_FragColor = vec4(col, 1.);
			}`,
	});

	const scene = new THREE.Scene();
	scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
	const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);   // only draws the full-screen quad

	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, cam));
	const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.32, 0.38);
	composer.addPass(bloom);
	composer.addPass(new OutputPass());

	// the "real" camera that orbits the hole; the shader reads its position and axes
	const DIST = 46, BASE_INC = THREE.MathUtils.degToRad(4.5), BASE_ROLL = THREE.MathUtils.degToRad(-9);
	let inc = BASE_INC, az = 0, incTo = BASE_INC, azTo = 0;
	const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
	function updateCamera() {
		eye.set(Math.sin(az) * Math.cos(inc), Math.sin(inc), -Math.cos(az) * Math.cos(inc)).multiplyScalar(DIST);
		fwd.copy(eye).multiplyScalar(-1).normalize();
		right.crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
		up.crossVectors(fwd, right);
		const c = Math.cos(BASE_ROLL), s = Math.sin(BASE_ROLL);
		const r2 = right.clone().multiplyScalar(c).addScaledVector(up, s);
		up.multiplyScalar(c).addScaledVector(right, -s); right.copy(r2);
		uniforms.uCamPos.value.copy(eye); uniforms.uFwd.value.copy(fwd);
		uniforms.uRight.value.copy(right); uniforms.uUp.value.copy(up);
	}

	let W = 0, H = 0, quality = Math.min(window.devicePixelRatio || 1, 1.25);
	function layout() {
		const r = hero.getBoundingClientRect(), s = slot.getBoundingClientRect();
		W = r.width; H = r.height;
		renderer.setPixelRatio(quality);
		renderer.setSize(W, H, false);
		composer.setPixelRatio(quality);
		composer.setSize(W, H);
		const cx = s.left - r.left + s.width / 2, cy = s.top - r.top + s.height / 2;
		uniforms.uCenter.value.set(cx * quality, (H - cy) * quality);
		// apparent disk radius about 0.62 of the slot width
		uniforms.uScale.value = (s.width * 0.82) / (20 / DIST) * quality;
	}

	// pointer: the camera swings a few degrees around the hole, slowly and smoothly
	hero.addEventListener("pointermove", (e) => {
		const s = slot.getBoundingClientRect();
		const dx = (e.clientX - (s.left + s.width / 2)) / window.innerWidth;
		const dy = (e.clientY - (s.top + s.height / 2)) / window.innerHeight;
		azTo = THREE.MathUtils.clamp(dx, -0.6, 0.6) * THREE.MathUtils.degToRad(14);
		incTo = BASE_INC + THREE.MathUtils.clamp(-dy, -0.6, 0.6) * THREE.MathUtils.degToRad(8);
	}, { passive: true });
	hero.addEventListener("pointerleave", () => { azTo = 0; incTo = BASE_INC; });

	let visible = true, last = 0, slowFrames = 0, raf = 0;
	const clock = new THREE.Clock();
	function frame() {
		raf = 0;
		if (!visible || document.hidden) return;
		const dt = Math.min(clock.getDelta(), 0.05);
		if (!reduceMotion) uniforms.uTime.value += dt;
		az += (azTo - az) * 0.025; inc += (incTo - inc) * 0.025;
		updateCamera();
		composer.render();
		// keep it smooth: lower the resolution if frames take too long
		if (dt > 0.03) { if (++slowFrames > 20 && quality > 0.55) { quality *= 0.85; slowFrames = 0; layout(); } } else slowFrames = 0;
		if (!reduceMotion) raf = requestAnimationFrame(frame);
	}
	function go() { if (!raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } }

	new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) go(); }).observe(hero);
	document.addEventListener("visibilitychange", go);
	let rs; window.addEventListener("resize", () => { clearTimeout(rs); rs = setTimeout(() => { layout(); go(); }, 150); });

	layout(); updateCamera();
	hero.classList.add("has-three");
	go();
	window.__bh3 = { renderer, bloom, uniforms };
}

if (hero && slot) {
	const probe = document.createElement("canvas");
	if (probe.getContext("webgl2")) {
		new THREE.TextureLoader().load(new URL("../../images/about/disk-texture.jpg", import.meta.url).href, start);
	}
}
