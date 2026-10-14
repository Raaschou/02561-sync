struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
}

struct Uniforms {
    mvp: array<mat4x4f, 1>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

const k_d: f32 = 1.0;
const L_e: vec3f = vec3f(1.0, 1.0, 1.0);
const I_e: vec3f = vec3f(0.0, 0.0, - 1.0);
@vertex
fn main_vs(@builtin(instance_index) instanceIdx: u32, @location(0) inPos: vec4f, @location(1) inColor: vec3f) -> VSOut {
    var vsOut: VSOut;
    let p = uniforms.mvp[instanceIdx] * inPos;

    let wi = normalize(- I_e);
    let normal = normalize(inColor);
    let diffuse = max(dot(normal, wi), 0.0);
    vsOut.color = inColor * k_d * L_e * diffuse;
    vsOut.position = p;
    return vsOut;
}

@fragment
fn main_fs(@location(0) inColor: vec3f) -> @location(0) vec4f {
    return vec4f(inColor, 1.0);
}
