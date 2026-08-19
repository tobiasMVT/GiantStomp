precision mediump float;

uniform float time;
uniform vec2 resolution;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    // Smooth interpolation
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
           (c - a)* u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    // Scroll effect
    uv.y += time * 0.02;
    uv.x += sin(uv.y * 10.0 + time * 0.5) * 0.03;

    float n = noise(uv * 3.0);
    float fog = smoothstep(0.4, 0.6, n);

    vec3 color = vec3(0.2, 0.6, 1.0); // misty blue
    float alpha = fog * 0.2; // lower for subtlety

    gl_FragColor = vec4(color, alpha);
}
