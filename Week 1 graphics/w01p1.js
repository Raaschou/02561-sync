
window.onload = function () { main(); }

async function main() {
    const canvas = document.querySelector("canvas");

    // Retrofitted error handling from codelabs "Your First WebGPU app"
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

    const encoder = device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: [0.3921, 0.5843, 0.9294, 1.0],
            storeOp: "store",
        }]
    });




    pass.end();

    device.queue.submit([encoder.finish()]);

}
