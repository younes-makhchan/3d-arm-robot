
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

