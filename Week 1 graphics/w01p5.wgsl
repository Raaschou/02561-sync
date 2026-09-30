struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
}

struct Uniforms {
    theta: f32,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@vertex
fn main_vs(@location(0) inPos: vec2f, @location(1) inColor: vec3f) -> VSOut {
    var vsOut: VSOut;
    let sine = sin(uniforms.theta);
    let p = vec2(inPos.x, inPos.y - sine / 2);

    vsOut.position = vec4f(p, 0.0 * uniforms.theta, 1.0);
    vsOut.color = inColor;
    return vsOut;
}


@fragment
fn main_fs(@location(0) inColor: vec3f) -> @location(0) vec4f {
    return vec4f(inColor, 1.0);
}
