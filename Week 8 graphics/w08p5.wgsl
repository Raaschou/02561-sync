struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
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

@vertex
fn main_vs(@location(0) inPos: vec4f, @location(1) inCoord: vec2f) -> VSOut {
    var vsOut: VSOut;

    let p = uniforms.mvp * inPos;
    vsOut.texCoord = inCoord * uniforms.visibility;
    vsOut.position = p;

    return vsOut;
}

@fragment
fn main_fs(fsInput: VSOut) -> @location(0) vec4f {
    let color = textureSample(myTexture, mySampler, fsInput.texCoord);
    // Mult by visibility to create shadow
    var shadowAlphaMultiplier = 1.0;
    // use != 1.0 so alpha is changeable in js code
    if uniforms.visibility != 1.0 {
        shadowAlphaMultiplier = 0.0;
    }
    return vec4f(color.rgb * shadowAlphaMultiplier, color.a * uniforms.visibility);
}
