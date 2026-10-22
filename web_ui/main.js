
// ============================================================
// SERVO CALIBRATION OFFSETS
// Adjust these if the arm is offset or reversed.
// ============================================================
const SHOULDER_OFFSET = 45;   // degrees added to IK shoulder angle
const ELBOW_INVERT = false;   // set true if elbow moves in wrong direction after fix

// Initialize Three.js scene with enhanced visuals
const scene = new THREE.Scene();

// Camera positioned along z-axis, looking towards x-y plane
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

function adjustCameraForScreen() {
    // Zoom out by ~30% so you have plenty of room to drag the red ball to full extension without hitting screen edges
    const isMobile = window.innerWidth <= 768;
    const zDist = isMobile ? -19 : -14;
    const yOffset = isMobile ? 2.5 : 0;
    camera.position.set(0, yOffset, zDist);
    camera.lookAt(0, yOffset - 0.5, 0);
}
adjustCameraForScreen(); 

// Enhanced Renderer
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0a0a, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- BLOOM POST-PROCESSING SETUP ---
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, 0.4, 0.85
);
composer.addPass(bloomPass);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 10, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);

const pointLight = new THREE.PointLight(0x00ffff, 0.5, 100);
pointLight.position.set(0, 5, 0);
scene.add(pointLight);

// Environment
const gridHelper = new THREE.GridHelper(25, 25, 0x00ffff, 0x004444);
gridHelper.position.y = -0.01;
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(6);
scene.add(axesHelper);

// Target Sphere
const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const sphereMaterial = new THREE.MeshPhongMaterial({
    color: 0xff0040,
    emissive: 0x880022,
    specular: 0xffffff,
    shininess: 100
});

const sphereGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.4 })
);
scene.add(sphereGlow);

const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
sphere.position.set(4, 4, 0);
sphere.castShadow = true;
scene.add(sphere);

// Robot lengths and materials
const L1 = 3.0;
const L2 = 3.0;
const robotMaterial = new THREE.MeshPhongMaterial({ color: 0x0088ff, emissive: 0x002244, shininess: 30 });
const jointMaterial = new THREE.MeshPhongMaterial({ color: 0xffaa00, emissive: 0x442200, shininess: 50 });

// Shoulder Joint
const shoulderJoint = new THREE.Group();
scene.add(shoulderJoint);

const baseJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2), jointMaterial);
baseJoint.position.z = 0.1;
shoulderJoint.add(baseJoint);

const arm1Mesh = new THREE.Mesh(new THREE.BoxGeometry(L1, 0.4, 0.1), robotMaterial);
arm1Mesh.position.x = L1 / 2;
arm1Mesh.castShadow = true;
shoulderJoint.add(arm1Mesh);

// Elbow Joint
const elbowJoint = new THREE.Group();
elbowJoint.position.x = L1;
shoulderJoint.add(elbowJoint);

const elbowJointMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.15), jointMaterial);
elbowJointMesh.position.z = 0.075;
elbowJoint.add(elbowJointMesh);

const arm2Mesh = new THREE.Mesh(new THREE.BoxGeometry(L2, 0.3, 0.1), robotMaterial);
arm2Mesh.position.x = L2 / 2;
arm2Mesh.castShadow = true;
elbowJoint.add(arm2Mesh);

// UI Setup
const coordinateDiv = document.createElement('div');
coordinateDiv.style.position = 'absolute';
coordinateDiv.style.top = '10px';
coordinateDiv.style.left = '10px';
coordinateDiv.style.color = 'white';
coordinateDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
coordinateDiv.style.padding = '10px';
coordinateDiv.style.fontFamily = 'monospace';
document.body.appendChild(coordinateDiv);

// --- WEBSOCKET & SERIAL COMMUNICATION LOGIC ---
let port;
let writer;
let wsClient = null;
let isSerialConnected = false;
let lastSendTime = 0;
let lastSentData = "";
const sendInterval = 50; // Set to 50ms for smooth real-time control
const encoder = new TextEncoder(); // Converts string to bytes

