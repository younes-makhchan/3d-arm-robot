with open("web_ui/main.js", "r", encoding="utf-8") as f:
    text = f.read()

# Cut out the entire idle animation block from the bottom
split_marker = "// --- IDLE ANIMATION ROUTINE"
if split_marker in text:
    parts = text.split(split_marker)
    base_code = parts[0]
    idle_code = split_marker + parts[1]

    # Insert idle_code ABOVE animate() function
    target_insert = "// Animation Loop\nfunction animate(time) {"
    if target_insert in base_code:
        base_code = base_code.replace(target_insert, idle_code + "\n\n" + target_insert, 1)
        text = base_code

with open("web_ui/main.js", "w", encoding="utf-8") as f:
    f.write(text)

print("HOISTED IDLE VARIABLES ABOVE ANIMATE()")

