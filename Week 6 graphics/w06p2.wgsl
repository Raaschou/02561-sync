struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
}

struct Uniforms {
    mvp: mat4x4f,
    d: f32,
}


@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@vertex
fn main_vs(@location(0) inPos: vec4f, @location(1) inCoord: vec2f) -> VSOut {
    var vsOut: VSOut;

    let p = uniforms.mvp * inPos;
    vsOut.texCoord = inCoord;
    vsOut.position = p;
    return vsOut;
}


@fragment
fn main_fs(fsInput: VSOut) -> @location(0) vec4f {
    return textureSampleLevel(myTexture, mySampler, fsInput.texCoord, uniforms.d);
}
