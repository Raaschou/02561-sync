window.onload = function () { main(); }

function add_point(array, point, size) {
    const offset = size / 2;
    var point_coords = [vec2(point[0] - offset, point[1] - offset), vec2(point[0] + offset, point[1] - offset),
    vec2(point[0] - offset, point[1] + offset), vec2(point[0] - offset, point[1] + offset),
    vec2(point[0] + offset, point[1] - offset), vec2(point[0] + offset, point[1] + offset)];
    array.push.apply(array, point_coords);
}




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
    let mousepos = 0;
    let index = 0
    const point_size = 5 * (2 / canvas.height);
    const max_no_of_points = 5000;
    const vertices_per_point = 6;


    var positions = [];


    const positionBuffer = device.createBuffer({
        size: max_no_of_points * sizeof['vec2'] * vertices_per_point,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    //device.queue.writeBuffer(positionBuffer, /*bufferOffset=*/0, flatten(positions));


    const positionBufferLayout = {
        arrayStride: sizeof['vec2'],
        attributes: [{
            format: 'float32x2',
            offset: 0,
            shaderLocation: 0, // Position, see vertex shader
        }],
    };

    const wgslfile = document.getElementById('wgsl').src;
    const wgslcode
        = await fetch(wgslfile, { cache: "reload" }).then(r => r.text());
    const wgsl = device.createShaderModule({
        code: wgslcode
    });

    // Render setup

    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: wgsl,
            entryPoint: 'main_vs',
            buffers: [positionBufferLayout],
        },
        fragment: {
            module: wgsl,
            entryPoint: 'main_fs',
            targets: [{ format: canvasFormat }],
        },
        primitive: { topology: 'triangle-list', },
    });


    canvas.addEventListener("click", function (ev) {
        // var postions = [];

        var bbox = ev.target.getBoundingClientRect();
        mousepos = vec2(2 * (ev.clientX - bbox.left) / canvas.width - 1,
            2 * (canvas.height - ev.clientY + bbox.top - 1) / canvas.height - 1);

        add_point(positions, mousepos, point_size);

        // Using .slice(index) because flatten(positions) would just keep spitting the same first 12 coords out
        // Probably a mistake I made somewhere, but this works
        device.queue.writeBuffer(positionBuffer, index * sizeof["vec2"], flatten(positions.slice(index)))

        index += vertices_per_point;

        render();
    });

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
        pass.setVertexBuffer(0, positionBuffer);
        pass.draw(positions.length);
        pass.end();
        device.queue.submit([encoder.finish()]);

    }
    // Render once to not have a black canvas before first click
    render()
}
