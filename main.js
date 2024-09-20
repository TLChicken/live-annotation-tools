process.env['ELECTRON_DISABLE_SECURITY_WARNINGS']=true
const {app, BrowserWindow, ipcMain, screen, Menu, MenuItem} = require("electron");
const shell = require('electron').shell;
// const runner = require('./app.js');
// const robot = require("robotjs");

const lbsConsts = require('./const');
const { rgba, rgbaToRbg, hexToRgba, rgba2hex, rgbToHex } = require("./models/colorUtils")

const { uIOhook, UiohookKey, WheelDirection} = require('uiohook-napi');
const { UserSettings } = require('./models/userSettings');
const { readUserData, writeUserData } = require('./models/persistence')

// var version = process.argv[1].replace('--', '');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let mainOverlayWindow;

let userSettings = new UserSettings(readUserData());

console.log(userSettings.convertToSaveJson());

// let userSettings.colorKeyBinds = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, UiohookKey.Shift, UiohookKey.P, UiohookKey.H, UiohookKey.E, UiohookKey.ArrowRight]; // Numpad 1 to 0
// let userSettings.selectedColors = lbsConsts.colorThemes_themeColors['original'];

let isInDrawingMode = false;
let isMouseDown = false;
let lastDrawnCoors = { x: -1, y: -1};

let currentlyChangingKeybindCallback = null;

let dynamicToolbarWidth = 0;
let dynamicToolbarHeight = 0;


function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 600,
    height: 600,
    webPreferences:{
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      preload: `${__dirname}/preload.js`,
    }
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/index.html?version=${version}&electron=${process.versions.electron}`);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
    closeOverlayWindow();
  })
}

function createToolbar() {

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const dispScaleFactor = screen.getPrimaryDisplay().scaleFactor;

  dynamicToolbarWidth = width * dispScaleFactor / 30;   // 64
  dynamicToolbarHeight = height * dispScaleFactor / 2;   // 500 (540)

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: dynamicToolbarWidth,
    height: dynamicToolbarHeight,
    x: 10,
    y: 30,
    // minWidth: 90,
    // minHeight: 90,
    // maxWidth: 90,
    // maxHeight: 750,
    resizable: false,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    // resizable: false,
    hasShadow: false,
    webPreferences:{
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      preload: `${__dirname}/mainToolbarPreload.js`,
      enableBlinkFeatures: 'calculate-native-win-occlusion',
    }
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/mainToolbar.html?dispWidth=${width * dispScaleFactor}&dispHeight=${height * dispScaleFactor}`);

  mainWindow.setAlwaysOnTop(true, "pop-up-menu");

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
    closeOverlayWindow();

    writeUserData(userSettings.convertToSaveJson());
  })

  createOverlayWindow();
}

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const dispScaleFactor = screen.getPrimaryDisplay().scaleFactor;

  console.log(screen.getPrimaryDisplay());

  mainOverlayWindow = new BrowserWindow({
    width: width * dispScaleFactor,
    height: height * dispScaleFactor,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    hasShadow: false,
    webPreferences:{
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      preload: `${__dirname}/overlayPreload.js`,
      zoomFactor: 1.0 / dispScaleFactor,
    }
  });

  mainOverlayWindow.loadURL(`file://${__dirname}/overlayStart.html?beginBrushColor=${userSettings.currColor}&beginBrushSize=${userSettings.brushSizes[0]}`);

  mainOverlayWindow.setAlwaysOnTop(true, "pop-up-menu");
  mainOverlayWindow.setFullScreen(true);
  mainOverlayWindow.setMinimizable(false);
  mainOverlayWindow.setResizable(false);
  mainOverlayWindow.setIgnoreMouseEvents(true, {
    forward: true
  });

  // mainOverlayWindow.setFocusable(false);
  mainOverlayWindow.setSkipTaskbar(true);  // << UNCOMMENT after testing
  // mainOverlayWindow.openDevTools();

  mainOverlayWindow.on('closed', () => { mainOverlayWindow = null });

  console.log(`Overlay size: ${width * dispScaleFactor}x${height * dispScaleFactor}`);

  isInDrawingMode = false;
  lastDrawnCoors = { x: -1, y: -1};

  // Set up Overlay Window vars from UserSettings
  for (let i = 0; i < userSettings.brushSizes.length; i++) {
    mainOverlayWindow.webContents.send('canvas-set-brush-size', userSettings.brushSizes[i], i);
  }

  mainOverlayWindow.webContents.send('canvas-changeColor', userSettings.currColor);

}

function closeOverlayWindow() {
  if (mainOverlayWindow) {
    mainOverlayWindow.close();
    mainOverlayWindow = null;
  }
}

