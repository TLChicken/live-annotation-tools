const {
    contextBridge,
    ipcRenderer
} = require("electron");


const ipc = {
    'render': {
        // Renderer -> Main
        'send': [
            'change-keybind',
            'get-keybind-key',
            'change-color',
            'get-current-color',
            'start-overlay',
            'close-overlay',
            'set-pen-brush-size-absolute',

            'close-toolbar'

        ],
        // Main -> Renderer
        'receive': [
            'response-get-keybind-key',
            'response-get-color',
            'set-pen-brush-size-slider-value-absolute'
        ],
        // Renderer -> Main -> Renderer
        'sendReceive': []
    }
};



contextBridge.exposeInMainWorld(
    // Allowed 'ipcRenderer' methods.
    'ipcRender', {
        // From render to main.
        send: (channel, args) => {
            let validChannels = ipc.render.send;
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, args);
            }
        },
        // From main to render.
        receive: (channel, listener) => {
            console.log("received an event in overlay preloader");
            let validChannels = ipc.render.receive;
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes `sender`.
                ipcRenderer.on(channel, (event, ...args) => listener(...args));
            }
        },
        // From render to main and back again.
        invoke: (channel, args) => {
            let validChannels = ipc.render.sendReceive;
            if (validChannels.includes(channel)) {
                return ipcRenderer.invoke(channel, args);
            }
        }
    }
);