function initWebSocket() {
    if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
        return;
    }
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname || 'localhost';
    const wsUrl = `${wsProto}//${wsHost}:8765`;

    try {
        console.log("Connecting to WebSocket:", wsUrl);
        wsClient = new WebSocket(wsUrl);

        wsClient.onopen = () => {
            isSerialConnected = true;
            updateConnectionStatus("Connected (WebSocket ⚡)");
            console.log("🚀 WebSocket connected with zero-latency streaming!");
        };

        wsClient.onclose = () => {
            isSerialConnected = false;
            updateConnectionStatus("Disconnected");
            console.log("WebSocket closed. Retrying in 2s...");
            setTimeout(initWebSocket, 2000);
        };

        wsClient.onerror = (err) => {
            console.warn("WebSocket error, falling back to HTTP tunnel:", err);
            isSerialConnected = true; // Still allow sending commands via HTTP tunnel!
            updateConnectionStatus("Connected (Tunnel 🌐)");
        };
    } catch (e) {
        console.error("Failed to initialize WebSocket:", e);
    }
}

async function connectSerial() {
    if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
        initWebSocket();
    } else {
        isSerialConnected = !isSerialConnected;
        updateConnectionStatus(isSerialConnected ? "Connected (WebSocket ⚡)" : "Disconnected");
    }
}

async function readLoop() {
    if (!port || !port.readable) return;
    const reader = port.readable.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            console.log("🤖 Arduino:", decoder.decode(value));
        }
    } catch (err) {
        console.error("Read error:", err);
    } finally {
        reader.releaseLock();
    }
}

function updateConnectionStatus(status) {
    const statusDiv = document.getElementById('connectionStatus');
    if (statusDiv) {
        statusDiv.textContent = status;
        statusDiv.style.color = (status === "Connected") ? "#4CAF50" : "#f44336";
    }
}

// --- MANUAL DEBUG / CALIBRATION MODE ---
let isManualDebug = false;
let debugS = 90, debugE = 90, debugB = 90;

document.addEventListener('DOMContentLoaded', () => {

    const toggle = document.getElementById('manualDebugToggle');
    const panel = document.getElementById('debugControls');
    const slS = document.getElementById('sliderS');
    const slE = document.getElementById('sliderE');
    const slB = document.getElementById('sliderB');
    const valS = document.getElementById('sliderSVal');
    const valE = document.getElementById('sliderEVal');
    const valB = document.getElementById('sliderBVal');

    if (toggle) {
        toggle.addEventListener('change', (e) => {
            isManualDebug = e.target.checked;
            panel.style.display = isManualDebug ? 'block' : 'none';
        });
    }

    if (slS) slS.addEventListener('input', (e) => { debugS = parseInt(e.target.value); valS.textContent = `${debugS}°`; });
    if (slE) slE.addEventListener('input', (e) => { debugE = parseInt(e.target.value); valE.textContent = `${debugE}°`; });
    if (slB) slB.addEventListener('input', (e) => { debugB = parseInt(e.target.value); valB.textContent = `${debugB}°`; });
});

// --- CLAW & BASE MOTOR STATE ---
let configuredClawSpeed = 70; // Configured speed from slider (20% - 100%)
let currentClawSpeed = 0;     // Active speed sent over Wi-Fi
let currentBaseJog = "";       // "up" (left), "down" (right), or ""

function setClaw(speed, label, color) {
    currentClawSpeed = speed;
    const lbl = document.getElementById('clawState');
    if (lbl) {
        lbl.textContent = label;
        lbl.style.color = color;
    }
}

function setBaseMotor(direction, label, color) {
    currentBaseJog = direction;
    const lbl = document.getElementById('baseMotorState');
    if (lbl) {
        lbl.textContent = label;
        lbl.style.color = color;
    }
}

