struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
}

struct Uniforms {
    mvp: mat4x4f,
    MTex: mat4x4f,
    reflective: u32,
    eye: mat4x4f,
}

@group(0) @binding(0)
var mySampler: sampler;
@group(0) @binding(1)
var cubemap: texture_cube<f32>;
@group(0) @binding(2)
var<uniform> uniforms: Uniforms;

const I_e: vec3f = vec3f(1.0, 0.0, -0.5);
const pi_f: f32 = 3.14159265358979323846;

@vertex
fn main_vs(@location(0) inPos: vec4f) -> VSOut {
    var vsOut: VSOut;
    let texCoord = (uniforms.MTex * inPos).xyz;

    vsOut.normal = texCoord;

    vsOut.position = uniforms.mvp * inPos;
    return vsOut;
}

@fragment
fn main_fs(in: VSOut) -> @location(0) vec4f {
    // Use computed texCoord as normal
    let color = textureSampleLevel(cubemap, mySampler, in.normal, 0.0);

    return vec4f(color);
}
