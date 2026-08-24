---
name: bonus_hole_light
type: fragment
uniform.sceneAlpha: {"type":"1f","value":0}
uniform.lightPos: {"type":"2f","value":{"x":0.5,"y":0.82}}
uniform.flare: {"type":"1f","value":0}
uniform.heightStrength: {"type":"1f","value":1.0}
uniform.normalStrength: {"type":"1f","value":1.0}
uniform.beamStrength: {"type":"1f","value":0.0}
uniform.glowStrength: {"type":"1f","value":0.38}
---
precision mediump float;

uniform float time;
uniform vec2 resolution;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;

uniform float sceneAlpha;
uniform vec2 lightPos;
uniform float flare;
uniform float heightStrength;
uniform float normalStrength;
uniform float beamStrength;
uniform float glowStrength;

varying vec2 outTexCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = outTexCoord;
  float height = texture2D(iChannel0, uv).r;
  vec3 normalTex = texture2D(iChannel1, uv).rgb * 2.0 - 1.0;
  vec3 normal = normalize(vec3(normalTex.xy * normalStrength, max(0.2, normalTex.z)));

  float t = time * 0.001;
  float flicker = 0.985
    + sin(t * 4.4) * 0.022
    + sin(t * 7.1 + uv.x * 10.0) * 0.014
    + (noise(vec2(t * 1.05, uv.x * 8.0 + uv.y * 5.0)) - 0.5) * 0.05;
  flicker += flare * 0.1;
  float torchFlickerA = 0.94
    + sin(t * 5.2 + 0.4) * 0.045
    + (noise(vec2(t * 1.4, 14.0 + uv.x * 3.0)) - 0.5) * 0.05;
  float torchFlickerB = 0.94
    + sin(t * 5.9 + 1.7) * 0.042
    + (noise(vec2(t * 1.55, 31.0 + uv.y * 4.0)) - 0.5) * 0.05;
  torchFlickerA += flare * 0.08;
  torchFlickerB += flare * 0.08;

  float aspect = resolution.x / max(resolution.y, 1.0);
  vec2 primaryDrift = vec2(
    sin(t * 2.4 + 0.7) * 0.004 + (noise(vec2(t * 0.9, 11.0)) - 0.5) * 0.004,
    cos(t * 2.0 + 1.1) * 0.003 + (noise(vec2(7.0, t * 0.8)) - 0.5) * 0.003
  );
  vec2 secondaryDrift = vec2(
    sin(t * 2.8 + 2.2) * 0.004 + (noise(vec2(t * 1.0, 23.0)) - 0.5) * 0.004,
    cos(t * 2.3 + 0.2) * 0.003 + (noise(vec2(19.0, t * 0.85)) - 0.5) * 0.003
  );
  vec2 primaryPos = lightPos + vec2(-0.05, -0.11) + primaryDrift;
  vec2 secondaryPos = lightPos + vec2(0.05, -0.118) + secondaryDrift;
  vec2 mouthCenter = lightPos + vec2(0.0, -0.058);
  vec2 deltaA = uv - primaryPos;
  vec2 deltaB = uv - secondaryPos;
  vec2 deltaAspectA = vec2(deltaA.x * aspect, deltaA.y);
  vec2 deltaAspectB = vec2(deltaB.x * aspect, deltaB.y);
  float distA = length(deltaAspectA);
  float distB = length(deltaAspectB);
  float dist = min(distA, distB);
  float mouthAbove = max(0.0, mouthCenter.y - uv.y);

  float heightMask = mix(0.35, 1.0, pow(clamp(height, 0.0, 1.0), 0.95)) * heightStrength;
  float innerGlow = max(
    (1.0 - smoothstep(0.018, 0.16 + flare * 0.03, distA)) * torchFlickerA,
    (1.0 - smoothstep(0.018, 0.16 + flare * 0.03, distB)) * torchFlickerB
  );
  float spill = max(
    (1.0 - smoothstep(0.03, 0.42 + flare * 0.08, distA)) * torchFlickerA,
    (1.0 - smoothstep(0.03, 0.42 + flare * 0.08, distB)) * torchFlickerB
  );
  spill = pow(max(spill, 0.0), 1.35) * heightMask;

  float beamWidth = mix(0.006, 0.014 + flare * 0.004, clamp(mouthAbove / 0.26, 0.0, 1.0));
  float beamA = (1.0 - smoothstep(beamWidth, beamWidth + 0.055, abs(deltaAspectA.x)))
    * (1.0 - smoothstep(0.0, 0.24, max(0.0, primaryPos.y - uv.y)));
  float beamB = (1.0 - smoothstep(beamWidth, beamWidth + 0.055, abs(deltaAspectB.x)))
    * (1.0 - smoothstep(0.0, 0.24, max(0.0, secondaryPos.y - uv.y)));
  float beam = max(beamA, beamB);
  beam *= step(uv.y, mouthCenter.y);
  beam *= heightMask;

  float beamCoreA = (1.0 - smoothstep(beamWidth * 0.35, beamWidth * 0.7, abs(deltaAspectA.x)))
    * (1.0 - smoothstep(0.0, 0.32, max(0.0, primaryPos.y - uv.y)));
  float beamCoreB = (1.0 - smoothstep(beamWidth * 0.35, beamWidth * 0.7, abs(deltaAspectB.x)))
    * (1.0 - smoothstep(0.0, 0.32, max(0.0, secondaryPos.y - uv.y)));
  float beamCore = max(beamCoreA, beamCoreB);

  vec3 lightDirA = normalize(vec3(-deltaAspectA.x, -deltaAspectA.y * 1.18 - 0.01, 0.5 + height * 0.35));
  vec3 lightDirB = normalize(vec3(-deltaAspectB.x, -deltaAspectB.y * 1.18 - 0.01, 0.5 + height * 0.35));
  float diffuse = max(max(dot(normal, lightDirA), 0.0), max(dot(normal, lightDirB), 0.0));

  float rim = pow(1.0 - max(normal.z, 0.0), 2.0);
  rim *= (1.0 - smoothstep(0.02, 0.28, dist));
  rim *= heightMask;

  float mouthDist = length(vec2((uv.x - mouthCenter.x) * aspect, (uv.y - mouthCenter.y) * 1.18));
  float lipBand = smoothstep(0.03, 0.08, dist) * (1.0 - smoothstep(0.08, 0.18, dist));
  lipBand *= smoothstep(-0.012, 0.045, mouthCenter.y - uv.y);
  lipBand *= 0.8 + diffuse * 0.45;

  float holeRing = smoothstep(0.04, 0.12, mouthDist) * (1.0 - smoothstep(0.12, 0.28, mouthDist));
  holeRing *= smoothstep(-0.03, 0.09, mouthCenter.y - uv.y);
  holeRing *= 0.8 + heightMask * 0.4;

  float outerRim = smoothstep(0.18, 0.28, mouthDist) * (1.0 - smoothstep(0.28, 0.5, mouthDist));
  outerRim *= smoothstep(-0.05, 0.11, mouthCenter.y - uv.y);
  outerRim *= 0.6 + diffuse * 0.35;

  float lipCover = smoothstep(-0.03, 0.015, uv.y - mouthCenter.y);

  float sourceSpill = max(
    (1.0 - smoothstep(0.0, 0.26 + flare * 0.05, distA)) * torchFlickerA,
    (1.0 - smoothstep(0.0, 0.26 + flare * 0.05, distB)) * torchFlickerB
  );
  sourceSpill = pow(max(sourceSpill, 0.0), 1.75) * heightMask * (1.0 - lipCover * 0.9);

  float glow = (
    + innerGlow * 0.52
    + spill * (0.48 + diffuse * 0.95)
    + sourceSpill * 0.035
    + beam * beamStrength
    + beamCore * 0.02
    + rim * 0.12
    + lipBand * 0.18
    + holeRing * 0.22
    + outerRim * 0.08
  ) * flicker * glowStrength;

  vec3 warmTint = vec3(1.0, 0.58, 0.18);
  vec3 hotTint = vec3(1.0, 0.84, 0.52);
  vec3 amberTint = vec3(1.0, 0.72, 0.3);
  vec3 color = (
    warmTint * glow * 0.42
    + hotTint * (innerGlow * 0.004)
    + amberTint * (spill * 0.03 + sourceSpill * 0.01 + lipBand * 0.04 + holeRing * 0.08 + outerRim * 0.03)
  );
  float alpha = clamp((glow * 0.14 + holeRing * 0.035 + outerRim * 0.02 + lipBand * 0.02) * sceneAlpha, 0.0, 0.12);

  gl_FragColor = vec4(color, alpha);
}
