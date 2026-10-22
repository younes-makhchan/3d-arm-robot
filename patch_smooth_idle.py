with open("web_ui/main.js", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update animate function to call updateIdleRoutine(time)
target_anim = """// Animation Loop
function animate(time) {
    requestAnimationFrame(animate);

    const tx = sphere.position.x - shoulderJoint.position.x;"""

replacement_anim = """// Animation Loop
function animate(time) {
    requestAnimationFrame(animate);

    // Run smooth Idle routine if active
    if (typeof updateIdleRoutine === 'function') {
        updateIdleRoutine(time);
    }

    const tx = sphere.position.x - shoulderJoint.position.x;"""

if target_anim in text:
    text = text.replace(target_anim, replacement_anim, 1)

# 2. Replace the old idle logic at the bottom
with open("new_idle_logic.js", "r", encoding="utf-8") as f:
    new_idle = f.read()

split_marker = "// --- IDLE ANIMATION ROUTINE"
if split_marker in text:
    base_part = text.split(split_marker)[0]
    text = base_part + new_idle

with open("web_ui/main.js", "w", encoding="utf-8") as f:
    f.write(text)

print("SMOOTH IDLE APPLIED SUCCESSFULLY")