document.addEventListener('DOMContentLoaded', () => {

    // Claw Speed Slider
    const clawSlider = document.getElementById('clawSpeedSlider');
    const clawVal = document.getElementById('clawSpeedVal');
    if (clawSlider) {
        clawSlider.addEventListener('input', (e) => {
            configuredClawSpeed = parseInt(e.target.value);
            if (clawVal) clawVal.textContent = `${configuredClawSpeed}%`;
        });
    }

    // Helper to bind both mouse and touch for momentary hold-to-run
    function bindHoldAction(btn, onStart, onEnd) {
        if (!btn) return;
        // Mouse events (laptop / desktop)
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(); });
        btn.addEventListener('mouseup', (e) => { e.preventDefault(); onEnd(); });
        btn.addEventListener('mouseleave', () => onEnd());
        // Touch events (mobile phones / tablets)
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onStart();
        }, { passive: false });
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onEnd();
        }, { passive: false });
        btn.addEventListener('touchcancel', () => onEnd());
    }

    // Claw Buttons (Hold to Run)
    const btnOpen = document.getElementById('btnClawOpen');
    const btnClose = document.getElementById('btnClawClose');

    bindHoldAction(
        btnOpen,
        () => setClaw(-configuredClawSpeed, `OPENING`, "#00ff88"),
        () => setClaw(0, "STOPPED", "#ffaa00")
    );

    bindHoldAction(
        btnClose,
        () => setClaw(+configuredClawSpeed, `CLOSING`, "#ff0055"),
        () => setClaw(0, "STOPPED", "#ffaa00")
    );

    // Base Motor Buttons (Hold to Run)
    const btnBaseLeft = document.getElementById('btnBaseLeft');
    const btnBaseRight = document.getElementById('btnBaseRight');

    bindHoldAction(
        btnBaseLeft,
        () => setBaseMotor("up", "SPINNING LEFT", "#00ffaa"),
        () => setBaseMotor("", "STOPPED", "#888")
    );

    bindHoldAction(
        btnBaseRight,
        () => setBaseMotor("down", "SPINNING RIGHT", "#ffaa00"),
        () => setBaseMotor("", "STOPPED", "#888")
    );

    // Idle Button
    const btnIdle = document.getElementById('btnIdleMode');
    if (btnIdle) {
        btnIdle.addEventListener('click', toggleIdleMode);
    }

    // Keyboard controls (Hold-to-Run):
    // 'I' = Hold to Open, 'L' = Hold to Close
    // 'ArrowLeft' = Spin Left, 'ArrowRight' = Spin Right
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.repeat) return; // Prevent repeated triggers while held

        const key = e.key.toLowerCase();
        if (key === 'i') {
            setClaw(configuredClawSpeed, `OPENING (+${configuredClawSpeed}%)`, "#00ff88");
        } else if (key === 'l') {
            setClaw(-configuredClawSpeed, `CLOSING (-${configuredClawSpeed}%)`, "#ff0055");
        } else if (e.key === 'ArrowLeft') {
            setBaseMotor("up", "SPINNING LEFT", "#00ffaa");
        } else if (e.key === 'ArrowRight') {
            setBaseMotor("down", "SPINNING RIGHT", "#ffaa00");
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const key = e.key.toLowerCase();
        if (key === 'i' || key === 'l') {
            setClaw(0, "STOPPED", "#ffaa00");
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            setBaseMotor("", "STOPPED", "#888");
        }
    });
});

function getDisplayAngles() {
    if (isManualDebug) {
        return {
            base: Math.abs(debugB),
            shoulder: Math.abs(debugS),
            elbow: Math.abs(debugE)
        };
    }
    // Exact absolute positive degrees, no offsets
    const base = Math.abs(Math.round(currentBaseRotation * (180 / Math.PI)));
    const shoulder = Math.abs(Math.round(currentShoulderAngle * (180 / Math.PI)));
    const elbow = Math.abs(Math.round(currentElbowAngle * (180 / Math.PI)));
    return { base, shoulder, elbow };
}

function prepareRobotData() {
    const { base, shoulder, elbow } = getDisplayAngles();
    const elbowangle = Math.abs(elbow - 180);
    let pkt = `B${base},S${shoulder},E${elbowangle},C${currentClawSpeed}`;
    if (currentBaseJog) {
        pkt += `,J${currentBaseJog}`;
    }
    return pkt + "\n";
}