function drawAt(x, y) {
  if (isInDrawingMode && isMouseDown && (mainOverlayWindow.isFocused())) {
    if (lastDrawnCoors.x == x && lastDrawnCoors.y == y) {
      // Skip drawing on the same coordinate
      console.log("Same as last coor");
    } else {
      // Send mouse coordinates to canvas renderer
      console.log("SEND pixel event at x: ", x, " and y: ", y);

      mainOverlayWindow.webContents.send('canvas-draw', {
        x: x,
        y: y,
        prevCoors: lastDrawnCoors
      });

      lastDrawnCoors = { x: x, y: y};
    }
  }
}

let mouseMoveTriggerOverlayMovedOnTop = false;

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  // createWindow();
  createToolbar();

  // ADD KEYBOARD SHORTCUTS
  uIOhook.on('keydown', (e) => {
    if (currentlyChangingKeybindCallback != null) {
      let changedSuccessfully = currentlyChangingKeybindCallback(e.keycode);

      if (changedSuccessfully) {
        currentlyChangingKeybindCallback = null;
      }
      return; // Dont trigger actual functions of keybind while setting it
    }

    if (userSettings.colorKeyBinds[lbsConsts.keybindIndex_toggleOverlay] === e.keycode && e.ctrlKey) {
      if (isInDrawingMode) {
        drawingModeOff();
      } else {
        drawingModeOn();
      }
    }

    if (isInDrawingMode) {

      if (userSettings.colorKeyBinds[lbsConsts.keybindIndex_selectPen] === e.keycode) {
        // Toggle Pen
        console.log("Pen Toggled");
        selectPen();
      }

      if (userSettings.colorKeyBinds[lbsConsts.keybindIndex_selectHighlighter] === e.keycode) {
        // Toggle Highlighter
        console.log("Highlighter Toggled");
        selectHighlighter();
      }

      if (userSettings.colorKeyBinds[lbsConsts.keybindIndex_selectEraser] === e.keycode) {
        // Toggle Eraser
        console.log("Eraser Toggled");
        selectEraser();
      }

      if (userSettings.colorKeyBinds[lbsConsts.keybindIndex_nextSlide] === e.keycode) {
        // Take screenshot

        // Clear Overlay

        // Use automation to go to the next slide

      }

      let colorSelectedCheck = userSettings.colorKeyBinds.findIndex((n) => n == e.keycode);
      if (colorSelectedCheck != -1 && colorSelectedCheck < 10) { // Check less than 10 as we only want to check for color keybinds
        // Change color according to selected color index

        console.log("Color changing to index ", colorSelectedCheck);
        let newColor = userSettings.selectedColors[colorSelectedCheck];
        mainOverlayWindow.webContents.send('canvas-changeColor', newColor);
        userSettings.setColor(newColor);
      }

      console.log('Keyboard event detected: ', e);
    }

  })

  uIOhook.on('mousemove', (event) => {
    drawAt(event.x, event.y);


    if (!mouseMoveTriggerOverlayMovedOnTop && isInDrawingMode) {
      uIOhook.keyToggle(UiohookKey.Ctrl, "up");
      mainWindow.show();
      // mainOverlayWindow.show();
      // mainOverlayWindow.moveTop();
      // mainWindow.moveTop();

      mouseMoveTriggerOverlayMovedOnTop = true;
    }

  });

  uIOhook.on('mousedown', (event) => {
    isMouseDown = true;
    console.log("Pressed mouse");
    drawAt(event.x, event.y);

    uIOhook.keyToggle(UiohookKey.Ctrl, "up");
    // mainWindow.show();
    // mainOverlayWindow.show();
    // mainOverlayWindow.moveTop();
    mainWindow.moveTop();

  });

  uIOhook.on('mouseup', (event) => {
    isMouseDown = false;

    lastDrawnCoors = { x: -1, y: -1}; // So I can draw on the same location again by clicking again

    uIOhook.keyToggle(UiohookKey.Ctrl, "up");
    // mainWindow.show();
    // mainOverlayWindow.show();
    // mainOverlayWindow.moveTop();
    mainWindow.moveTop();

    mouseMoveTriggerOverlayMovedOnTop = false;
  });

  uIOhook.on('wheel', (event) => {
    if (isInDrawingMode) {
      // Change brush size
      if (event.direction == WheelDirection.VERTICAL) {
        // console.log("SCROLL Rotation: " + event.rotation);
        // Scroll UP = -1
        // Scroll DOWN = 1  (page moves down when u scroll on windows)

        if (mainOverlayWindow != null) {
          if (-event.rotation > 0) {
            let newBrushSize = userSettings.brushSizeUp();
            mainOverlayWindow.webContents.send('canvas-set-brush-size', newBrushSize, null);
          } else if (-event.rotation < 0) {
            let newBrushSize = userSettings.brushSizeDown();
            mainOverlayWindow.webContents.send('canvas-set-brush-size', newBrushSize, null);
          } else {
            console.log("Wheel event with 0 vertical rotation")
          }

          // mainOverlayWindow.webContents.send('canvas-change-size-by', -event.rotation);
        }

      }
    }
  });

  uIOhook.start()

  const mainMenu = Menu.buildFromTemplate(menuTemplate)

  let colorThemesSubMenuArr = [];

  // Build Color Themes Menu
  for (let i = 0; i < lbsConsts.colorThemes_keys.length; i++) {
    const currKey = lbsConsts.colorThemes_keys[i];
    const themeName = lbsConsts.colorThemes_themeNames[currKey];
    const themeColors = lbsConsts.colorThemes_themeColors[currKey];

    let currThemeMenuItem = new MenuItem({
      click(thisMenuItem, thisBrowserWindow, thisKeyboardEvent) {
        setColorsFromTheme(currKey);
      },
      label: themeName
    });

    colorThemesSubMenuArr.push(currThemeMenuItem);
  }

  let colorThemesMenu = new MenuItem({
    label: "Color Themes",
    type: "submenu",
    submenu: colorThemesSubMenuArr
  });

  mainMenu.append(colorThemesMenu);

  Menu.setApplicationMenu(mainMenu)
});

