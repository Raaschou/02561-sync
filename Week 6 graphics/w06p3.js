window.onload = function () { main(); }

async function main() {
    // Get the context and devices
    const canvas = document.querySelector("canvas");

    const adapter = await navigator.gpu.requestAdapter();

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu");

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({ device: device, format: canvasFormat });


    // Get earth file
    let filename = "earth.jpg";
    const response = await fetch(filename);
    const blob = await response.blob();
    const img = await createImageBitmap(blob, { colorSpaceConversion: "none" });



    // Get buttons from html
    let subdivideButton = document.getElementById("subdivide")
    let coarsenButton = document.getElementById("coarsen")
    let orbitButton = document.getElementById("orbit")
    // Scene setup

    let subdivs = 3
    const M = 10

    let orbiting = false;
    let orbitAngle = 0.0;
    let radius = 5.0
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
    let colors = [
        vec3(1.0, 1.0, 0.0),
        vec3(1.0, 0.0, 1.0),
        vec3(0.0, 1.0, 1.0),
        vec3(1.0, 1.0, 1.0),
    ];

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
        colors = [
            vec3(0.0, 0.0, 1.0),
            vec3(0.0, 2.0 * M_SQRT2 / 3.0, -1.0 / 3.0),
            vec3(-M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
            vec3(M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
        ];

        for (let i = 0; i < subdivs; ++i) {
            indices = subdivide_sphere(positions, indices, colors);
        }
        console.log(indices.length)
        if (indexBuffer) {
            indexBuffer.destroy();
        }

        indexBuffer = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        colorBuffer = device.createBuffer({
            size: flatten(colors).byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indexBuffer, 0, indices);
        device.queue.writeBuffer(colorBuffer, 0, flatten(colors))
        device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
    }


    // Create texture from image
    let myTexture = device.createTexture({
        size: [img.width, img.height, 1],
        format: "rgba8unorm",
        mipLevelCount: true ? numMipLevels(img.width, img.height) : 1,
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });

    device.queue.copyExternalImageToTexture(
        { source: img, flipY: true },
        { texture: myTexture },
        { width: img.width, height: img.height },
    );

    if (true) generateMipmap(device, myTexture);


    // Buffer setup

    let indexBuffer = device.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    const positionBuffer = device.createBuffer({
        size: sizeof['vec3'] * Math.pow(4, M + 1),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });



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

    // Wgsl import
    const wgslfile = document.getElementById('wgsl').src;
    const wgslcode
        = await fetch(wgslfile, { cache: "reload" }).then(r => r.text());
    const wgsl = device.createShaderModule({
        code: wgslcode
    });

    // Render pipeline
    const depthTexture = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format: 'depth24plus',
        sampleCount: 1,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const pipeline = device.createRenderPipeline({
        label: "render pipeline",
        layout: 'auto',
        vertex: {
            label: "vs in pipeline",
            module: wgsl,
            entryPoint: 'main_vs',
            buffers: [positionsBufferLayout, colorBufferLayout],
        },
        fragment: {
            label: "fs in pipeline",
            module: wgsl,
            entryPoint: 'main_fs',
            targets: [{ format: canvasFormat }],
        },
        depthStencil: {
            label: "ds in pipeline",
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus'
        },
        primitive: {
            label: "primitive in pipeline",
            topology: 'triangle-list',
            frontFace: "ccw",
            cullMode: "back",
        },
    });
    let lookat = vec3(0.0, 0.0, 0.0)
    let up = vec3(0.0, 1.0, 0.0)

    let A = canvas.width / canvas.height
    let P = perspective(45.0, A, 0.1, 100.0)


    function animate() {

        if (orbiting) {
            orbitAngle += 0.01
            // Rotate the eye space around sphere
            // radius = 5.0 
            let eye = vec3(radius * Math.sin(orbitAngle), 0.0, radius * Math.cos(orbitAngle))
            const view = lookAt(eye, lookat, up);
            const mvp = mult(P, view);

            device.queue.writeBuffer(uniformBuffer, 0, flatten(mvp));
            requestAnimationFrame(animate)
        } else {
            let eye = vec3(0.5, 0.5, 5.0)

            const view = lookAt(eye, lookat, up);

            const mvp = mult(P, view);
            device.queue.writeBuffer(uniformBuffer, 0, flatten(mvp));
        }
        render()
    }

    let sampler = device.createSampler({
        label: "Texture sampler",
        addressModeU: "repeat",
        addressModeV: "repeat",
        minFilter: "nearest",
        magFilter: "nearest",
        mipmapFilter: "linear"
    });

    const uniformBuffer = device.createBuffer({
        label: "uniform buffer",
        size: sizeof['mat4'] * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        label: "bind group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: myTexture.createView() },
            { binding: 2, resource: { buffer: uniformBuffer } }
        ]
    });


    // Button eventlisteners
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
    orbitButton.addEventListener("click", function () {
        orbiting = !orbiting
        requestAnimationFrame(animate)
    })



    function render() {
        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3921, 0.5843, 0.9294, 1.0],
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store",
            }
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

    requestAnimationFrame(animate)
}