function updateAngleDisplay(baseDeg, shoulderDeg, elbowDeg) {
    const { base, shoulder, elbow } = getDisplayAngles();
    const b = document.getElementById('baseAngle');
    const s = document.getElementById('shoulderAngle');
    const e = document.getElementById('elbowAngle');
    if (b) b.textContent = base;
    if (s) s.textContent = shoulder;
    if (e) e.textContent = elbow;
}

// Mouse controls
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false;
let currentShoulderAngle = 0, currentElbowAngle = 0, currentBaseRotation = 0;
const smoothing = 0.35; // Increased responsiveness for instant motion

document.addEventListener('mousedown', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.intersectObject(sphere).length > 0) isDragging = true;
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    const planeXY = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersection = new THREE.Vector3();
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(planeXY, intersection)) {
        sphere.position.x = intersection.x;
        sphere.position.y = Math.max(0, intersection.y);
    }
});

document.addEventListener('mouseup', () => isDragging = false);

// UI Listeners
document.addEventListener('DOMContentLoaded', () => {

    const btn = document.getElementById('connectButton');
    if (btn) btn.addEventListener('click', connectSerial);
});

// --- IDLE ANIMATION ROUTINE (Smooth Sine Waves + Simultaneous Claw Action) ---
let isIdleRunning = false;
let idleStartTime = 0;

function toggleIdleMode() {
    if (isIdleRunning) {
        stopIdleMode();
    } else {
        startIdleMode();
    }
}

function startIdleMode() {
    isIdleRunning = true;
    idleStartTime = performance.now();
    const btn = document.getElementById('btnIdleMode');
    if (btn) {
        btn.textContent = "⏹ Stop Idle Routine";
        btn.style.background = "rgba(255, 0, 100, 0.3)";
        btn.style.borderColor = "#ff0055";
        btn.style.color = "#ff0055";
    }
}

function stopIdleMode() {
    isIdleRunning = false;
    setClaw(0, "STOPPED", "#ffaa00");
    const btn = document.getElementById('btnIdleMode');
    if (btn) {
        btn.textContent = "▶ Start Idle Routine";
        btn.style.background = "rgba(0, 255, 255, 0.2)";
        btn.style.borderColor = "#00ffff";
        btn.style.color = "#00ffff";
    }
}

function updateIdleRoutine(time) {
    if (!isIdleRunning) return;

    // Cycle duration: 5 seconds per complete loop
    const period = 5000;
    const progress = ((time - idleStartTime) % period) / period; // 0.0 to 1.0

    // Smooth sinusoidal motion between Y = 1.0 (down) and Y = 3.2 (up)
    // progress: 0 -> 0.5 (moves UP), 0.5 -> 1.0 (moves DOWN)
    const sinWave = (1 - Math.cos(progress * Math.PI * 2)) / 2; // 0.0 to 1.0
    const targetY = 1.0 + sinWave * 2.2;
    const targetX = 2.1;

    // Move target sphere continuously and smoothly
    sphere.position.x = targetX;
    sphere.position.y = targetY;

    // Phase 1: Going UP (progress 0.05 to 0.45) -> Claw OPENS at same time
    if (progress > 0.05 && progress < 0.45) {
        setClaw(-configuredClawSpeed, "OPENING (Going Up)", "#00ff88");
    }
    // Phase 2: Going DOWN (progress 0.55 to 0.95) -> Claw CLOSES at same time
    else if (progress > 0.55 && progress < 0.95) {
        setClaw(configuredClawSpeed, "CLOSING (Going Down)", "#ff0055");
    }
    // Brief pause at inflection points
    else {
        setClaw(0, "RESTING", "#ffaa00");
    }
}