let menuTemplate = [
  {
    label: 'View',
    submenu: [
      {
        role: 'reload'
      },
      {
        role: 'toggledevtools'
      },
      {
        type: 'separator'
      },
      {
        role: 'resetzoom'
      },
      {
        role: 'zoomin'
      },
      {
        role: 'zoomout'
      },
      {
        type: 'separator'
      },
      {
        role: 'togglefullscreen'
      }
    ]
  },

  {
    role: 'window',
    submenu: [
      {
        role: 'minimize'
      },
      {
        role: 'close'
      }
    ]
  },

  {
    role: 'Help',
    submenu: [
      {
        label:'Future Homepage',
        click() {
          shell.openExternal('https://github.com/')
        }
      },
      {
        label:'Guide',
        click() {
          shell.openExternal('https://tlchicken.github.io/')
        }
      }
    ]
  }
];

function setColorsFromTheme(themeKey) {
  let selectedTheme_colorArray = lbsConsts.colorThemes_themeColors[themeKey];
  userSettings.selectedColors = selectedTheme_colorArray;

  // Update display of colors on control panel
  for (let i = 0; i < userSettings.selectedColors.length; i++) {
    let currColor = userSettings.selectedColors[i];
    let currColorHex = rgbToHex(rgbaToRbg(currColor));
    let colorInputHtmlEleName =  "color" + (i + 1).toString();

    console.log("TEST " + rgbaToRbg(currColor));

    console.log("Setting Color " + i + " to " + currColor + " hex: " + currColorHex + "   HTML ELE: " + colorInputHtmlEleName);
    mainWindow.webContents.send('response-get-color', currColorHex, colorInputHtmlEleName);
  }

}


// PRE CONDITIONS: The overlay window is alr open
function drawingModeOn() {
  mainOverlayWindow.setIgnoreMouseEvents(false, {
    forward: false
  });

  isInDrawingMode = true;

  mainOverlayWindow.webContents.send('draw-mode-activated', "param");

  // Possible fix for Window's 10 dumb focus issue using robotJS
  // https://github.com/electron/electron/issues/2867#issuecomment-1685786893

  // Fixed!!!!!!!!!!!!
  // Windows 10 does not allow apps to steal focus from other windows unless the app that
  // is stealing the focus is already in focus originally. This causes some user experience issues
  // EG: Open overlay then change ink color before drawing anything - The ink color keyboard shortcut
  // will change the ink color but it will also input that key into whatever app was in focus before
  // the overlay was opened

  // WORKAROUND: Need to have a mouse or keyboard event originating from this app before
  // it tries to steal focus from other windows
  uIOhook.keyToggle(UiohookKey.Ctrl, "up");
  mainOverlayWindow.show();
  mainOverlayWindow.focus({steal: true});

  mainWindow.webContents.send("enter-drawing-mode");

  mainWindow.show();

  console.log("Started Drawing Mode");
}

// PRE CONDITIONS: The overlay window is alr open
function drawingModeOff() {
  mainOverlayWindow.setIgnoreMouseEvents(true, {
    forward: true
  });

  isInDrawingMode = false;

  mainOverlayWindow.webContents.send('draw-mode-unactivated', "param");

  console.log("Stopped Drawing Mode");

  // So that ink goes above toolbar while drawing, and then toolbar goes
  // back above ink after drawing
  mainWindow.show();

  mainWindow.webContents.send("exit-drawing-mode");
}

