struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
    @location(1) normal: vec3f,
    @location(2) viewPos: vec3f,
}

struct Uniforms {
    mvp: mat4x4f,
    // make shadows black using visibility uniform
    lightPos: vec3f,
    visibility: f32,
}

@group(0) @binding(0)
var mySampler: sampler;
@group(0) @binding(1)
var myTexture: texture_2d<f32>;
@group(0) @binding(2)
var<uniform> uniforms: Uniforms;

const k_d = vec3f(0.72, 0.72, 0.72);
const specularColor: vec3f = vec3f(1.0, 1.0, 1.0);

@vertex
fn main_vs(
    @location(0) inPos: vec4f,
    @location(1) inCoord: vec2f,
    @location(2) inNormal: vec3f,
) -> VSOut {
    var vsOut: VSOut;

    vsOut.texCoord = inCoord * uniforms.visibility;
    vsOut.normal = inNormal;
    vsOut.position = uniforms.mvp * inPos;
    vsOut.viewPos = inPos.xyz;
    return vsOut;
}

@fragment
fn main_fs(in: VSOut) -> @location(0) vec4f {
    let color = textureSample(myTexture, mySampler, in.texCoord);
    let rgb = color.rgb;
    var L_o = rgb;
    // Hack to avoid shading also affecting marble texture
    if uniforms.visibility == 0.9 {
        let w_i = normalize(uniforms.lightPos - in.viewPos);
        let normal = normalize(in.normal);
        let cos_theta = dot(normal, w_i);
        let w_r = normalize(2.0 * (dot(w_i, normal)) * normal - w_i);
        let w_o = normalize(-(in.viewPos));

        let L_phong = specularColor * 0.5 * pow(max(dot(w_r, w_o), 0), 1.5);
        let L_rd = k_d * rgb * 0.2 * max(cos_theta, 0);
        let L_ra = k_d * rgb * 0.8;
        L_o = L_rd + L_phong + L_ra;
    }
    // Mult by visibility to create shadow
    var shadowAlphaMultiplier = 1.0;
    // use != 1.0 so alpha is changeable in js code
    if uniforms.visibility == 0.6 {
        shadowAlphaMultiplier = 0.0;
    }
    return vec4f(L_o * shadowAlphaMultiplier, color.a * uniforms.visibility);
}
