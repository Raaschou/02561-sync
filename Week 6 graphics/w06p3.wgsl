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
var myTexture: texture_2d<f32>;
@group(0) @binding(2)
var<uniform> uniforms: Uniforms;

const k_d: f32 = 1.0;
const L_e: vec3f = vec3f(1.0, 1.0, 1.0);
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
    let w_i = normalize(-I_e);
    let normal = normalize(in.normal);

    let cos_theta = dot(normal, w_i);
    let diffuse = max(dot(normal, w_i), 0.0);
    let phi = atan2(normal.z, normal.x);
    let texCoord = vec2f(0.5 - phi / (2.0 * pi_f), acos(normal.y) / pi_f);
    let color = select(
            textureSample(myTexture, mySampler, texCoord),
            textureSampleLevel(myTexture, mySampler, texCoord, 0.0),
            uniforms.use_mipmap == 0 || pi_f - abs(phi) < 0.1,
        );
    return vec4f(color.rgb * diffuse, color.a);
}