// Animation Loop
function animate(time) {
    requestAnimationFrame(animate);

    // Run smooth Idle routine if active
    if (typeof updateIdleRoutine === 'function') {
        updateIdleRoutine(time);
    }

    const tx = sphere.position.x - shoulderJoint.position.x;
    const ty = sphere.position.y - shoulderJoint.position.y;
    const dist = Math.sqrt(tx * tx + ty * ty);
    const reach = THREE.MathUtils.clamp(dist, 0.1, L1 + L2 - 0.01);

    // 1. Base Rotation
    const targetBaseRot = (tx < 0) ? Math.PI : 0;
    currentBaseRotation = THREE.MathUtils.lerp(currentBaseRotation, targetBaseRot, smoothing);
    shoulderJoint.rotation.y = currentBaseRotation;

    // 2. IK Solver
    const localX = Math.abs(tx);
    const targetAngle = Math.atan2(ty, localX);
    const cosA = (L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach);
    const angleA = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
    const cosB = (L1 * L1 + L2 * L2 - reach * reach) / (2 * L1 * L2);
    const angleB = Math.acos(THREE.MathUtils.clamp(cosB, -1, 1));

    const targetShoulder = targetAngle + angleA;
    const targetElbow = -(Math.PI - angleB);

    currentShoulderAngle = THREE.MathUtils.lerp(currentShoulderAngle, targetShoulder, smoothing);
    currentElbowAngle = THREE.MathUtils.lerp(currentElbowAngle, targetElbow, smoothing);

    shoulderJoint.rotation.z = currentShoulderAngle;
    elbowJoint.rotation.z = currentElbowAngle;

    // 3. UI Display
    const bD = Math.round(currentBaseRotation * (180 / Math.PI));
    const sD = Math.round((currentShoulderAngle) * (180 / Math.PI));
    const eD = Math.round((currentElbowAngle) * (180 / Math.PI));
    updateAngleDisplay(bD, sD, eD);

    // 4. --- DATA SENDING (only send when changed) ---
    if (time - lastSendTime > sendInterval) {
        if (isSerialConnected) {
            const data = prepareRobotData();
            
            if (data !== lastSentData) {
                lastSentData = data;
                if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                    wsClient.send(data);
                } else {
                    fetch('/api/control', {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: data
                    }).catch(() => {});
                }
                console.log("📤 Streaming:", data.trim());
            }
        }
        lastSendTime = time;
    }

    // Visuals
    sphereGlow.position.copy(sphere.position);
    pointLight.position.set(sphere.position.x * 0.5, sphere.position.y * 0.5, 2);
    coordinateDiv.innerHTML = `🤖 <b>Target:</b> ${sphere.position.x.toFixed(2)}, ${sphere.position.y.toFixed(2)}<br>🛰 <b>Status:</b> ${isSerialConnected ? 'ONLINE' : 'OFFLINE'}`;

    composer.render();
}

animate();

window.addEventListener('resize', () => {
    adjustCameraForScreen();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Function to handle start of interaction
function onPointerDown(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.intersectObject(sphere).length > 0) {
        isDragging = true;
    }
}

// Function to handle movement
function onPointerMove(clientX, clientY) {
    if (!isDragging) return;
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    
    const planeXY = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersection = new THREE.Vector3();
    raycaster.setFromCamera(mouse, camera);
    
    if (raycaster.ray.intersectPlane(planeXY, intersection)) {
        sphere.position.x = intersection.x;
        // Keep it above ground, but allow some range
        sphere.position.y = Math.max(0, intersection.y);
    }
}

// Mouse Listeners
document.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
document.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
document.addEventListener('mouseup', () => isDragging = false);

// --- TOUCH LISTENERS FOR MOBILE ---
document.addEventListener('touchstart', (e) => {
    // If touching controls card or buttons, do not drag the 3D scene
    if (e.target.closest('#anglesDisplay') || e.target.closest('#serialUI') || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') {
        return;
    }
    e.preventDefault(); 
    const touch = e.touches[0];
    onPointerDown(touch.clientX, touch.clientY);
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (e.target.closest('#anglesDisplay') || e.target.closest('#serialUI') || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') {
        return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    onPointerMove(touch.clientX, touch.clientY);
}, { passive: false });

document.addEventListener('touchend', () => {
    isDragging = false;
});
document.addEventListener('DOMContentLoaded', initWebSocket);


