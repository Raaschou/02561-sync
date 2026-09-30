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

    let subdivideButton = document.getElementById("subdivide")
    let coarsenButton = document.getElementById("coarsen")
    // Scene setup

    let subdivs = 3
    const M = 10

    const M_SQRT2 = Math.sqrt(2.0);
    const M_SQRT6 = Math.sqrt(6.0);
    var positions = [
        vec3(0.0, 0.0, 1.0),
        vec3(0.0, 2.0 * M_SQRT2 / 3.0, -1.0 / 3.0),
        vec3(-M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
        vec3(M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
    ];
    var indices = new Uint32Array([
        0, 1, 2,
        0, 3, 1,
        1, 3, 2,
        0, 2, 3
    ]);
    let colors = [];

    function calc_indices() {
        positions = [
            vec3(0.0, 0.0, 1.0),
            vec3(0.0, 2.0 * M_SQRT2 / 3.0, -1.0 / 3.0),
            vec3(-M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
            vec3(M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
        ];
        indices = new Uint32Array([
            0, 1, 2,
            0, 3, 1,
            1, 3, 2,
            0, 2, 3
        ]);
        for (let i = 0; i < subdivs; ++i) {
            indices = subdivide_sphere(positions, indices);
        }
        console.log(indices.length)

        indexBuffer = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indexBuffer, 0, indices);
        colors = new Array(indices.length).fill(vec3(1.0, 0.0, 0.0))
        colorBuffer = device.createBuffer({
            size: flatten(colors).byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
        device.queue.writeBuffer(colorBuffer, 0, flatten(colors))


    }
    let indexBuffer = device.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    // Buffer setup
    const positionBuffer = device.createBuffer({
        size: sizeof['vec3'] * Math.pow(4, M + 1),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    console.log(positions)
    console.log(positions)
    let colorBuffer = device.createBuffer({
        size: flatten(colors).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    calc_indices()

    device.queue.writeBuffer(indexBuffer, 0, indices);

    device.queue.writeBuffer(positionBuffer, 0, flatten(positions));

    device.queue.writeBuffer(colorBuffer, 0, flatten(colors))



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

    const depthTexture = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format: 'depth24plus',
        sampleCount: 1,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
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
        /* depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus'
        }, */
        primitive: {
            topology: 'triangle-list',
            /* frontFace: "ccw",
            cullMode: "back", */
        },
    });



    let A = canvas.width / canvas.height
    let P = perspective(45.0, A, 0.1, 100.0)

    let eye = vec3(0.5, 0.5, -5.0)
    let lookat = vec3(0.0, 0.0, 0.0)
    let up = vec3(0.0, 1.0, 0.0)
    // Transformation matrix for part 1
    const M_st = mat4(
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 0.25, 0.25,
        0.0, 0.0, 0.0, 1.0
    );

    const view = lookAt(eye, lookat, up);


    const mvp = mult(P, view);


    const uniformBuffer = device.createBuffer({
        size: sizeof['mat4'] * 4,
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

    subdivideButton.addEventListener("click", function () {
        if (subdivs < 10) subdivs++;
        calc_indices()
        render()
    })
    coarsenButton.addEventListener("click", function () {
        if (subdivs > 0) subdivs--;
        calc_indices()
        render()
    })
    render();



    function render() {
        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3921, 0.5843, 0.9294, 1.0],
                storeOp: "store",
            }],
            /* depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store",
            } */
        });

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionBuffer);
        pass.setVertexBuffer(1, colorBuffer);
        pass.setBindGroup(0, bindGroup);
        pass.setIndexBuffer(indexBuffer, 'uint32');


        pass.drawIndexed(indices.length);
        //pass.draw(positions.length);
        pass.end();
        device.queue.submit([encoder.finish()]);

    }

    //requestAnimationFrame(animate)
}


