
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
camera.position.set(0, 0, -10); 
camera.lookAt(0, 0, 0); 

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

// --- SERIAL COMMUNICATION LOGIC ---
let port;
let writer;
let isSerialConnected = false;
let lastSendTime = 0;
const sendInterval = 50; // Set to 50ms for smooth real-time control
const encoder = new TextEncoder(); // Converts string to bytes

async function connectSerial() {
    try {
        const res = await fetch('/api/status');
        if (res.ok) {
            isSerialConnected = true;
            updateConnectionStatus("Connected (Wi-Fi)");
            console.log("🚀 CyberBrick Wi-Fi Bridge Connected!");
        } else {
            throw new Error("Bridge offline");
        }
    } catch (err) {
        // Even if direct fetch fails, allow manual toggle
        isSerialConnected = !isSerialConnected;
        updateConnectionStatus(isSerialConnected ? "Connected (Wi-Fi)" : "Disconnected");
    }
}

async function readLoop() {
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

function prepareRobotData() {
    if (isManualDebug) {
        return `B${debugB},S${debugS},E${debugE}\n`;
    }
    const baseDeg = Math.round(currentBaseRotation * (180 / Math.PI));
    const shoulderDeg = Math.round(currentShoulderAngle * (180 / Math.PI)) + SHOULDER_OFFSET;
    // Elbow IK angle is always negative -- abs() maps it to 0-180
    const rawElbow = Math.abs(Math.round(currentElbowAngle * (180 / Math.PI)));
    const elbowDeg = ELBOW_INVERT ? (180 - rawElbow) : rawElbow;
    return `B${baseDeg},S${shoulderDeg},E${elbowDeg}\n`;
}

function updateAngleDisplay(baseDeg, shoulderDeg, elbowDeg) {
    if (isManualDebug) {
        baseDeg = debugB;
        shoulderDeg = debugS;
        elbowDeg = debugE;
    }
    const b = document.getElementById('baseAngle');
    const s = document.getElementById('shoulderAngle');
    const e = document.getElementById('elbowAngle');
    if (b) b.textContent = baseDeg;
    if (s) s.textContent = shoulderDeg;
    if (e) e.textContent = elbowDeg;
}

// Mouse controls
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false;
let currentShoulderAngle = 0, currentElbowAngle = 0, currentBaseRotation = 0;
const smoothing = 0.08;

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

// Animation Loop
function animate(time) {
    requestAnimationFrame(animate);

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
    const sD = Math.round(currentShoulderAngle * (180 / Math.PI));
    const eD = Math.round(currentElbowAngle * (180 / Math.PI));
    updateAngleDisplay(bD, sD, eD);

    // 4. --- DATA SENDING ---
    if (time - lastSendTime > sendInterval) {
        if (isSerialConnected) {
            const data = prepareRobotData();
            
            fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: data
            }).catch(err => {
                console.error("Wi-Fi bridge error:", err);
            });

            console.log("📤 Sending via Wi-Fi:", data.trim());
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
    // Prevent scrolling while touching the robot area
    if (e.target.tagName !== 'BUTTON') e.preventDefault(); 
    const touch = e.touches[0];
    onPointerDown(touch.clientX, touch.clientY);
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (e.target.tagName !== 'BUTTON') e.preventDefault();
    const touch = e.touches[0];
    onPointerMove(touch.clientX, touch.clientY);
}, { passive: false });

document.addEventListener('touchend', () => {
    isDragging = false;
});