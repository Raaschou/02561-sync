struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
}

struct Uniforms {
    mvp: mat4x4f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

const k_d: f32 = 1.0;
const L_e: vec3f = vec3f(1.0, 1.0, 1.0);
const I_e: vec3f = vec3f(0.0, 0.0, -1.0);
@vertex
fn main_vs(@location(0) inPos: vec4f) -> VSOut {
    var vsOut: VSOut;
    let p = uniforms.mvp * inPos;

    let wi = normalize(-I_e);
    // Note to self RTFM 
    // Just calculate colour here, because for unit circle n_xyz = p_xyz 
    let normal = (0.5 * inPos.xyz) + 0.5;
    let diffuse = max(dot(normal, wi), 0.0);
    vsOut.color = normal * k_d * L_e * diffuse;
    vsOut.position = p;
    return vsOut;
}

@fragment
fn main_fs(@location(0) inColor: vec3f) -> @location(0) vec4f {
    return vec4f(inColor, 1.0);
}
