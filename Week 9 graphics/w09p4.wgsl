struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
    @location(1) normal: vec3f,
    @location(2) viewPos: vec3f,
}

struct Uniforms {
    mvp: mat4x4f,
    // make shadows black using visibility uniform
    model: mat4x4f,
    lightViewProj: mat4x4f,
    lightPos: vec3f,
    visibility: f32,
}

@group(0) @binding(0)
var mySampler: sampler;
@group(0) @binding(1)
var myTexture: texture_2d<f32>;
@group(0) @binding(2)
var<uniform> uniforms: Uniforms;
@group(0) @binding(3)
var shadowMap: texture_2d<f32>;

const k_d: f32 = 0.50;
const L_e: f32 = 1.0;
const L_a: f32 = 0.4;
const shine: f32 = 100.0;
const k_s: f32 = 0.3;
const specularColor: vec3f = vec3f(1.0, 1.0, 1.0);
const W = 1024;
const H = 1024;

@vertex
fn main_vs(
    @location(0) inPos: vec4f,
    @location(1) inCoord: vec2f,
    @location(2) inNormal: vec3f,
) -> VSOut {
    var vsOut: VSOut;
    let worldPos = uniforms.model * inPos;
    vsOut.texCoord = inCoord * uniforms.visibility;
    vsOut.normal = inNormal;
    vsOut.position = uniforms.mvp * worldPos;
    vsOut.viewPos = worldPos.xyz;
    return vsOut;
}

@fragment
fn main_fs(in: VSOut) -> @location(0) vec4f {
    let lightClip = uniforms.lightViewProj * vec4f(in.viewPos, 1.0);
    let shadowCoords = (lightClip.xyz / lightClip.w) * vec3f(0.5, -0.5, 1.0) + vec3f(0.5, 0.5, 0.0);

    var inShadow = false;
    if all(shadowCoords.xy >= vec2f(0.0)) && all(shadowCoords.xy < vec2f(1.0))
        && shadowCoords.z <= 1.0 {
        let depth = textureLoad(shadowMap, vec2i(shadowCoords.xy * vec2f(W, H)), 0).r;
        inShadow = depth < shadowCoords.z - 0.001;
    }

    let color = textureSample(myTexture, mySampler, in.texCoord);
    let rgb = color.rgb;
    var L_o = rgb;

    if uniforms.visibility == 0.9 {
        // teapot (Phong)
        let w_i = normalize(uniforms.lightPos - in.viewPos);
        let normal = normalize(in.normal);
        let cos_theta = dot(normal, w_i);
        let w_r = normalize(2.0 * dot(w_i, normal) * normal - w_i);
        let w_o = normalize(-in.viewPos);
        let specular = select(0.0, pow(max(dot(w_r, w_o), 0.0), shine), cos_theta > 0.0);

        let L_ra = k_d * rgb * L_a;
        if inShadow {
            L_o = L_ra;
        } else {
            L_o = k_d * rgb * L_e * max(cos_theta, 0.0) + k_s * specularColor * L_e * specular
                + L_ra;
        }
    } else if inShadow {
        // ground plane
        L_o = rgb * k_d * L_a;
    }
    return vec4f(L_o, 1.0);
}

@vertex
fn main_vs_depth(@location(0) inPos: vec4f) -> @builtin(position) vec4f {
    return uniforms.lightViewProj * uniforms.model * inPos;
}

@fragment
fn main_fs_depth(@builtin(position) fragcoord: vec4f) -> @location(0) vec4f {
    return vec4f(vec3f(fragcoord.z), 1.0);
}
