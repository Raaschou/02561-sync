struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
}

struct Uniforms {
    mvp: array<mat4x4f, 1>,
    view: mat4x4f,
    L_e: vec3f,
    _pad0: f32,
    L_a: vec3f,
    k_d: f32,
    k_s: f32,
    s: f32
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

//Placeholders
const I_e: vec3f = vec3f(0.0, 0.0, - 1.0);

const diffuseColor: vec3f = vec3f(1.0, 0.0, 1.0);
const specularColor: vec3f = vec3f(1.0, 1.0, 1.0);
@vertex
fn main_vs(@builtin(instance_index) instanceIdx: u32, @location(0) inPos: vec4f, @location(1) inColor: vec3f) -> VSOut {
    var vsOut: VSOut;
    let p = uniforms.mvp[instanceIdx] * inPos;

    let w_i = normalize(- I_e);
    let normal = normalize(inColor);
    let cos_theta = dot(normal, w_i);
    let w_r = normalize(2.0 * (dot(w_i, normal)) * normal - w_i);
    let w_o = normalize(- (uniforms.view * inPos).xyz);

    // Phong
    // we assume L_i = L_e, = 1 and k_a = k_d
    let L_phong = uniforms.k_s * specularColor * uniforms.L_e * pow(max(dot(w_r, w_o), 0), uniforms.s);
    let L_rd = uniforms.k_d * diffuseColor * uniforms.L_e * max(cos_theta, 0);
    let L_ra = uniforms.k_d * diffuseColor * uniforms.L_a;
    let L_o = L_rd + L_phong + L_ra;

    vsOut.color = L_o;
    vsOut.position = p;
    return vsOut;
}

@fragment
fn main_fs(@location(0) inColor: vec3f) -> @location(0) vec4f {
    return vec4f(inColor, 1.0);
}
