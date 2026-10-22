struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec3f,
}

struct Uniforms {
    mvp: mat4x4f,
    MTex: mat4x4f,
    eye: vec3f,
    reflective: f32,
}

@group(0) @binding(0)
var mySampler: sampler;
@group(0) @binding(1)
var cubemap: texture_cube<f32>;
@group(0) @binding(2)
var<uniform> uniforms: Uniforms;
@group(0) @binding(3)
var normalmap: texture_2d<f32>;

const I_e: vec3f = vec3f(1.0, 0.0, -0.5);
const pi_f: f32 = 3.14159265358979323846;

fn rotate_to_normal(n: vec3f, v: vec3f) -> vec3f {
    let sgn_nz = sign(n.z + 1.0e-16);
    let a = -1.0 / (1.0 + abs(n.z));
    let b = n.x * n.y * a;
    return vec3f(1.0 + n.x * n.x * a, b, -sgn_nz * n.x) * v.x
        + vec3f(sgn_nz * b, sgn_nz * (1.0 + n.y * n.y * a), -n.y) * v.y + n * v.z;
}

@vertex
fn main_vs(@location(0) inPos: vec4f) -> VSOut {
    var vsOut: VSOut;
    let texCoord = (uniforms.MTex * inPos).xyz;

    vsOut.texCoord = texCoord;

    vsOut.position = uniforms.mvp * inPos;
    return vsOut;
}

@fragment
fn main_fs(in: VSOut) -> @location(0) vec4f {
    let normal = normalize(in.texCoord);
    let phi = atan2(normal.z, normal.x);
    let u = 0.5 - phi / (2.0 * pi_f);
    let v = acos(normal.y) / pi_f;
    let uvTexCoord = vec2f(u, v);

    let normalSample = textureSample(normalmap, mySampler, uvTexCoord);
    let worldNormal = normalize(2 * normalSample.xyz - 1);
    let nBump = rotate_to_normal(in.texCoord, worldNormal);

    let texCoord = select(
            in.texCoord,
            reflect(in.texCoord - uniforms.eye, nBump),
            uniforms.reflective == 1.0,
        );

    let color = textureSampleLevel(cubemap, mySampler, texCoord, 0.0);

    return vec4f(color);
}
