window.api.send("run");
window.api.receive("fromMain", (documentId, data) => {
    document.getElementById(documentId).innerHTML = data;
});

document.addEventListener('DOMContentLoaded', (event) => {
    document.getElementById('open-overlay').addEventListener('click', () => {
        window.ipcRender.send("start-overlay");
    })

    document.getElementById('close-overlay').addEventListener('click', () => {
        window.ipcRender.send("close-overlay");
    })

    document.querySelector('.color-key-list').addEventListener('click', (event) => {
        const target = event.target;
        if (target.tagName === 'BUTTON' && target.id.startsWith('kb-color')) {
            const buttonId = target.id;
            console.log('Button clicked:', buttonId.slice(8));

            // Perform actions based on the buttonId
            window.ipcRender.send("change-keybind", { colorIndex: parseInt(buttonId.slice(8), 10), textHtmlEle: buttonId });
        }
    });


    // FIX BUG
    document.querySelector('.color-key-list').addEventListener('click', (event) => {
        const target = event.target;
        if (target.tagName === 'INPUT' && target.id.startsWith('color')) {
            const colorInputId = target.id;
            console.log('Color Input clicked:', colorInputId.slice(5));

            // Perform actions based on the color input ID
            window.ipcRender.send("change-color", { colorIndex: parseInt(colorInputId.slice(5), 10), newColor: target.value, textHtmlEle: colorInputId });
        }
    });



    document.getElementById('kb-toggle-overlay').addEventListener('click', (event) => {
        const target = event.target;
        window.ipcRender.send("change-keybind", { colorIndex: 11, textHtmlEle: target.id });
    });

    document.getElementById('kb-choose-pen').addEventListener('click', (event) => {
        const target = event.target;
        window.ipcRender.send("change-keybind", { colorIndex: 12, textHtmlEle: target.id });
    });

    document.getElementById('kb-choose-highlighter').addEventListener('click', (event) => {
        const target = event.target;
        window.ipcRender.send("change-keybind", { colorIndex: 13, textHtmlEle: target.id });
    });

    document.getElementById('kb-choose-eraser').addEventListener('click', (event) => {
        const target = event.target;
        window.ipcRender.send("change-keybind", { colorIndex: 14, textHtmlEle: target.id });
    });

    window.ipcRender.receive("response-get-keybind-key", ( keyString, textHtmlEle ) => {
        console.log("New keystring received: ", keyString);
        document.getElementById(textHtmlEle).innerText = keyString;
    });

    window.ipcRender.receive("response-get-color", ( colorString, textHtmlEle ) => {
        console.log("New colorstring received: ", colorString);
        document.getElementById(textHtmlEle).value = colorString;
    });
});

