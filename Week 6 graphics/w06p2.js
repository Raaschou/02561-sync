window.onload = function () { main(); }

function checkerBoard(texSize, myTexels) {
    const numRows = 8
    const numCols = 8
    for (var i = 0; i < texSize; ++i)
        for (var j = 0; j < texSize; ++j) {
            var patchx = Math.floor(i / (texSize / numRows));
            var patchy = Math.floor(j / (texSize / numCols));
            var c = (patchx % 2 !== patchy % 2 ? 255 : 0);
            var idx = 4 * (i * texSize + j);
            myTexels[idx] = myTexels[idx + 1] = myTexels[idx + 2] = c;
            myTexels[idx + 3] = 255;
        }
    return myTexels;
}

function onSamplerChange() {
    addressU = uSelect.value;
    addressV = vSelect.value;
    minFilter = minSelect.value;
    magFilter = magSelect.value;
    mipmapFilter = mipmapSelect.value;

    updateSampler();
    render();
}


async function main() {

    // Get the context and devices
    const canvas = document.querySelector("canvas");

    const adapter = await navigator.gpu.requestAdapter();

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu");

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({ device: device, format: canvasFormat });


    // Get selects and their values 
    const uSelect = document.getElementById("U");
    const vSelect = document.getElementById("V");
    const minSelect = document.getElementById("minification");
    const magSelect = document.getElementById("magnification");
    const mipmapSelect = document.getElementById("mipmap");

    let addressU = uSelect.value
    let addressV = vSelect.value
    let minFilter = minSelect.value
    let magFilter = magSelect.value
    let mipmapFilter = mipmapSelect.value





    // Variables
    const texSize = 64;
    let sampler;
    let bindGroup;

    let rectangle = [
        vec3(-4, -1, -1),
        vec3(4, -1, -1),
        vec3(4, -1, -21),
        vec3(-4, -1, -21),
    ];

    let texCoords = [
        vec2(-1.5, 0.0),
        vec2(2.5, 0.0),
        vec2(2.5, 10.0),
        vec2(-1.5, 10.0)
    ]

    let indices = new Uint32Array([
        0, 1, 2,
        0, 2, 3
    ]);

    let myTexels = new Uint8Array(4 * texSize * texSize); // 4 for RGBA image, texSize is the resolution

    // Use checkerboard function to create texture
    let checkerBoardTexture = checkerBoard(texSize, myTexels)

    // Scene setup

    // Rectangle/postions buffer
    const positionsBuffer = device.createBuffer({
        label: "positions buffer",
        size: flatten(rectangle).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(positionsBuffer, 0, flatten(rectangle))

    const positionsBufferLayout = {
        label: "pos buffer layout",
        arrayStride: sizeof["vec3"],
        attributes: [{
            format: "float32x3",
            offset: 0,
            shaderLocation: 0,
        }]
    }

    // Texture coordinates buffer
    const textureBuffer = device.createBuffer({
        label: "texture buffer",
        size: flatten(texCoords).byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })

    device.queue.writeBuffer(textureBuffer, 0, flatten(texCoords))
    const textureBufferLayout = {
        label: "texture buffer layout",
        arrayStride: sizeof["vec2"],
        attributes: [{
            format: "float32x2",
            offset: 0,
            shaderLocation: 1,
        }]
    }

    // index buffer
    const indexBuffer = device.createBuffer({
        label: "index buffer",
        size: flatten(indices).byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })

    device.queue.writeBuffer(indexBuffer, 0, indices)





    const myTexture = device.createTexture({
        label: "checkerboard texture",
        size: [texSize, texSize, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING
    });

    device.queue.writeTexture(
        { texture: myTexture },
        checkerBoardTexture,
        { offset: 0, bytesPerRow: texSize * 4, rowsPerImage: texSize },
        [texSize, texSize, 1]
    );




    // Import wgsl file
    const wgslfile = document.getElementById("wgsl").src;
    const wgslcode = await fetch(wgslfile, { cache: "reload" }).then(r => r.text());
    const wgsl = device.createShaderModule({ code: wgslcode });

    // Render pipeline
    const pipeline = device.createRenderPipeline({
        label: "render pipeline",
        layout: "auto",
        vertex: {
            label: "vertex shader",
            module: wgsl,
            entryPoint: "main_vs",
            buffers: [positionsBufferLayout, textureBufferLayout]
        },
        fragment: {
            label: "fragment shader",
            module: wgsl,
            entryPoint: "main_fs",
            targets: [{ format: canvasFormat }],
        },
        primitive: { label: "primitive triangle list", topology: "triangle-list" },
    })


    // View setup
    let eye = vec3(0.0, 0.0, 0.0)
    let lookat = vec3(0.0, 0.0, 0.0)
    let up = vec3(0.0, 1.0, 0.0)

    let A = canvas.width / canvas.height
    let mvp_perspective = perspective(90.0, A, 0.1, 100.0)

    const view = lookAt(eye, lookat, up)
    const mvp = mult(mvp_perspective, view)

    // Uniform buffer and bind group
    const uniformBuffer = device.createBuffer({
        label: "uniformBuffer",
        size: sizeof['mat4'],
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });



    device.queue.writeBuffer(uniformBuffer, 0, flatten(mvp))


    function updateSampler() {
        if (mipmapFilter === "none") {
            sampler = device.createSampler({
                label: "Texture sampler",
                addressModeU: addressU,
                addressModeV: addressV,
                minFilter: minFilter,
                magFilter: magFilter,
            });
        } else {
            sampler = device.createSampler({
                label: "Texture sampler",
                addressModeU: addressU,
                addressModeV: addressV,
                minFilter: minFilter,
                magFilter: magFilter,
                mipmapFilter: mipmapFilter
            });
        }
        bindGroup = device.createBindGroup({
            label: "bind group",
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: myTexture.createView() },
                { binding: 2, resource: { buffer: uniformBuffer } }
            ]
        });
    }
    updateSampler();
    // Event listeners are here because they invoke the pipeline
    uSelect.addEventListener("change", function () {
        addressU = uSelect.value;
        updateSampler()
        render()
    });
    vSelect.addEventListener("change", function () {
        addressV = vSelect.value;
        updateSampler()
        render()
    });
    minSelect.addEventListener("change", function () {
        minFilter = minSelect.value;
        updateSampler()
        render()
    });
    magSelect.addEventListener("change", function () {
        magFilter = magSelect.value;
        updateSampler()
        render()
    });
    mipmapSelect.addEventListener("change", function () {
        mipmapFilter = mipmapSelect.value;
        updateSampler()
        render()
    });


    render();

    function render() {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            label: "pass encoder",
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3921, 0.5843, 0.9294, 1.0],
                storeOp: "store",
            }]
        })

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionsBuffer);
        pass.setVertexBuffer(1, textureBuffer);
        pass.setBindGroup(0, bindGroup);
        pass.setIndexBuffer(indexBuffer, 'uint32');
        pass.drawIndexed(indices.length);
        pass.end()
        device.queue.submit([encoder.finish()]);

    }
}