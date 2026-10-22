with open("web_ui/index.html", "r", encoding="utf-8") as f:
    text = f.read()

target = '<script src="main.js"></script>'
replacement = '<script src="main.js?v=2"></script>'

if target in text:
    text = text.replace(target, replacement, 1)
    with open("web_ui/index.html", "w", encoding="utf-8") as f:
        f.write(text)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
