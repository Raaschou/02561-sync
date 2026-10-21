struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
}

struct Uniforms {
    mvp: mat4x4f,
    use_mipmap: u32,
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

    let normal = normalize(inPos.xyz);
    vsOut.normal = normal;
    vsOut.position = uniforms.mvp * inPos;
    return vsOut;
}

@fragment
fn main_fs(in: VSOut) -> @location(0) vec4f {
    // Use normals from world space instead of uv mapping
    let texCoord = vec3f(in.normal.x, in.normal.y, in.normal.z);
    let color = textureSampleLevel(cubemap, mySampler, texCoord, 0.0);

    return vec4f(color);
}
