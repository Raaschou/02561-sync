window.onload = function () { main(); }

async function main() {
    const canvas = document.querySelector("canvas");

    if (!navigator.gpu) {
        throw new Error("WebGPU not supported on this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
        throw new Error("No appropriate GPUAdapter found.");
    }

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device: device,
        format: canvasFormat,
    });


    // Scene setup
    const centering_offset = 0.5
    var positions = [
        vec2(0.0 - centering_offset, 0.0 - centering_offset),
        vec2(1.0 - centering_offset, 0.0 - centering_offset),
        vec2(1.0 - centering_offset, 1.0 - centering_offset),
        vec2(0.0 - centering_offset, 1.0 - centering_offset),
        vec2(0.0 - centering_offset, 0.0 - centering_offset),
        vec2(1.0 - centering_offset, 1.0 - centering_offset)
    ];


    var colors = [
        vec3(0.0, 0.0, 1.0),
        vec3(0.0, 1.0, 0.0),
        vec3(1.0, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        vec3(0.0, 0.0, 1.0),
        vec3(1.0, 0.0, 0.0)];

    // Buffer setup
    const positionsBuffer = device.createBuffer({
        size: flatten(positions).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });


    const colorBuffer = device.createBuffer({
        size: flatten(colors).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });


    device.queue.writeBuffer(positionsBuffer, /*bufferOffset=*/0, flatten(positions));
    device.queue.writeBuffer(colorBuffer, 0, flatten(colors))


    const positionsBufferLayout = {
        arrayStride: sizeof['vec2'],
        attributes: [{
            format: 'float32x2',
            offset: 0,
            shaderLocation: 0, // Position, see vertex shader
        }],
    };


    const colorBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
            offset: 0,
            shaderLocation: 1,
        }]
    }

    // Render pipeline
    const wgslfile = document.getElementById('wgsl').src;
    const wgslcode
        = await fetch(wgslfile, { cache: "reload" }).then(r => r.text());
    const wgsl = device.createShaderModule({
        code: wgslcode
    });

    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: wgsl,
            entryPoint: 'main_vs',
            buffers: [positionsBufferLayout, colorBufferLayout],
        },
        fragment: {
            module: wgsl,
            entryPoint: 'main_fs',
            targets: [{ format: canvasFormat }],
        },
        primitive: { topology: 'triangle-list', },
    });

    let bytelength = 5 * sizeof['vec4']; // Buffers are allocated in vec4 chunks

    let uniforms = new ArrayBuffer(bytelength);
    const uniformBuffer = device.createBuffer({
        size: uniforms.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        }],
    });


    // angle decides height because it's fed to a sine function
    let angle = 0;
    function animate() {
        angle += 0.005;
        const uniformData = new Float32Array([angle]);
        device.queue.writeBuffer(uniformBuffer, 0, uniformData)

        render();
        // Call another frame to continue animation
        requestAnimationFrame(animate);
    }

    function render() {
        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3921, 0.5843, 0.9294, 1.0],
                storeOp: "store",
            }]
        });

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionsBuffer);
        pass.setVertexBuffer(1, colorBuffer);
        pass.setBindGroup(0, bindGroup);
        pass.draw(positions.length);
        pass.end();
        device.queue.submit([encoder.finish()]);

    }

    requestAnimationFrame(animate)
}


