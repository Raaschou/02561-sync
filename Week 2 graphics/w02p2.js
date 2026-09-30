window.onload = function () { main(); }

function add_point(pos_array, point, size, color_array, paintColor,) {
    const offset = size / 2;
    var point_coords = [vec2(point[0] - offset, point[1] - offset), vec2(point[0] + offset, point[1] - offset),
    vec2(point[0] - offset, point[1] + offset), vec2(point[0] - offset, point[1] + offset),
    vec2(point[0] + offset, point[1] - offset), vec2(point[0] + offset, point[1] + offset)];
    // Create 6 vec3s with paintcolor for the 6 vertices of of the point
    var color_coords = Array(6).fill(vec3(paintColor));
    pos_array.push.apply(pos_array, point_coords);
    color_array.push.apply(color_array, color_coords);
}

function colorSwitch(colorName) {

    switch (colorName) {
        case "cornflower blue":
            color = cornflower
            break;
        case "black":
            color = [0.0, 0.0, 0.0, 0.0]
            break;
        case "cyan":
            color = [0.0, 1.0, 1.0, 0.9]
            break;
        case "magenta":
            color = [1.0, 0.0, 1.0, 1.0]
            break;
        case "yellow":
            color = [1.0, 1.0, 0.0, 0.7]
            break;
        case "green":
            color = [0.0, 1.0, 0.0, 0.9]
            break;
        case "red":
            color = [1.0, 0.0, 0.0, 0.8]
            break;
        case "white":
            color = [1.0, 1.0, 1.0, 1.0]
            break;
        default:
            color = cornflower

            console.error("No applicable color selected... How did you select this?")
    }
    return color
}

cornflower = [0.3921, 0.5843, 0.9294, 1.0]


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
    // Get menus and buttons
    const clearButton = document.getElementById("clearButton")
    const clearColor = document.getElementById("clearColor");

    const colorSelect = document.getElementById("colorSelect")


    context.configure({
        device: device,
        format: canvasFormat,
    });




    // Scene setup
    var selectedClearColor = "cornflower blue"
    var bgColor = colorSwitch(selectedClearColor)
    var selectedColor = "black";
    var paintColor = colorSwitch(selectedColor);
    let mousepos = 0;
    let index = 0

    const point_size = 5 * (2 / canvas.height);
    const max_no_of_points = 5000;
    const vertices_per_point = 6;


    var positions = [];
    var colors = [];

    const positionBuffer = device.createBuffer({
        size: max_no_of_points * sizeof['vec2'] * vertices_per_point,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const colorBuffer = device.createBuffer({
        size: max_no_of_points * sizeof['vec3'] * vertices_per_point,
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

    const colorBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
            offset: 0,
            shaderLocation: 1,
        }]
    }

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
            buffers: [positionBufferLayout, colorBufferLayout],
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
        // Fix offset for mouseclicks
        var bbox = ev.target.getBoundingClientRect();
        mousepos = vec2(2 * (ev.clientX - bbox.left) / canvas.width - 1,
            2 * (canvas.height - ev.clientY + bbox.top - 1) / canvas.height - 1);

        console.log(paintColor)
        add_point(positions, mousepos, point_size, colors, paintColor);

        // Using .slice(index) because flatten(positions) would just keep spitting the same first 12 coords out
        // Probably a mistake I made somewhere, but this works
        device.queue.writeBuffer(positionBuffer, index * sizeof["vec2"], flatten(positions.slice(index)))
        console.log(colors)
        device.queue.writeBuffer(colorBuffer, index * sizeof["vec3"], flatten(colors.slice(index)))
        index += vertices_per_point;
        render();
    });


    clearColor.addEventListener("change", function () {
        const index = clearColor.selectedIndex;
        selectedClearColor = clearColor[index].value;
    });

    clearButton.addEventListener("click", function () {
        positions = [];
        colors = [];
        // Index has to be set to zero to overwrite old boxes in the buffer, I think
        index = 0;

        bgColor = colorSwitch(selectedClearColor)
        render();
    });

    colorSelect.addEventListener("click", function () {
        const index = colorSelect.selectedIndex;
        selectedColor = colorSelect[index].value;
        paintColor = colorSwitch(selectedColor)
    })

    function render() {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: bgColor,
                storeOp: "store",
            }]
        });

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionBuffer);
        pass.setVertexBuffer(1, colorBuffer);
        pass.draw(positions.length);
        pass.end();
        device.queue.submit([encoder.finish()]);

    }
    // Render once to not have a black canvas before first click
    render()
}
