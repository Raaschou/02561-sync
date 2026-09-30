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

    let positions = [
        vec3(0.0, 0.0, 1.0),
        vec3(0.0, 1.0, 1.0),
        vec3(1.0, 1.0, 1.0),
        vec3(1.0, 0.0, 1.0),
        vec3(0.0, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        vec3(1.0, 1.0, 0.0),
        vec3(1.0, 0.0, 0.0),
    ];

    let colors = [
        vec3(0.0, 0.0, 1.0),
        vec3(0.0, 1.0, 1.0),
        vec3(1.0, 1.0, 1.0),
        vec3(1.0, 0.0, 1.0),
        vec3(0.0, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        vec3(1.0, 1.0, 0.0),
        vec3(1.0, 0.0, 0.0),

    ];

    //Wire frame indices
    let wire_indices = new Uint32Array([
        0, 1, 1, 2, 2, 3, 3, 0, // front
        2, 3, 3, 7, 7, 6, 6, 2, // right
        0, 3, 3, 7, 7, 4, 4, 0, // down
        1, 2, 2, 6, 6, 5, 5, 1, // up
        4, 5, 5, 6, 6, 7, 7, 4, // back
        0, 1, 1, 5, 5, 4, 4, 0 // left
    ]);


    // Buffer setup
    const positionsBuffer = device.createBuffer({
        size: flatten(positions).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });


    const colorBuffer = device.createBuffer({
        size: flatten(colors).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const indexBuffer = device.createBuffer({
        size: wire_indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });


    device.queue.writeBuffer(positionsBuffer, 0, flatten(positions));
    device.queue.writeBuffer(colorBuffer, 0, flatten(colors))
    device.queue.writeBuffer(indexBuffer, 0, wire_indices);


    const positionsBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
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
        primitive: { topology: 'line-list', },
    });

    let eye = vec3(0.0, 1.0, 0.0)
    let lookat = vec3(0.5, 0.5, 0.5)
    let up = vec3(0.0, 1.0, 0.0)

    // modified from slide M_st to scale cube smaller to not clip
    const M_st = mat4(
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 0.25, 0.25,
        0.0, 0.0, 0.0, 1.0
    );


    const projection = mat4();
    projection[2][2] = -1.0;
    const view = lookAt(eye, lookat, up);
    const mvp = mult(M_st, mult(projection, view));



    const uniformBuffer = device.createBuffer({
        size: sizeof['mat4'],
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        }],
    });

    device.queue.writeBuffer(uniformBuffer, 0, flatten(mvp));


    render();



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
        pass.setIndexBuffer(indexBuffer, 'uint32');


        pass.drawIndexed(wire_indices.length);
        //pass.draw(positions.length);
        pass.end();
        device.queue.submit([encoder.finish()]);

    }

    //requestAnimationFrame(animate)
}


