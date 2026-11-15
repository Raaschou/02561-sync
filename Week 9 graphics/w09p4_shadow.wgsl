struct VSOut {
    @builtin(position) position: vec4f,
}

struct Uniforms {
    model: mat4x4f,
    lightViewProj: mat4x4f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@vertex
fn main_vs_depth(@location(0) inPos: vec4f) -> @builtin(position) vec4f {
    return uniforms.lightViewProj * uniforms.model * inPos;
}

@fragment
fn main_fs_depth(@builtin(position) fragcoord: vec4f) -> @location(0) vec4f {
    return vec4f(vec3f(fragcoord.z), 1.0);
}
