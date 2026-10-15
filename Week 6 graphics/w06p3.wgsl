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
    let epsilon = 0.1;

    let w_i = normalize(I_e);
    let normal = normalize(in.normal);

    let diffuse = max(dot(normal, w_i), 0.0) + 0.2; // + 0.2 to brighten up dark side
    let phi = atan2(normal.z, normal.x);
    let u = 0.5 - phi / (2.0 * pi_f);
    let v = acos(normal.y) / pi_f;
    let texCoord = vec2f(u, v);

    let color = select(
            textureSample(myTexture, mySampler, texCoord),
            textureSampleLevel(myTexture, mySampler, texCoord, 0.0),
            uniforms.use_mipmap == 0 || pi_f - abs(phi) < epsilon,
        );
    return vec4f(color.rgb * diffuse, color.a);
}