function selectPen() {
  mainOverlayWindow.webContents.send('canvas-choose-pen', "param");

  mainWindow.webContents.send("activate-pen");

  userSettings.brushType = 0;
}

function selectHighlighter() {
  mainOverlayWindow.webContents.send('canvas-choose-highlighter', "param");

  mainWindow.webContents.send("activate-highlighter");

  userSettings.brushType = 0;
}

function selectEraser() {
  mainOverlayWindow.webContents.send('canvas-choose-eraser', "param");

  mainWindow.webContents.send("activate-eraser");

  userSettings.brushType = 1;
}

function selectEraseAll() {
  mainOverlayWindow.webContents.send('canvas-erase-all');
}

function changeKeybind(keybindIndex, changedSuccessfullyCallback) {
  // Next time pop up a please enter key window

  currentlyChangingKeybindCallback = ( detectedKey ) => {
    // Put into keybind array
    if (userSettings.colorKeyBinds.includes(detectedKey)) {
      // Display Error
      console.log("Keybind not changed, CONFLICTING KEY")
      return false;

    } else {
      userSettings.colorKeyBinds[keybindIndex - 1] = detectedKey;
      console.log("Keybind Changed Successfully");
      console.log(lbsConsts.UiohookKeyREVERSE[detectedKey]);

      changedSuccessfullyCallback(lbsConsts.UiohookKeyREVERSE[detectedKey]);
      return true;
    }
  }

}

function changeColor(colorIndex, newColor, changedSuccessfullyCallback) {
  // Next time pop up a please enter key window

  userSettings.selectedColors[colorIndex - 1] = hexToRgba(newColor);
  console.log("Color " + colorIndex + " Changed Successfully to " + newColor + "   converted: " + hexToRgba(newColor));
  console.log("New value in arr: " + userSettings.selectedColors[colorIndex - 1]);
  changedSuccessfullyCallback(newColor);

}

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  //if (process.platform !== 'darwin') {
    app.quit()
  //}
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    // createWindow();
    createToolbar();
  }
});

// ipcMain.on("run", (event, args) => {
//   runner.run(mainWindow);
// });

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

ipcMain.on("start-overlay", (event, args) => {
  if (!mainOverlayWindow) {
    createOverlayWindow();
  }
})

ipcMain.on("close-overlay", (event, args) => {
  closeOverlayWindow();
})

ipcMain.on("change-keybind", (event, args) => {
  console.log("Change Keybind Event RECEIVED");
  console.log(args);

  changeKeybind(args.colorIndex, ( newKeyString ) => {
    mainWindow.webContents.send('response-get-keybind-key', newKeyString, args.textHtmlEle)
  });
})


ipcMain.on("change-color", (event, args) => {
  console.log("Change Color Event RECEIVED");
  console.log(args);
  changeColor(args.colorIndex, args.newColor, ( newColorString ) => {
    mainWindow.webContents.send('response-get-color', rgbToHex(rgbaToRbg(newColorString)), args.textHtmlEle)
  });
})

ipcMain.on("set-pen-brush-size-absolute", (event, args) => {
  console.log("Setting pen brush size from control panel: " + args.newBrushSize);
  if (mainOverlayWindow != null) {
    mainOverlayWindow.webContents.send('canvas-set-brush-size', args.newBrushSize, null);
  }
})

ipcMain.on("set-menu-brush-size-slider-value", (event, args) => {
  mainWindow.webContents.send("set-pen-brush-size-slider-value-absolute", args.newBrushSize);
})







ipcMain.on("toggle-drawing-mode", (event, args) => {
  if (isInDrawingMode) {
    drawingModeOff();
  } else {
    drawingModeOn();
  }
})

ipcMain.on("select-pen", (event, args) => {
  selectPen();
})

ipcMain.on("select-highlighter", (event, args) => {
  selectHighlighter();
})

ipcMain.on("select-eraser", (event, args) => {
  selectEraser();
})

ipcMain.on("select-erase-all", (event, args) => {
  selectEraseAll();
})


ipcMain.on("close-toolbar", (event, args) => {
  mainWindow.close();
})

ipcMain.on("resize-window-absolute", (event, args) => {
  console.log("Main Toolbar Window Resize Event RECEIVED");
  console.log(args);

  // BrowserWindow set size cannot shrink resizable window but can grow it - Weird Electron Bug
  // https://github.com/electron/electron/issues/15560
  // Workaround is to make the window resizable first then set it then make it unresizable again
  mainWindow.setResizable(true);
  mainWindow.setSize(args.width, args.height);
  // mainWindow.setResizable(false);

})